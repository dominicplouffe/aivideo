"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn, formatBytes, formatDuration } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Panel } from "./Shared";
import { brandKits, voices, collections, projects } from "@/lib/app-data";

type Mode = "record" | "import" | "agent";
type Phase = "setup" | "live" | "review" | "processing";

interface CapturedEvent {
  at: number;
  kind: "click" | "key" | "scroll" | "route";
  label: string;
}

/* ============================================================ */

export function Recorder() {
  const params = useSearchParams();
  const router = useRouter();
  const initialMode = (params.get("mode") as Mode) ?? "record";
  const [mode, setMode] = useState<Mode>(
    ["record", "import", "agent"].includes(initialMode) ? initialMode : "record",
  );

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 inline-flex items-center gap-1 rounded-xl border border-[var(--line)] bg-ink-900 p-1">
          {([
            { id: "record", label: "Record", icon: "record" },
            { id: "import", label: "Import", icon: "upload" },
            { id: "agent", label: "Brief the agent", icon: "sparkles" },
          ] as { id: Mode; label: string; icon: IconName }[]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[0.8125rem] font-medium transition-colors",
                mode === t.id ? "bg-ink-750 text-fg-strong" : "text-fg-subtle hover:text-fg",
              )}
            >
              <Icon name={t.icon} className="size-4" strokeWidth={1.8} />
              {t.label}
            </button>
          ))}
        </div>

        {mode === "record" ? <RecordFlow onDone={(id) => router.push(`/app/studio/${id}`)} /> : null}
        {mode === "import" ? <ImportFlow onDone={(id) => router.push(`/app/studio/${id}`)} /> : null}
        {mode === "agent" ? <AgentFlow onDone={(id) => router.push(`/app/studio/${id}`)} /> : null}
      </div>
    </div>
  );
}

/* ============================================================ record */

/** The server's own words where it gave any, rather than a status code. */
async function messageFrom(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `That step failed (${response.status}).`;
}

/**
 * How long the take runs, read from the recording itself.
 *
 * A WebM produced by `MediaRecorder` has no duration in its header, so a
 * browser reports `Infinity` until it has seen the end. Seeking to the far
 * end forces it to resolve. Returns null rather than guessing when it will
 * not: a wrong duration is worse than none, because everything downstream
 * treats it as fact.
 */
async function durationOf(url: string | null): Promise<number | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const probe = document.createElement("video");
    const done = (value: number | null) => {
      probe.src = "";
      resolve(value);
    };
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      if (Number.isFinite(probe.duration) && probe.duration > 0) return done(probe.duration);
      probe.currentTime = 1e101;
      probe.ontimeupdate = () => {
        probe.ontimeupdate = null;
        done(Number.isFinite(probe.duration) && probe.duration > 0 ? probe.duration : null);
      };
    };
    probe.onerror = () => done(null);
    setTimeout(() => done(null), 5000);
    probe.src = url;
  });
}

