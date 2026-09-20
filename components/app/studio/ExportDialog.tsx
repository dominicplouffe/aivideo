"use client";

import { useEffect, useState } from "react";
import { cn, formatDuration } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { localeMatrix, type Project } from "@/lib/app-data";
import { site } from "@/lib/site";

type Step = "configure" | "rendering" | "done";

const formats: { id: string; label: string; meta: string; icon: IconName }[] = [
  { id: "video", label: "Demo video", meta: "MP4 · H.264 · 4K60", icon: "play" },
  { id: "guide", label: "Step-by-step guide", meta: "Markdown + screenshots", icon: "doc" },
  { id: "interactive", label: "Interactive tour", meta: "Embeddable · 34 KB runtime", icon: "cursor" },
  { id: "clips", label: "Social cuts", meta: "6 clips · 9:16 + 1:1", icon: "scissors" },
];

const ratios = ["16:9", "9:16", "1:1", "4:5"];
const resolutions = ["2160p", "1440p", "1080p", "720p"];

export function ExportDialog({
  project,
  duration,
  onClose,
}: {
  project: Project;
  duration: number;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("configure");
  const [picked, setPicked] = useState<string[]>(["video", "guide", "interactive"]);
  const [ratio, setRatio] = useState<string[]>(["16:9"]);
  const [resolution, setResolution] = useState("2160p");
  const [locales, setLocales] = useState<string[]>(["en-US", "de-DE", "ja-JP"]);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (step !== "rendering") return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setProgress(i / 45);
      if (i >= 45) {
        clearInterval(id);
        setStep("done");
      }
    }, 45);
    return () => clearInterval(id);
  }, [step]);

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
            {step === "done" ? "Published" : "Export and publish"}
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
              <Section label="Outputs">
                <div className="grid gap-2 sm:grid-cols-2">
                  {formats.map((f) => {
                    const on = picked.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggle(picked, setPicked, f.id)}
                        aria-pressed={on}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                          on ? "border-iris-500/45 bg-iris-500/[0.08]" : "border-[var(--line)] hover:border-[var(--line-strong)]",
                        )}
                      >
                        <Icon
                          name={f.icon}
                          className={cn("size-4 shrink-0", on ? "text-iris-300" : "text-fg-faint")}
                          strokeWidth={1.8}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.8125rem] font-medium text-fg">{f.label}</span>
                          <span className="block truncate text-2xs text-fg-faint">{f.meta}</span>
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
                  {localeMatrix.map((l) => (
                    <Pill key={l.code} on={locales.includes(l.code)} onClick={() => toggle(locales, setLocales, l.code)}>
                      {l.label}
                    </Pill>
                  ))}
                </div>
                <p className="mt-2 text-2xs text-fg-faint">
                  Localized versions never consume additional video minutes.
                </p>
              </Section>

              <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-ink-950 px-4 py-3">
                <div>
                  <p className="text-[0.8125rem] text-fg">
                    {billedMinutes} video minutes will be billed
                  </p>
                  <p className="mt-0.5 text-2xs text-fg-faint">
                    {formatDuration(duration)} finished · {locales.length} languages · guides and tours free
                  </p>
                </div>
                <span className="font-mono text-2xs text-fg-faint">76 min left</span>
              </div>
            </div>
          ) : null}

          {step === "rendering" ? (
            <div className="py-6">
              <div className="mx-auto max-w-sm">
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-iris-500),var(--color-cyan-400))] transition-[width] duration-150"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
                <p className="mt-4 text-center text-[0.875rem] text-fg">
                  Rendering {picked.length} outputs across {locales.length} languages…
                </p>
                <p className="mt-1.5 text-center font-mono text-2xs text-fg-faint">
                  {Math.round(progress * 100)}% · running in parallel
                </p>
              </div>
            </div>
          ) : null}

          {step === "done" ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3.5 rounded-xl border border-mint-500/30 bg-mint-500/[0.07] p-4">
                <Icon name="check" className="mt-0.5 size-5 shrink-0 text-mint-400" strokeWidth={2.6} />
                <div>
                  <p className="text-[0.9375rem] font-medium text-fg-strong">
                    {picked.length} outputs published in {locales.length} languages
                  </p>
                  <p className="mt-1 text-[0.8125rem] text-fg-muted">
                    Existing embeds updated in place — no URLs changed.
                  </p>
                </div>
              </div>

              <Section label="Share link">
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    className="h-10 flex-1 rounded-xl border border-[var(--line)] bg-ink-950 px-3.5 font-mono text-[0.75rem] text-fg"
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
{`<div data-demoriff="${project.id}" data-aspect="16:9"></div>
<script src="https://embed.demoriff.com/v1.js" async></script>`}
                </pre>
              </Section>

              <Section label="Files">
                <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)]">
                  {picked.map((p) => {
                    const f = formats.find((x) => x.id === p)!;
                    return (
                      <li key={p} className="flex items-center gap-3 bg-ink-950 px-3.5 py-2.5">
                        <Icon name={f.icon} className="size-3.5 shrink-0 text-fg-faint" strokeWidth={1.9} />
                        <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-fg">{f.label}</span>
                        <span className="font-mono text-2xs text-fg-faint">ready</span>
                        <Icon name="download" className="size-3.5 shrink-0 text-iris-300" strokeWidth={2} />
                      </li>
                    );
                  })}
                </ul>
              </Section>
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--line)] px-5 py-3.5">
          {step === "configure" ? (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" disabled={picked.length === 0} onClick={() => setStep("rendering")}>
                <Icon name="rocket" className="size-4" strokeWidth={1.9} />
                Render and publish
              </Button>
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">{label}</p>
      {children}
    </div>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-2xs font-medium transition-colors",
        on ? "border-iris-500/45 bg-iris-500/12 text-iris-300" : "border-[var(--line)] text-fg-subtle hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
