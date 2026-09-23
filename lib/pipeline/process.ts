import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getRecording, setStatus, attachStillness, attachTranscript } from "@/lib/db/repositories/recordings";
import { detectStillness } from "./stillness";
import { replaceSegments, setProjectStatus } from "@/lib/db/repositories/projects";
import { getStorage } from "@/lib/storage";
import { providersFor } from "@/lib/providers/for-workspace";
import { editedDuration, segmentTranscript } from "./segment";
import { applyGlossary, keytermsFor } from "./glossary";
import { listGlossary } from "@/lib/db/repositories/glossary";

/**
 * Everything between "a take finished uploading" and "there is something to
 * edit".
 *
 * This lives outside the route handler on purpose. The same work has to be
 * callable from a retry button, from the queue worker, and from a test, and
 * a pipeline that only exists inside an HTTP handler is one that can only be
 * run by a browser that stayed open.
 *
 * It is deliberately idempotent: running it twice on the same project
 * replaces the segments rather than appending a second copy of them. Retries
 * are the normal case here, not the exceptional one.
 */

export type ProcessOutcome =
  | { ok: true; segments: number; durationSec: number; provider: string; words: number }
  | { ok: false; reason: string };

async function measureStillness(recordingId: string, bytes: Uint8Array): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "demoriff-still-"));
  try {
    const file = path.join(dir, "take.webm");
    await writeFile(file, bytes);
    await attachStillness(recordingId, await detectStillness(file));
  } catch (error) {
    console.warn(`[process] stillness not measured for ${recordingId}:`, error instanceof Error ? error.message : error);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function processProject(
  workspaceId: string,
  projectId: string,
): Promise<ProcessOutcome> {
  const [project] = await getDb()
    .select()
    .from(s.projects)
    .where(eq(s.projects.id, projectId))
    .limit(1);

  if (!project || project.workspaceId !== workspaceId) {
    return { ok: false, reason: "That project does not exist in this workspace." };
  }
  if (!project.recordingId) {
    return { ok: false, reason: "That project has no recording attached to transcribe." };
  }

  const recording = await getRecording(workspaceId, project.recordingId);
  if (!recording) {
    return { ok: false, reason: "That project's recording is missing." };
  }
  if (!recording.mediaKey) {
    return { ok: false, reason: "That recording's media never finished uploading." };
  }

  const { providers } = await providersFor(workspaceId);

  try {
    await setStatus(recording.id, "transcribing");
    await setProjectStatus(projectId, "processing");

    // The bytes rather than a URL. The recording sits in workspace-scoped
    // storage behind a session cookie, and on most installations it is on a
    // laptop no vendor can route to. Handing over the bytes is the only form
    // of this that works everywhere, and the only one that does not require
    // publishing a customer's screen to fetch it back.
    const bytes = await getStorage().get({ workspaceId, path: recording.mediaKey });

    // Where the picture stands still, for fitting narration to it later.
    // Best effort: a machine without ffmpeg still gets a transcript, and the
    // retimer treats an unmeasured take as all motion.
    void measureStillness(recording.id, bytes);

    // The workspace's own spellings: given to the transcriber so they come
    // back right, and applied to whatever still comes back wrong.
    const glossary = await listGlossary(workspaceId);
    const heard = await providers.transcription.transcribe({
      media: { bytes, contentType: "video/webm" },
      keyterms: keytermsFor(glossary),
    });
    const corrected = applyGlossary(heard.words, glossary);
    const transcript = { ...heard, words: corrected.words };

    const drafts = segmentTranscript(transcript);

    await attachTranscript(recording.id, {
      language: transcript.language,
      words: transcript.words,
    });
    await replaceSegments(projectId, drafts);

    // Prefer the transcript's duration over the browser's hint: the browser
    // measures a MediaRecorder blob whose header says nothing, and has been
    // known to report `Infinity` for it.
    const sourceDurationSec =
      transcript.durationSec > 0 ? transcript.durationSec : (recording.durationSec ?? 0);

    await getDb()
      .update(s.projects)
      .set({ sourceDurationSec, status: "ready", updatedAt: new Date() })
      .where(eq(s.projects.id, projectId));

    return {
      ok: true,
      segments: drafts.length,
      durationSec: editedDuration(drafts),
      provider: providers.transcription.name,
      words: transcript.words.length,
    };
  } catch (error) {
    // Both rows get the bad news. A project stuck on "processing" with a
    // recording that says "ready" is the state that makes somebody reload
    // the page for ten minutes waiting for something that already failed.
    await setProjectStatus(projectId, "failed").catch(() => {});
    await setStatus(recording.id, "failed").catch(() => {});
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Transcription failed.",
    };
  }
}
