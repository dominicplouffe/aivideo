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

function RecordFlow({ onDone }: { onDone: (projectId: string) => void }) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [events, setEvents] = useState<CapturedEvent[]>([]);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const [withMic, setWithMic] = useState(true);
  const [withCamera, setWithCamera] = useState(false);
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
      if (withMic) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          combined = new MediaStream([...display.getTracks(), ...mic.getAudioTracks()]);
        } catch {
          // Microphone denied — continue with screen only rather than failing the take.
        }
      }

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
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setBlobUrl(URL.createObjectURL(blob));
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
          // Synthesise plausible intent events so the panel shows what the
          // real recorder captures. The desktop app reads these from the OS.
          if (next % 4 === 0) {
            setEvents((prev) =>
              [
                {
                  at: next,
                  kind: (["click", "scroll", "key", "route"] as const)[next % 4],
                  label:
                    next % 4 === 0
                      ? "button#new-shipment"
                      : next % 4 === 1
                        ? "table.shipments"
                        : next % 4 === 2
                          ? "input#origin"
                          : "/shipments/new",
                },
                ...prev,
              ].slice(0, 8),
            );
          }
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

  const process = () => {
    setPhase("processing");
    setProgress(0);
    const steps = 60;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setProgress(i / steps);
      if (i >= steps) {
        clearInterval(id);
        onDone(projects[0].id);
      }
    }, 55);
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
              <Toggle label="Camera bubble" hint="Background removed automatically" icon="avatar" on={withCamera} onChange={setWithCamera} />
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
              {withCamera ? (
                <span className="absolute right-4 bottom-4 flex size-20 items-center justify-center rounded-full border-2 border-white/15 bg-gradient-to-br from-ink-700 to-ink-850">
                  <Icon name="avatar" className="size-8 text-fg-faint" strokeWidth={1.3} />
                </span>
              ) : null}
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

        <Panel title="Intent stream" description="Captured alongside the frames">
          <ul className="max-h-[22rem] divide-y divide-[var(--line)] overflow-y-auto">
            {events.length === 0 ? (
              <li className="px-5 py-6 text-center text-[0.8125rem] text-fg-subtle">
                Interactions appear here as you click.
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
            <div className="mt-5 flex flex-wrap gap-3">
              <Button size="md" onClick={process}>
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
  return <Processing progress={progress} />;
}

/* ============================================================ import */

function ImportFlow({ onDone }: { onDone: (id: string) => void }) {
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [link, setLink] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const run = () => {
    setProgress(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setProgress(i / 60);
      if (i >= 60) {
        clearInterval(id);
        onDone(projects[1].id);
      }
    }, 55);
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
              setFiles(Array.from(e.dataTransfer.files).map((f) => ({ name: f.name, size: f.size })));
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
              onChange={(e) =>
                setFiles(Array.from(e.target.files ?? []).map((f) => ({ name: f.name, size: f.size })))
              }
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
              <Button variant="secondary" size="sm" onClick={() => setFiles([{ name: link || "Imported link", size: 412_103_448 }])}>
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

          <Button size="md" className="mt-6" disabled={files.length === 0} onClick={run}>
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
