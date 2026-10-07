"use client";

import { useEffect, useRef, useState } from "react";
import { SHOW_OPERATOR_HINTS, WORKER_COMMAND } from "@/lib/ops";
import { cn, formatBytes, formatDuration } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import type { Project } from "@/lib/app-data";
import { LOCALES } from "@/lib/locales";
import { site } from "@/lib/site";
import { CARD_SECONDS } from "@/lib/brand";

type Step = "configure" | "rendering" | "done" | "error";


/** What the worker reports about a narrated render. See lib/render/narration.ts. */
interface NarrationSummary {
  voice: { id: string; name: string };
  chapters: {
    segIndex: number;
    title: string;
    availableSec: number;
    spokenSec: number;
    pace: number;
    tempo: number;
    overrunSec: number;
    retime?: { heldSec: number; hurriedSec: number; slowedSec: number; trimmedSec: number };
  }[];
}

/**
 * `built: false` means the render worker does not produce this yet.
 *
 * Offering all four and delivering one was the previous behaviour, and it
 * was worse than offering one: a person picked "Social cuts", watched a
 * progress bar, and got a list saying "ready" next to a file that did not
 * exist. Unavailable is a thing software is allowed to be; lying is not.
 */
const formats: { id: string; label: string; meta: string; icon: IconName; built: boolean }[] = [
  { id: "video", label: "Demo video", meta: "MP4 · H.264 · cut, zoomed, captioned", icon: "play", built: true },
  { id: "guide", label: "Step-by-step guide", meta: "Markdown + real screenshots", icon: "doc", built: true },
  { id: "interactive", label: "Interactive tour", meta: "Embeddable · 6 KB runtime", icon: "cursor", built: false },
  { id: "clips", label: "Social cuts", meta: "9:16 and 1:1 cutdowns", icon: "scissors", built: false },
];

const ratios = ["16:9", "9:16", "1:1", "4:5"];
const resolutions = ["2160p", "1440p", "1080p", "720p"];

