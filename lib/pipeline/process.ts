import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getRecording, setStatus, attachStillness, attachTranscript } from "@/lib/db/repositories/recordings";
import { detectStillness } from "./stillness";
import { replaceSegments, saveVoice, setProjectStatus } from "@/lib/db/repositories/projects";
import { defaultVoiceFor } from "@/lib/db/repositories/voices";
import { getStorage } from "@/lib/storage";
import { sniffMediaType } from "@/lib/storage/media-type";
import { providersFor } from "@/lib/providers/for-workspace";
import type { TranscriptionResult } from "@/lib/providers/types";
import { probe, type ProbeResult } from "@/lib/render/ffmpeg";
import { editedDuration, segmentTranscript, type SegmentDraft } from "./segment";
import { framingFor, sampleGreyFrames } from "./framing";
import { chaptersFromCaptions, readCaptions, wordsFromChapters } from "./captions";
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
  | { ok: true; segments: number; durationSec: number; sourceDurationSec: number; provider: string; words: number }
  | { ok: false; reason: string };

async function measureStillness(recordingId: string, file: string): Promise<void> {
  try {
    await attachStillness(recordingId, await detectStillness(file));
  } catch (error) {
    console.warn(`[process] stillness not measured for ${recordingId}:`, error instanceof Error ? error.message : error);
  }
}

/** A duration that means something: ffprobe reports N/A for some takes, and a browser Infinity. */
function measured(seconds: number | null | undefined): number {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

/**
 * Chapters from captions drawn into the picture, when nothing was said.
 *
 * Best effort: a take whose captions could not be read still imports, as
 * silent footage, rather than failing over a feature it may not need.
 */
async function captionChapters(
  file: string,
  durationSec: number,
  anthropicKey: string | null,
  recordingId: string,
): Promise<SegmentDraft[]> {
  if (!anthropicKey || durationSec <= 0) return [];
  try {
    return chaptersFromCaptions(await readCaptions(file, durationSec, { apiKey: anthropicKey }), durationSec);
  } catch (error) {
    console.warn(`[process] captions not read for ${recordingId}:`, error instanceof Error ? error.message : error);
    return [];
  }
}

export async function processProject(
  workspaceId: string,
  projectId: string,
): Promise<ProcessOutcome> {
  const [project] = await getDb()
    .select()
    .from(s.projects)
    .where(and(eq(s.projects.id, projectId), eq(s.projects.workspaceId, workspaceId), isNull(s.projects.deletedAt)))
    .limit(1);

  if (!project) {
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

  const { providers, anthropic } = await providersFor(workspaceId);

  // The take on disk once, for every tool here that reads a file. Removed
  // only after the stillness pass, which outlives this request on purpose.
  let dir: string | null = null;
  let stillness: Promise<void> = Promise.resolve();

  try {
    await setStatus(recording.id, "transcribing");
    await setProjectStatus(projectId, "processing");

    // The bytes rather than a URL. The recording sits in workspace-scoped
    // storage behind a session cookie, and on most installations it is on a
    // laptop no vendor can route to. Handing over the bytes is the only form
    // of this that works everywhere, and the only one that does not require
    // publishing a customer's screen to fetch it back.
    const bytes = await getStorage().get({ workspaceId, path: recording.mediaKey });
    dir = await mkdtemp(path.join(tmpdir(), "demoriff-take-"));
    const file = path.join(dir, "take");
    await writeFile(file, bytes);

    // Where the picture stands still, for fitting narration to it later.
    // Best effort: a machine without ffmpeg still gets a transcript, and the
    // retimer treats an unmeasured take as all motion.
    stillness = measureStillness(recording.id, file);

    // What the file is, measured rather than assumed. An imported video
    // arrives with no duration hint, and the transcriber reports a take with
    // no audio track as zero seconds long — which, before this, became a
    // project with nothing to play. Null without ffprobe; everything below
    // copes.
    const probed: ProbeResult | null = await probe(file).catch(() => null);

    // The workspace's own spellings: given to the transcriber so they come
    // back right, and applied to whatever still comes back wrong.
    const glossary = await listGlossary(workspaceId);
    // Nothing to hear without an audio track, so nothing to send.
    const heard: TranscriptionResult = probed && !probed.hasAudio
      ? { language: "en", durationSec: 0, words: [] }
      : await providers.transcription.transcribe({
        media: { bytes, contentType: sniffMediaType(bytes) ?? "video/webm" },
        keyterms: keytermsFor(glossary),
      });
    const corrected = applyGlossary(heard.words, glossary);

    // The transcript's duration first, then the file's, then the browser's
    // hint: the browser measures a MediaRecorder blob whose header says
    // nothing, and has been known to report `Infinity` for it.
    const sourceDurationSec =
      measured(heard.durationSec) || measured(probed?.durationSec) || measured(recording.durationSec);
    let transcript: TranscriptionResult = { ...heard, durationSec: sourceDurationSec, words: corrected.words };

    // Nothing said: the script may be in the picture instead.
    const captioned = transcript.words.length === 0 && probed
      ? await captionChapters(file, sourceDurationSec, anthropic.key, recording.id)
      : [];
    if (captioned.length > 0) transcript = { ...transcript, words: wordsFromChapters(captioned) };

    const drafts = captioned.length > 0 ? captioned : segmentTranscript(transcript);

    // An upload has no click or cursor events, so the camera is directed from
    // the picture: each step zooms on what changed on screen during it.
    // Best effort, like the stillness pass: no ffmpeg means no zooms.
    const grey = probed ? await sampleGreyFrames(file).catch(() => null) : null;
    // A step where nothing moved keeps looking where the last one did.
    let lastFraming: ReturnType<typeof framingFor> = null;
    const framed = drafts.map((d) => {
      const zoom = (grey ? framingFor(grey, d.startSec, d.endSec) : null) ?? lastFraming;
      lastFraming = zoom;
      return { ...d, zoom };
    });

    await attachTranscript(recording.id, {
      language: transcript.language,
      words: transcript.words,
    });
    await replaceSegments(projectId, framed);

    await getDb()
      .update(s.projects)
      .set({ sourceDurationSec, status: "ready", updatedAt: new Date() })
      .where(eq(s.projects.id, projectId));

    // A script nobody spoke is one for a voice to read, so it gets one, as
    // the agent's videos do. Left alone when somebody already chose.
    if (captioned.length > 0 && !project.voiceId) {
      const voice = await defaultVoiceFor(workspaceId).catch(() => null);
      if (voice) await saveVoice(workspaceId, projectId, voice.id).catch(() => false);
    }

    return {
      ok: true,
      segments: drafts.length,
      durationSec: editedDuration(drafts),
      sourceDurationSec,
      provider: captioned.length > 0 ? "captions" : providers.transcription.name,
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
  } finally {
    const made = dir;
    if (made) void stillness.finally(() => rm(made, { recursive: true, force: true }));
  }
}