function RecordFlow({ onDone }: { onDone: (projectId: string) => void }) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [events, setEvents] = useState<CapturedEvent[]>([]);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  // Kept alongside the object URL: the URL is for the <video> element, the
  // blob is what gets uploaded. Revoking one must not lose the other.
  const [blob, setBlob] = useState<Blob | null>(null);
  const [audioCaptured, setAudioCaptured] = useState<boolean | null>(null);

  const [withMic, setWithMic] = useState(true);
  const [withSystemAudio, setWithSystemAudio] = useState(true);
  const [masking, setMasking] = useState(true);
  const [brandKit, setBrandKit] = useState(brandKits[0].id);
  const [voice, setVoice] = useState(voices[0].id);
  const [collection, setCollection] = useState(collections[0]);
  const [title, setTitle] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => {
    stopTracks();
    if (tickRef.current) clearInterval(tickRef.current);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
  }, [stopTracks, blobUrl]);

  const start = async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      setError(
        "This browser does not expose screen capture. Chrome, Edge and Safari 17+ support it, or use the desktop app.",
      );
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: withSystemAudio,
      });

      let combined = display;
      let gotAudio = display.getAudioTracks().length > 0;

      if (withMic) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          combined = new MediaStream([...display.getTracks(), ...mic.getAudioTracks()]);
          gotAudio = gotAudio || mic.getAudioTracks().length > 0;
        } catch {
          // The take continues without the microphone — losing a recording
          // over a permission prompt would be worse. But it is *said*, now,
          // and before a word is spoken: the previous version swallowed this
          // and handed back a silent take with nothing to explain it.
          setError(
            "Your microphone was not available, so this take has no narration. " +
              "Check the browser's microphone permission for this site, then start again.",
          );
        }
      }
      setAudioCaptured(gotAudio);

      streamRef.current = combined;
      if (videoRef.current) {
        videoRef.current.srcObject = display;
        await videoRef.current.play().catch(() => {});
      }

      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const rec = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
      rec.ondataavailable = (e) => {
        if (e.data.size) {
          chunksRef.current.push(e.data);
          setBytes((b) => b + e.data.size);
        }
      };
      rec.onstop = () => {
        const recorded = new Blob(chunksRef.current, { type: "video/webm" });
        setBlob(recorded);
        setBlobUrl(URL.createObjectURL(recorded));
        setPhase("review");
      };
      rec.start(1000);
      recorderRef.current = rec;

      // The browser's own "Stop sharing" control should end the take too.
      display.getVideoTracks()[0]?.addEventListener("ended", () => stop());

      setElapsed(0);
      setBytes(0);
      setEvents([]);
      setPhase("live");

      tickRef.current = setInterval(() => {
        setElapsed((s) => {
          const next = s + 1;
          // No interaction log here, and none invented. A tab captured
          // through `getDisplayMedia` gives pixels and nothing else — the
          // browser will not tell one page what a different one was
          // clicked on, which is the entire reason the extension exists.
          // The previous version filled this panel with hardcoded
          // selectors like `button#new-shipment`, which read as though the
          // recorder had understood the screen.
          return next;
        });
      }, 1000);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(
        message.includes("Permission") || message.includes("denied")
          ? "Screen capture was declined. Grant permission and try again."
          : `Could not start capture: ${message}`,
      );
    }
  };

  const stop = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    stopTracks();
  };

  /**
   * Turns the take into a project.
   *
   * Three steps, each restartable on its own: reserve a recording, send the
   * bytes into it, then create the project that points at it. The previous
   * version of this function was a `setInterval` counting to sixty and then
   * navigating to a seeded fixture — the recording was discarded, nothing
   * was created, and the destination was somebody else's demo.
   *
   * Progress is reported per step rather than on a timer. A bar that moves
   * on its own clock tells you how long somebody guessed it would take; this
   * one tells you where it actually is, and stops where it actually failed.
   */
  const process = async () => {
    if (!blob) {
      setError("There is nothing to process — the take recorded no data.");
      return;
    }
    if (!title.trim()) {
      // Checked before anything is sent. Failing after a 40 MB upload
      // because of an empty text field is a special kind of rude.
      setError("Give the recording a name before processing it.");
      setPhase("review");
      return;
    }

    setPhase("processing");
    setError(null);
    setProgress(0.02);
    setStage("Reserving the take…");

    try {
      const created = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "upload" }),
      });
      if (!created.ok) throw new Error(await messageFrom(created));
      const { id: recordingId } = (await created.json()) as { id: string };

      setProgress(0.1);
      setStage(`Uploading ${formatBytes(blob.size)}…`);

      // The duration comes from the element that just played it back; the
      // server would otherwise have to probe the file to learn it.
      const duration = await durationOf(blobUrl);
      const query = new URLSearchParams();
      if (duration) query.set("duration", String(duration));

      const uploaded = await fetch(
        `/api/recordings/${recordingId}/media?${query.toString()}`,
        { method: "PUT", headers: { "Content-Type": "video/webm" }, body: blob },
      );
      if (!uploaded.ok) throw new Error(await messageFrom(uploaded));

      setProgress(0.6);
      setStage("Creating the project…");

      const project = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recording_id: recordingId, title: title.trim() }),
      });
      if (!project.ok) throw new Error(await messageFrom(project));
      const body = (await project.json()) as { project: { id: string } };

      setProgress(0.72);
      setStage("Transcribing…");

      // Deliberately not fire-and-forget. The Studio is unusable without a
      // transcript — it is a text editor for video — so arriving there
      // before one exists is arriving at an empty room. The project row
      // already exists either way, which is what makes the failure below
      // recoverable rather than terminal.
      const processed = await fetch(`/api/projects/${body.project.id}/process`, {
        method: "POST",
      });

      if (!processed.ok) {
        const reason = await messageFrom(processed);
        throw new Error(
          `The take uploaded, but transcription failed: ${reason} It is saved in ` +
            `your projects, and you can retry it from there.`,
        );
      }

      setProgress(1);
      setStage("Done");
      onDone(body.project.id);
    } catch (cause) {
      // Back to review, with the take intact. A failed upload must not cost
      // somebody the recording they just made.
      setError(cause instanceof Error ? cause.message : String(cause));
      setStage("");
      setProgress(0);
      setPhase("review");
    }
  };

  /* ---------------- setup ---------------- */
  if (phase === "setup") {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Panel title="Capture" description="Nothing is uploaded until you choose to process the take.">
          <div className="p-5">
            <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-dashed border-[var(--line-strong)] bg-[#0B0D14]">
              <div className="absolute inset-0 grid-bg opacity-25" />
              <div className="relative flex flex-col items-center gap-4 text-center">
                <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-rose-500/12 text-rose-400">
                  <Icon name="record" className="size-6" strokeWidth={1.7} />
                </span>
                <div>
                  <p className="text-[0.9375rem] font-medium text-fg-strong">Ready when you are</p>
                  <p className="mt-1.5 max-w-sm text-[0.8125rem] leading-relaxed text-fg-subtle">
                    Pick a tab, a window or the whole screen. Walk through the flow talking the way
                    you would to a colleague — ums and wrong turns are handled.
                  </p>
                </div>
                <Button size="md" onClick={start}>
                  <Icon name="record" className="size-4" strokeWidth={2} />
                  Start recording
                </Button>
              </div>
            </div>

            {error ? (
              <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/[0.07] p-3.5 text-[0.8125rem] leading-relaxed text-rose-300">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0" strokeWidth={1.9} />
                {error}
              </p>
            ) : null}

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Toggle label="Microphone" hint="Recorded as its own track" icon="mic" on={withMic} onChange={setWithMic} />
              <Toggle label="System audio" hint="Your app's own sound" icon="volume" on={withSystemAudio} onChange={setWithSystemAudio} />
              <Toggle label="Masking policy" hint="Enforced by your workspace" icon="shield" on={masking} onChange={setMasking} locked />
            </div>
          </div>
        </Panel>

        <SetupSidebar
          title={title} setTitle={setTitle}
          collection={collection} setCollection={setCollection}
          brandKit={brandKit} setBrandKit={setBrandKit}
          voice={voice} setVoice={setVoice}
        />
      </div>
    );
  }

  /* ---------------- live ---------------- */
  if (phase === "live") {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Panel
          title="Recording"
          action={
            <span className="inline-flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/12 px-2.5 py-1 font-mono text-2xs text-rose-300">
              <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
              REC {formatDuration(elapsed)}
            </span>
          }
        >
          <div className="p-5">
            <div className="relative aspect-video overflow-hidden rounded-xl border-2 border-rose-500/40 bg-black">
              <video ref={videoRef} muted playsInline className="size-full object-contain" />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button variant="danger" size="md" onClick={stop}>
                <Icon name="pause" className="size-4" strokeWidth={2.2} />
                Stop recording
              </Button>
              <span className="font-mono text-2xs text-fg-faint">{formatBytes(bytes)} captured</span>
              <span className="ml-auto text-[0.75rem] text-fg-subtle">
                Fumbled a line? Pause two seconds and say it again — the clean take wins.
              </span>
            </div>
          </div>
        </Panel>

        <Panel title="Intent stream" description="Which element, not just where">
          <ul className="max-h-[22rem] divide-y divide-[var(--line)] overflow-y-auto">
            {events.length === 0 ? (
              <li className="space-y-2 px-5 py-6 text-[0.8125rem] leading-relaxed text-fg-subtle">
                <p>
                  Browser capture records pixels only — a page cannot be told what
                  was clicked in a different one.
                </p>
                <p className="text-fg-faint">
                  Record with the extension to capture the interaction log, which
                  is what automatic zoom and the written guide are built from.
                </p>
              </li>
            ) : (
              events.map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="font-mono text-2xs text-fg-faint">{formatDuration(e.at)}</span>
                  <span className="rounded bg-ink-850 px-1.5 py-0.5 font-mono text-2xs text-cyan-300">
                    {e.kind}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-2xs text-fg-muted">{e.label}</span>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-[var(--line)] px-5 py-3">
            <p className="flex items-center gap-2 text-2xs text-fg-faint">
              <Icon name="shield" className="size-3.5 text-mint-400" strokeWidth={1.9} />
              Masking applied before encoding
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  /* ---------------- review ---------------- */
  if (phase === "review") {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Panel title="Review your take" description={`${formatDuration(elapsed)} captured · ${formatBytes(bytes)}`}>
          <div className="p-5">
            <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-black">
              {blobUrl ? (
                <video src={blobUrl} controls className="aspect-video w-full" />
              ) : (
                <div className="flex aspect-video items-center justify-center text-fg-faint">
                  <Icon name="play" className="size-8" />
                </div>
              )}
            </div>
            {audioCaptured === false ? (
              <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-3.5 text-[0.8125rem] leading-relaxed text-amber-300">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0" strokeWidth={1.9} />
                This take has no audio track. Play it back before processing —
                if you expected narration, the microphone was not captured.
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/[0.07] p-3.5 text-[0.8125rem] leading-relaxed text-rose-300">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0" strokeWidth={1.9} />
                {error}
              </p>
            ) : null}

            <div className="mt-5">
              <label htmlFor="take-name" className="text-[0.8125rem] font-medium text-fg">
                Name
              </label>
              <p className="mb-1.5 mt-0.5 text-2xs text-fg-faint">
                What this becomes in your project library. Required.
              </p>
              <input
                id="take-name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Shipments walkthrough"
                className="h-11 w-full rounded-xl border border-[var(--line)] bg-ink-900 px-3.5 text-[0.875rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none"
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button size="md" onClick={process} disabled={!title.trim() || !blob}>
                <Icon name="sparkles" className="size-4" strokeWidth={2} />
                Process this take
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() => {
                  if (blobUrl) URL.revokeObjectURL(blobUrl);
                  setBlobUrl(null);
                  setPhase("setup");
                }}
              >
                Record again
              </Button>
              {blobUrl ? (
                <a
                  href={blobUrl}
                  download="demoriff-take.webm"
                  className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
                >
                  <Icon name="download" className="size-4" strokeWidth={1.8} />
                  Download raw
                </a>
              ) : null}
            </div>
          </div>
        </Panel>

        <Panel title="Will be produced">
          <ul className="divide-y divide-[var(--line)]">
            {[
              { i: "play" as IconName, l: "Directed demo video", m: "4K · zooms keyframed to clicks" },
              { i: "doc" as IconName, l: "Step-by-step guide", m: "Annotated screenshots · free" },
              { i: "cursor" as IconName, l: "Interactive tour", m: "From the captured DOM" },
              { i: "scissors" as IconName, l: "Social cuts", m: "9:16, subject tracked" },
            ].map((o) => (
              <li key={o.l} className="flex items-center gap-3 px-5 py-3">
                <Icon name={o.i} className="size-4 shrink-0 text-iris-400" strokeWidth={1.8} />
                <span className="min-w-0">
                  <span className="block text-[0.8125rem] text-fg">{o.l}</span>
                  <span className="block text-2xs text-fg-faint">{o.m}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    );
  }

  /* ---------------- processing ---------------- */
  // The label is the step actually running, not a script of steps somebody
  // expected. When it stops, it stops on the one that failed.
  return <Processing progress={progress} label={stage || "Processing take"} />;
}

/* ============================================================ import */

function ImportFlow({ onDone }: { onDone: (id: string) => void }) {
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  // The File objects themselves, not just their names: the previous version
  // kept only name and size, which is everything except the thing to upload.
  const [picked, setPicked] = useState<File[] | null>(null);
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Imports a file through exactly the path a recording takes.
   *
   * Same three calls, same rows, same result — an imported video and a
   * captured one are the same thing to everything downstream, and a second
   * code path for them would be a second place for this to rot.
   */
  const run = async () => {
    const file = picked?.[0];
    if (!file) {
      setError("Choose a video file first.");
      return;
    }
    if (!name.trim()) {
      setError("Give the import a name.");
      return;
    }

    setError(null);
    setProgress(0.02);

    try {
      const created = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "upload" }),
      });
      if (!created.ok) throw new Error(await messageFrom(created));
      const { id } = (await created.json()) as { id: string };

      setProgress(0.15);
      const uploaded = await fetch(`/api/recordings/${id}/media`, {
        method: "PUT",
        headers: { "Content-Type": file.type || "video/webm" },
        body: file,
      });
      if (!uploaded.ok) throw new Error(await messageFrom(uploaded));

      setProgress(0.65);
      const project = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recording_id: id, title: name.trim() }),
      });
      if (!project.ok) throw new Error(await messageFrom(project));
      const body = (await project.json()) as { project: { id: string } };

      setProgress(0.75);
      const processed = await fetch(`/api/projects/${body.project.id}/process`, {
        method: "POST",
      });
      if (!processed.ok) {
        throw new Error(
          `The file uploaded, but transcription failed: ${await messageFrom(processed)} ` +
            `It is saved in your projects, and you can retry it from there.`,
        );
      }

      setProgress(1);
      onDone(body.project.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setProgress(null);
    }
  };

  if (progress !== null) return <Processing progress={progress} label="Analysing imported footage" />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Panel title="Import existing video" description="Runs the same pipeline as a native recording.">
        <div className="p-5">
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const dropped = Array.from(e.dataTransfer.files);
              setPicked(dropped);
              setFiles(dropped.map((f) => ({ name: f.name, size: f.size })));
              if (!name && dropped[0]) setName(dropped[0].name.replace(/\.[^.]+$/, ""));
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
              dragging ? "border-iris-500/60 bg-iris-500/[0.06]" : "border-[var(--line-strong)] hover:border-[var(--line-strong)]",
            )}
          >
            <input
              type="file"
              accept="video/*,audio/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                const chosen = Array.from(e.target.files ?? []);
                setPicked(chosen);
                setFiles(chosen.map((f) => ({ name: f.name, size: f.size })));
                if (!name && chosen[0]) setName(chosen[0].name.replace(/\.[^.]+$/, ""));
              }}
            />
            <Icon name="upload" className="size-7 text-iris-400" strokeWidth={1.6} />
            <span>
              <span className="block text-[0.9375rem] font-medium text-fg-strong">
                Drop video files, or click to browse
              </span>
              <span className="mt-1 block font-mono text-2xs text-fg-faint">
                MP4 · MOV · WEBM · MKV · AVI — up to 12 GB, 4 hours
              </span>
            </span>
          </label>

          {files.length ? (
            <ul className="mt-4 space-y-2">
              {files.map((f) => (
                <li key={f.name} className="flex items-center gap-3 rounded-xl border border-[var(--line)] px-3.5 py-2.5">
                  <Icon name="play" className="size-3.5 shrink-0 text-fg-faint" />
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-fg">{f.name}</span>
                  <span className="font-mono text-2xs text-fg-faint">{formatBytes(f.size)}</span>
                  <Icon name="check" className="size-3.5 shrink-0 text-mint-400" strokeWidth={2.4} />
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-6">
            <label htmlFor="import-link" className="text-[0.8125rem] font-medium text-fg">
              Or paste a link
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="import-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://www.loom.com/share/… or a Zoom / Drive link"
                className="h-10 flex-1 rounded-xl border border-[var(--line)] bg-ink-900 px-3.5 text-[0.8125rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setError(
                    "Importing from a link is not built yet — download the file and drop it above.",
                  )
                }
              >
                Fetch
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["Loom", "Zoom", "Google Drive", "Dropbox", "Box", "YouTube", "Vimeo", "S3"].map((s) => (
                <span key={s} className="rounded-md border border-[var(--line)] px-2 py-0.5 text-2xs text-fg-subtle">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <label htmlFor="import-name" className="text-[0.8125rem] font-medium text-fg">
              Name
            </label>
            <input
              id="import-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Shipments walkthrough"
              className="mt-1.5 h-11 w-full rounded-xl border border-[var(--line)] bg-ink-900 px-3.5 text-[0.875rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none"
            />
          </div>

          {error ? (
            <p role="alert" className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/[0.07] p-3.5 text-[0.8125rem] leading-relaxed text-rose-300">
              <Icon name="alert" className="mt-0.5 size-4 shrink-0" strokeWidth={1.9} />
              {error}
            </p>
          ) : null}

          <Button
            size="md"
            className="mt-6"
            disabled={!picked?.length || !name.trim()}
            onClick={run}
          >
            <Icon name="sparkles" className="size-4" strokeWidth={2} />
            Import and analyse
          </Button>
        </div>
      </Panel>

      <Panel title="What inference can do">
        <div className="space-y-3 p-5 text-[0.8125rem] leading-relaxed text-fg-subtle">
          <p>
            Imported footage carries no interaction metadata, so click moments are inferred from
            cursor dynamics and on-screen text is read with OCR.
          </p>
          <p className="flex items-start gap-2.5 rounded-xl border border-amber-500/28 bg-amber-500/[0.06] p-3 text-amber-200/90">
            <Icon name="info" className="mt-0.5 size-3.5 shrink-0 text-amber-400" strokeWidth={2} />
            Inferred keyframes are flagged in the Studio so you can check them.
          </p>
        </div>
      </Panel>
    </div>
  );
}

/* ============================================================ agent */

function AgentFlow({ onDone }: { onDone: (id: string) => void }) {
  const [brief, setBrief] = useState("");
  const [env, setEnv] = useState("staging.meridian.app");
  const [audience, setAudience] = useState("Logistics operations buyers");
  const [length, setLength] = useState(90);
  const [progress, setProgress] = useState<number | null>(null);

  if (progress !== null) return <Processing progress={progress} label="Riff Agent is recording your product" />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Panel title="Brief Riff Agent" description="It drafts an outline first. Nothing records until you approve it.">
        <div className="space-y-5 p-5">
          <div>
            <label htmlFor="brief" className="text-[0.8125rem] font-medium text-fg">
              What should the demo cover?
            </label>
            <textarea
              id="brief"
              rows={4}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Make a 90-second demo of the new rate-shopping feature for logistics buyers. Lead with the price comparison, not the setup."
              className="mt-2 w-full resize-y rounded-xl border border-[var(--line)] bg-ink-900 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="env" className="text-[0.8125rem] font-medium text-fg">Environment</label>
              <select
                id="env"
                value={env}
                onChange={(e) => setEnv(e.target.value)}
                className="mt-2 h-10 w-full rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none"
              >
                <option>staging.meridian.app</option>
                <option>demo.meridian.app</option>
              </select>
              <p className="mt-1.5 text-2xs text-fg-faint">Allowlisted environments only.</p>
            </div>
            <div>
              <label htmlFor="audience" className="text-[0.8125rem] font-medium text-fg">Audience</label>
              <input
                id="audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className="mt-2 h-10 w-full rounded-xl border border-[var(--line)] bg-ink-900 px-3.5 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="length" className="text-[0.8125rem] font-medium text-fg">Target length</label>
              <span className="font-mono text-[0.8125rem] text-iris-300">{length}s</span>
            </div>
            <input
              id="length"
              type="range"
              min={30}
              max={300}
              step={15}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              style={{
                background: `linear-gradient(90deg, var(--color-iris-500) ${((length - 30) / 270) * 100}%, color-mix(in oklab, var(--color-fg) 12%, transparent) ${((length - 30) / 270) * 100}%)`,
              }}
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--line)] bg-ink-900 p-3.5">
            <Icon name="shield" className="mt-0.5 size-4 shrink-0 text-mint-400" strokeWidth={1.9} />
            <p className="text-[0.8125rem] leading-relaxed text-fg-subtle">
              Output lands in your review queue. Nothing the agent produces can publish to a
              customer-facing surface without a human approval.
            </p>
          </div>

          <Button
            size="md"
            disabled={brief.trim().length < 12}
            onClick={() => {
              setProgress(0);
              let i = 0;
              const id = setInterval(() => {
                i += 1;
                setProgress(i / 70);
                if (i >= 70) {
                  clearInterval(id);
                  onDone(projects[2].id);
                }
              }, 50);
            }}
          >
            <Icon name="sparkles" className="size-4" strokeWidth={2} />
            Draft the outline
          </Button>
        </div>
      </Panel>

      <Panel title="How the agent works">
        <ol className="divide-y divide-[var(--line)]">
          {[
            { t: "Reads your context", d: "Changelog, Linear issue, existing docs, previous videos" },
            { t: "Proposes an outline", d: "Beats, angle, length — you approve before it records" },
            { t: "Drives your app", d: "Isolated browser, scoped credentials, allowlisted URL" },
            { t: "Cuts and voices it", d: "Your brand kit, your house voice, your glossary" },
            { t: "Waits for you", d: "Lands in review. Never publishes on its own." },
          ].map((s, i) => (
            <li key={s.t} className="flex gap-3 px-5 py-3">
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-iris-500/15 font-mono text-2xs text-iris-300">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[0.8125rem] text-fg">{s.t}</span>
                <span className="block text-2xs leading-snug text-fg-faint">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

/* ============================================================ shared bits */

function Toggle({
  label, hint, icon, on, onChange, locked,
}: {
  label: string;
  hint: string;
  icon: IconName;
  on: boolean;
  onChange: (v: boolean) => void;
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !locked && onChange(!on)}
      aria-pressed={on}
      disabled={locked}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
        on ? "border-iris-500/40 bg-iris-500/[0.08]" : "border-[var(--line)] hover:border-[var(--line-strong)]",
        locked && "cursor-default opacity-90",
      )}
    >
      <Icon name={icon} className={cn("size-4 shrink-0", on ? "text-iris-300" : "text-fg-faint")} strokeWidth={1.8} />
      <span className="min-w-0 flex-1">
        <span className="block text-[0.8125rem] font-medium text-fg">{label}</span>
        <span className="block truncate text-2xs text-fg-faint">{hint}</span>
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          on ? "bg-iris-500" : "bg-ink-700",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
            on ? "translate-x-4.5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

function SetupSidebar({
  title, setTitle, collection, setCollection, brandKit, setBrandKit, voice, setVoice,
}: {
  title: string; setTitle: (v: string) => void;
  collection: string; setCollection: (v: string) => void;
  brandKit: string; setBrandKit: (v: string) => void;
  voice: string; setVoice: (v: string) => void;
}) {
  return (
    <Panel title="Project settings">
      <div className="space-y-4 p-5">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Rate shopping — create a shipment"
            className="h-10 w-full rounded-xl border border-[var(--line)] bg-ink-900 px-3.5 text-[0.8125rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none"
          />
        </Field>
        <Field label="Collection">
          <select
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            className="h-10 w-full rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none"
          >
            {collections.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Brand kit">
          <select
            value={brandKit}
            onChange={(e) => setBrandKit(e.target.value)}
            className="h-10 w-full rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none"
          >
            {brandKits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </Field>
        <Field label="Voice">
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="h-10 w-full rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none"
          >
            {voices.map((v) => <option key={v.id} value={v.id}>{v.name} — {v.descriptor}</option>)}
          </select>
        </Field>
      </div>
    </Panel>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-2 block text-[0.8125rem] font-medium text-fg">{label}</span>
      {children}
    </div>
  );
}

function Processing({ progress, label = "Producing your demo" }: { progress: number; label?: string }) {
  const steps = [
    "Uploading and validating the take",
    "Transcribing with word-level alignment",
    "Detecting interactions and narrative beats",
    "Removing fillers, silence and wrong turns",
    "Keyframing zooms to each interaction",
    "Synthesising narration and restoring audio",
    "Applying your brand system",
    "Rendering video, guide, tour and clips",
  ];
  const activeStep = Math.min(steps.length - 1, Math.floor(progress * steps.length));

  return (
    <Panel title={label}>
      <div className="p-6 md:p-8">
        <div className="mx-auto max-w-lg">
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-iris-500),var(--color-cyan-400))] transition-[width] duration-200"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="mt-3 text-right font-mono text-2xs text-fg-faint">
            {Math.round(progress * 100)}%
          </p>

          <ol className="mt-6 space-y-2.5">
            {steps.map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    i < activeStep
                      ? "border-mint-500/40 bg-mint-500/15 text-mint-400"
                      : i === activeStep
                        ? "border-iris-500/50 bg-iris-500/15 text-iris-300"
                        : "border-[var(--line)] text-fg-faint",
                  )}
                >
                  {i < activeStep ? (
                    <Icon name="check" className="size-3" strokeWidth={3} />
                  ) : i === activeStep ? (
                    <span className="size-1.5 rounded-full bg-current animate-pulse" />
                  ) : (
                    <span className="size-1 rounded-full bg-current opacity-40" />
                  )}
                </span>
                <span
                  className={cn(
                    "text-[0.875rem] transition-colors",
                    i <= activeStep ? "text-fg" : "text-fg-faint",
                  )}
                >
                  {s}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Panel>
  );
}