export function ExportDialog({
  project,
  duration,
  brand = null,
  kitsAvailable = false,
  onClose,
}: {
  project: Project;
  duration: number;
  /** The kit the export will wear, for saying what it adds. */
  brand?: { name: string; cards: number; logo: boolean } | null;
  /** Whether the workspace has kits at all: with none chosen, that is worth saying before the render. */
  kitsAvailable?: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("configure");
  const [picked, setPicked] = useState<string[]>(["video", "guide"]);
  const [ratio, setRatio] = useState<string[]>(["16:9"]);
  // 1080p, not 4K. The default should be the one most people want and
  // nobody regrets waiting for.
  const [resolution, setResolution] = useState("1080p");
  const [locales, setLocales] = useState<string[]>(["en-US"]);
  const [progress, setProgress] = useState(0);
  /** The step the worker reports it is on, for the line under the bar. */
  const [stage, setStage] = useState<RenderStage | null>(null);
  const [copied, setCopied] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [published, setPublished] = useState(project.status === "published");
  const [publishing, setPublishing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  const [narration, setNarration] = useState<NarrationSummary | null>(null);
  // Set when the worker that rendered ran older code than the app.
  const [staleWorker, setStaleWorker] = useState<{ worker: string; app: string } | null>(null);
  /** What this project has already produced. Null until loaded. */
  const [exports, setExports] = useState<ProjectExport[] | null>(null);

  const loadExports = async () => {
    try {
      const response = await fetch(`/api/projects/${project.id}/exports`);
      const body = (await response.json()) as { exports?: ProjectExport[] };
      setExports(response.ok ? (body.exports ?? []) : []);
    } catch {
      setExports([]);
    }
  };
  useEffect(() => {
    void loadExports();
    // Once per dialog: a finished render reloads it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * Submits the render and follows it to the end.
   *
   * The previous version counted to 45 on a timer and declared success.
   * This one submits a job, polls it, and reports what actually happened —
   * including the failure, in the worker's own words, because a render that
   * failed for a reason you can read is a render you can fix.
   */
  const submit = async () => {
    setStep("rendering");
    setProgress(0);
    setStage(null);
    setFailure(null);
    setStalled(false);

    let jobId: string;
    try {
      const response = await fetch("/api/renders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          outputs: picked,
          locales,
          video: { resolution, fps: 30, aspects: ratio },
        }),
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id) throw new Error(body.error ?? "The render was refused.");
      jobId = body.id;
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
      setStep("error");
      return;
    }

    const startedAt = Date.now();
    const poll = async (): Promise<void> => {
      const response = await fetch(`/api/renders?id=${jobId}`);
      const job = (await response.json()) as {
        status?: string;
        progress?: number;
        stage?: RenderStage | null;
        error?: string;
        outputs?: Record<string, { status: string; url?: string }>;
        narration?: NarrationSummary | null;
        worker_version?: string | null;
        app_version?: string | null;
      };

      if (job.status === "completed") {
        setProgress(1);
        setVideoUrl(job.outputs?.video?.url ?? null);
        setNarration(job.narration ?? null);
        setStaleWorker(
          job.worker_version && job.app_version && job.worker_version !== job.app_version
            ? { worker: job.worker_version, app: job.app_version }
            : null,
        );
        setStep("done");
        void loadExports();
        return;
      }
      if (job.status === "failed") {
        setFailure(job.error ?? "The render failed.");
        setStep("error");
        return;
      }

      // Queued for a while with nobody claiming it means no worker is
      // running — or one worker busy with the render before this one.
      // Saying so beats a progress bar that never moves, but it has to be
      // re-decided on every poll: the first version set this once and left
      // it set, so a job that waited its turn was reported as "no worker"
      // for the whole of its own render.
      setStalled(job.status === "queued" && Date.now() - startedAt > 15_000);
      // The worker's own figure, never an invented one: this used to add two
      // percent a poll and stop at 92, so every export looked stuck at 92%
      // for however long the encode really took.
      setProgress((p) => Math.max(p, job.progress ?? 0));
      setStage(job.stage ?? null);
      timer.current = window.setTimeout(poll, 1500);
    };

    timer.current = window.setTimeout(poll, 1200);
  };

  /**
   * Puts the rendered video on its public URL, or takes it back down.
   *
   * A separate action from rendering, and reversible in one click. The
   * dialog used to announce that outputs were "published" the moment an
   * encode finished, which is both untrue and the wrong default: finishing
   * a file is not a decision to put somebody's product on the internet.
   */
  const togglePublish = async () => {
    setPublishing(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/publish`, {
        method: published ? "DELETE" : "POST",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "That did not work.");
      }
      setPublished(!published);
      void loadExports();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPublishing(false);
    }
  };

  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const shareUrl = `${site.url.replace("https://", "")}/d/${project.slug}`;
  const billedMinutes = picked.includes("video") ? (duration / 60).toFixed(1) : "0.0";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export"
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-ink-900 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95)]"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
          <h2 className="text-[0.9375rem] font-medium text-fg-strong">
            {step === "done" ? "Rendered" : step === "error" ? "Render failed" : "Export"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-ink-850 hover:text-fg"
          >
            <Icon name="x" className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {step === "configure" ? (
            <div className="space-y-6">
              {exports && exports.length > 0 ? (
                <Section label="Your exports">
                  <ExportsList
                    exports={exports}
                    projectId={project.id}
                    slug={project.slug}
                    publishing={publishing}
                    onTogglePublish={togglePublish}
                  />
                  <p className="mt-2 text-2xs text-fg-faint">Rendering again replaces these files; a published link keeps working.</p>
                </Section>
              ) : null}

              <Section label={exports && exports.length > 0 ? "Render again" : "Outputs"}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {formats.map((f) => {
                    const on = picked.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        disabled={!f.built}
                        title={f.built ? undefined : "Not built yet"}
                        onClick={() => toggle(picked, setPicked, f.id)}
                        aria-pressed={on}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                          on ? "border-iris-500/45 bg-iris-500/[0.08]" : "border-[var(--line)]",
                          f.built ? "hover:border-[var(--line-strong)]" : "cursor-not-allowed opacity-45",
                        )}
                      >
                        <Icon
                          name={f.icon}
                          className={cn("size-4 shrink-0", on ? "text-iris-300" : "text-fg-faint")}
                          strokeWidth={1.8}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.8125rem] font-medium text-fg">{f.label}</span>
                          <span className="block truncate text-2xs text-fg-faint">
                            {f.built ? f.meta : "Not built yet"}
                          </span>
                        </span>
                        {on ? <Icon name="check" className="size-3.5 shrink-0 text-mint-400" strokeWidth={2.6} /> : null}
                      </button>
                    );
                  })}
                </div>
              </Section>

              {picked.includes("video") ? (
                <Section label="Video">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-20 text-[0.75rem] text-fg-subtle">Resolution</span>
                    {resolutions.map((r) => (
                      <Pill key={r} on={resolution === r} onClick={() => setResolution(r)}>{r}</Pill>
                    ))}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span className="w-20 text-[0.75rem] text-fg-subtle">Aspect</span>
                    {ratios.map((r) => (
                      <Pill key={r} on={ratio.includes(r)} onClick={() => toggle(ratio, setRatio, r)}>{r}</Pill>
                    ))}
                  </div>
                </Section>
              ) : null}

              <Section label="Languages">
                <div className="flex flex-wrap gap-1.5">
                  {LOCALES.map((l) => {
                    // A translated cut needs a synthesized voice to speak it,
                    // so a locale is only offerable where synthesis is. The
                    // picker used to offer twelve and render one.
                    const available = l.code === locales[0];
                    return (
                      <Pill
                        key={l.code}
                        on={locales.includes(l.code)}
                        disabled={!available}
                        onClick={() => toggle(locales, setLocales, l.code)}
                      >
                        {l.label}
                      </Pill>
                    );
                  })}
                </div>
                <p className="mt-2 text-2xs text-fg-faint">
                  Other languages need a speech synthesis provider configured. Only the source
                  language is rendered here.
                </p>
              </Section>

              <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-ink-950 px-4 py-3">
                <div>
                  <p className="text-[0.8125rem] text-fg">
                    {billedMinutes} video minutes will be billed
                  </p>
                  <p className="mt-0.5 text-2xs text-fg-faint">
                    {formatDuration(duration + (brand?.cards ?? 0) * CARD_SECONDS)} finished · billed from the encoded output, not this estimate
                  </p>
                  {brand ? (
                    <p className="mt-0.5 text-2xs text-fg-faint">{brandLine(brand)}</p>
                  ) : kitsAvailable ? (
                    // Said here because an export with plain captions and no
                    // cards, from a workspace that has a kit, is usually a
                    // project that was never pointed at it.
                    <p className="mt-0.5 text-2xs text-amber-300/90">
                      No brand kit on this project: plain captions, no logo, no intro or outro. Choose one under Brand.
                    </p>
                  ) : null}
                </div>

              </div>
            </div>
          ) : null}

          {step === "rendering" ? (
            <div className="py-6">
              <div className="mx-auto max-w-sm">
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-iris-500),var(--color-cyan-400))] transition-[width] duration-700 ease-out"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
                <p className="mt-4 text-center text-[0.875rem] text-fg">
                  {stalled ? "Waiting its turn…" : stageLabel(stage, Boolean(project.voiceId))}
                </p>
                <p className="mt-1.5 text-center font-mono text-2xs text-fg-faint">
                  {Math.round(progress * 100)}%
                </p>
                {stalled ? (
                  <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3.5 text-center text-2xs leading-relaxed text-amber-200">
                    Your video is in line and starts as soon as the one ahead of it finishes. You can
                    close this window; the export keeps going and the video appears in the project
                    when it is done.
                    {SHOW_OPERATOR_HINTS ? (
                      <>
                        {" "}
                        <span className="text-amber-300/80">
                          Developing locally? Renders run in a separate process: start it with{" "}
                          <code className="font-mono">{WORKER_COMMAND}</code>.
                        </span>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === "error" ? (
            <div className="flex items-start gap-3.5 rounded-xl border border-rose-500/30 bg-rose-500/[0.07] p-4">
              <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-rose-300" strokeWidth={2.2} />
              <div className="min-w-0">
                <p className="text-[0.9375rem] font-medium text-fg-strong">The render did not finish</p>
                <p className="mt-1 break-words text-[0.8125rem] text-fg-muted">{failure}</p>
              </div>
            </div>
          ) : null}

          {step === "done" ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3.5 rounded-xl border border-mint-500/30 bg-mint-500/[0.07] p-4">
                <Icon name="check" className="mt-0.5 size-5 shrink-0 text-mint-400" strokeWidth={2.6} />
                <div>
                  <p className="text-[0.9375rem] font-medium text-fg-strong">
                    Your video is rendered
                  </p>
                  <p className="mt-1 text-[0.8125rem] text-fg-muted">
                    {formatDuration(duration)} at {resolution}, cut to your edit.
                    {narration ? ` Narrated by ${narration.voice.name}.` : ""}
                    {brand ? ` ${brandLine(brand)}` : ""}
                  </p>
                </div>
              </div>

              {/* An operator's problem, not the customer's: shown only where
                  the person reading it is the one who can restart it. */}
              {staleWorker && SHOW_OPERATOR_HINTS ? (
                <p className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-3.5 text-[0.8125rem] leading-relaxed text-amber-200">
                  <Icon name="alert" className="mt-0.5 size-4 shrink-0" strokeWidth={1.9} />
                  <span>
                    This was rendered by a worker running older code ({staleWorker.worker}) than
                    the app ({staleWorker.app}). Edits made since it started may not be in the
                    video. Restart it with <code className="font-mono">{WORKER_COMMAND}</code> and
                    render again.
                  </span>
                </p>
              ) : null}

              {narration ? <NarrationFit summary={narration} /> : null}

              {videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  className="w-full rounded-xl border border-[var(--line)] bg-black"
                />
              ) : null}

              <Section label="Share link">
                <div className="mb-2.5 flex items-center gap-3 rounded-xl border border-[var(--line)] bg-ink-950 px-3.5 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.8125rem] text-fg">
                      {published ? "This demo is live" : "Not shared yet"}
                    </span>
                    <span className="block text-2xs text-fg-faint">
                      {published
                        ? "Anyone with the link can watch it."
                        : "The link below returns a 404 until you publish."}
                    </span>
                  </span>
                  <Button
                    variant={published ? "outline" : "primary"}
                    size="sm"
                    disabled={publishing}
                    onClick={togglePublish}
                  >
                    {publishing ? "Working…" : published ? "Unpublish" : "Publish"}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    className={cn(
                      "h-10 flex-1 rounded-xl border border-[var(--line)] bg-ink-950 px-3.5 font-mono text-[0.75rem]",
                      published ? "text-fg" : "text-fg-faint",
                    )}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(`https://${shareUrl}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    }}
                  >
                    <Icon name={copied ? "check" : "copy"} className="size-3.5" strokeWidth={2} />
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </Section>

              <Section label="Embed">
                <pre className="overflow-x-auto rounded-xl border border-[var(--line)] bg-ink-950 p-3.5 font-mono text-[0.6875rem] leading-relaxed text-fg-muted">
{`<iframe src="${site.url}/embed/${project.slug}"
        width="100%" style="aspect-ratio:16/9;border:0"
        allowfullscreen title="${project.title}"></iframe>`}
                </pre>
              </Section>

              {failure ? (
                <p className="rounded-xl border border-rose-500/30 bg-rose-500/[0.07] px-3.5 py-2.5 text-2xs text-rose-200">
                  {failure}
                </p>
              ) : null}

              {videoUrl ? (
                <Section label="File">
                  <a
                    href={exports?.find((e) => e.kind === "video")?.download_url ?? videoUrl}
                    download={`${project.slug}.mp4`}
                    className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-ink-950 px-3.5 py-2.5 transition-colors hover:border-[var(--line-strong)]"
                  >
                    <Icon name="play" className="size-3.5 shrink-0 text-fg-faint" strokeWidth={1.9} />
                    <span className="min-w-0 flex-1 truncate font-mono text-[0.75rem] text-fg">
                      {project.slug}.mp4
                    </span>
                    <Icon name="download" className="size-3.5 shrink-0 text-iris-300" strokeWidth={2} />
                  </a>
                  <p className="mt-2 text-2xs text-fg-faint">
                    You can download it again any time from Export, under Your exports.
                  </p>
                </Section>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--line)] px-5 py-3.5">
          {step === "configure" ? (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" disabled={picked.length === 0} onClick={submit}>
                <Icon name="rocket" className="size-4" strokeWidth={1.9} />
                Render
              </Button>
            </>
          ) : null}
          {step === "error" ? (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
              <Button size="sm" onClick={() => setStep("configure")}>Back</Button>
            </>
          ) : null}
          {step === "done" ? (
            <>
              <Button href={`/d/${project.slug}`} variant="outline" size="sm">
                View share page
              </Button>
              <Button size="sm" onClick={onClose}>Done</Button>
            </>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

/**
 * How each chapter's narration was fitted to its footage.
 *
 * Only the chapters that needed fitting are listed. A voice that read a
 * chapter comfortably inside its footage is not news; one that had to be
 * hurried, or still runs over, is what a person wants to know before they
 * share the file — and the remedy, cutting words from that chapter, is in
 * the panel behind this dialog.
 */
function NarrationFit({ summary }: { summary: NarrationSummary }) {
  // Footage bent to the reading: said per chapter where it was bent hard.
  const bent = summary.chapters.filter(
    (c) => c.retime && (c.retime.heldSec > 0.5 || c.retime.hurriedSec > 1 || c.retime.slowedSec > 1 || c.retime.trimmedSec > 0.2),
  );
  const totals = summary.chapters.reduce(
    (t, c) => ({
      held: t.held + (c.retime?.heldSec ?? 0),
      hurried: t.hurried + (c.retime?.hurriedSec ?? 0),
      trimmed: t.trimmed + (c.retime?.trimmedSec ?? 0),
    }),
    { held: 0, hurried: 0, trimmed: 0 },
  );
  if (summary.chapters.some((c) => c.retime)) {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-ink-900/60 p-3.5 text-[0.8125rem] leading-relaxed text-fg-subtle">
        <p>
          The footage was fitted to the narration, word by word.
          {totals.held > 0.5 ? ` Still frames held for ${totals.held.toFixed(1)}s.` : ""}
          {totals.hurried > 1 ? ` ${totals.hurried.toFixed(1)}s of footage runs faster.` : ""}
          {totals.trimmed > 0.2 ? ` ${totals.trimmed.toFixed(1)}s trimmed where nothing else fit.` : ""}
          {totals.held <= 0.5 && totals.hurried <= 1 && totals.trimmed <= 0.2 ? " Nothing had to bend noticeably." : ""}
        </p>
        {bent.length > 0 ? (
          <ul className="mt-2 space-y-1 text-2xs text-fg-faint">
            {bent.map((c) => (
              <li key={c.segIndex}>
                <span className="font-medium text-fg-subtle">
                  {String(c.segIndex + 1).padStart(2, "0")} {c.title}
                </span>
                {c.retime!.heldSec > 0.5 ? ` — held ${c.retime!.heldSec.toFixed(1)}s` : ""}
                {c.retime!.hurriedSec > 1 ? ` — ${c.retime!.hurriedSec.toFixed(1)}s hurried` : ""}
                {c.retime!.slowedSec > 1 ? ` — ${c.retime!.slowedSec.toFixed(1)}s slowed` : ""}
                {c.retime!.trimmedSec > 0.2 ? ` — ${c.retime!.trimmedSec.toFixed(1)}s trimmed` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }
  const fitted = summary.chapters.filter((c) => c.pace > 1 || c.tempo > 1 || c.overrunSec > 0);
  if (fitted.length === 0) {
    return (
      <p className="text-[0.8125rem] text-fg-subtle">
        Every chapter's narration fits inside its footage.
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3.5">
      <p className="text-[0.8125rem] font-medium text-amber-200">
        {fitted.length === 1 ? "One chapter" : `${fitted.length} chapters`} read longer than the footage
      </p>
      <ul className="mt-2 space-y-1.5">
        {fitted.map((c) => (
          <li key={c.segIndex} className="text-2xs leading-relaxed text-amber-200/85">
            <span className="font-medium text-amber-100">
              {String(c.segIndex + 1).padStart(2, "0")} {c.title}
            </span>{" "}
            — {c.spokenSec.toFixed(1)}s of speech for {c.availableSec.toFixed(1)}s of footage
            {c.pace > 1 ? `, read at ${c.pace.toFixed(2)}× pace` : ""}
            {c.tempo > 1 ? `, stretched ${c.tempo.toFixed(2)}×` : ""}
            {c.overrunSec > 0 ? `, still ${c.overrunSec.toFixed(1)}s over` : ""}.
          </li>
        ))}
      </ul>
      <p className="mt-2 text-2xs text-amber-200/70">
        Cut a few words from those chapters in the Script panel and render again.
      </p>
    </div>
  );
}

/** One of the project's files, as GET /api/projects/:id/exports lists it. */
interface ProjectExport {
  id: string;
  kind: string;
  locale: string;
  published: boolean;
  rendered_at: string | null;
  bytes: number | null;
  share_url: string | null;
  download_url: string;
}

/**
 * What the project has already produced, and what can be done with each.
 *
 * The download links go through the app and are signed when clicked, so
 * they work however long the dialog has been open.
 */
function ExportsList({
  exports,
  projectId,
  slug,
  publishing,
  onTogglePublish,
}: {
  exports: ProjectExport[];
  projectId: string;
  slug: string;
  publishing: boolean;
  onTogglePublish: () => void;
}) {
  return (
    <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-ink-950">
      {exports.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
          <Icon name={e.kind === "video" ? "play" : "doc"} className="size-3.5 shrink-0 text-fg-faint" strokeWidth={1.9} />
          <span className="min-w-0 flex-1 basis-40">
            <span className="block truncate text-[0.8125rem] text-fg">
              {e.kind === "video" ? "Video" : "Guide"} · {e.locale}
              {e.kind === "video" ? (
                <span className={cn("ml-2 text-2xs", e.published ? "text-mint-400" : "text-fg-faint")}>
                  {e.published ? "Published" : "Not shared"}
                </span>
              ) : null}
            </span>
            <span className="block text-2xs text-fg-faint">
              Rendered {e.rendered_at ? new Date(e.rendered_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"}
              {e.bytes ? ` · ${formatBytes(e.bytes)}` : ""}
            </span>
          </span>
          <span className="flex flex-wrap gap-1.5">
            {e.kind === "video" ? (
              <>
                <Button href={e.share_url ?? `/d/${slug}`} variant="ghost" size="sm">
                  {e.published ? "Open page" : "Preview page"}
                </Button>
                <Button variant="ghost" size="sm" disabled={publishing} onClick={onTogglePublish}>
                  {publishing ? "Working…" : e.published ? "Unpublish" : "Publish"}
                </Button>
              </>
            ) : (
              <Button href={`/app/guides/${projectId}`} variant="ghost" size="sm">
                Open guide
              </Button>
            )}
            {/* A plain link, not a Button: its href is a route that answers with
                a redirect to the file, which client-side navigation cannot follow. */}
            <a
              href={e.download_url}
              download={e.kind === "video" ? `${slug}.mp4` : `${slug}-guide.md`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line-strong)] px-3 text-[0.8125rem] font-medium text-fg transition-colors hover:bg-[color-mix(in_oklab,var(--color-fg)_6%,transparent)]"
            >
              <Icon name="download" className="size-3.5" strokeWidth={2} />
              Download
            </a>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">{label}</p>
      {children}
    </div>
  );
}

function Pill({
  on,
  onClick,
  disabled,
  children,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-2xs font-medium transition-colors",
        on ? "border-iris-500/45 bg-iris-500/12 text-iris-300" : "border-[var(--line)] text-fg-subtle",
        disabled ? "cursor-not-allowed opacity-40" : !on && "hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/** "Dressed in Acme, with an intro and outro card and your logo." */
function brandLine(brand: { name: string; cards: number; logo: boolean }): string {
  const parts: string[] = [];
  if (brand.cards === 2) parts.push("an intro and outro card");
  else if (brand.cards === 1) parts.push("a title card");
  if (brand.logo) parts.push("your logo");
  return `Dressed in ${brand.name}${parts.length > 0 ? `, with ${parts.join(" and ")}` : ""}.`;
}

/** A running render's step, as GET /api/renders reports it. */
interface RenderStage {
  name: string;
  done?: number;
  total?: number;
}

/** What the render is doing now, in words. */
function stageLabel(stage: RenderStage | null, voiced: boolean): string {
  switch (stage?.name) {
    case "preparing":
      return "Preparing your edit…";
    case "narrating":
      return stage.total
        ? `Recording narration · chapter ${Math.min(stage.total, (stage.done ?? 0) + 1)} of ${stage.total}`
        : "Recording narration…";
    case "encoding":
      return "Encoding your video…";
    case "finishing":
      return "Saving your video…";
    default:
      // Not started, or a worker too old to say which step it is on.
      return stage ? "Rendering…" : voiced ? "Starting the narration and encode…" : "Starting the encode…";
  }
}
