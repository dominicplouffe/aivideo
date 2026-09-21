"use client";

import { cn, formatDuration } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { Project } from "@/lib/app-data";
import { silentSpanSec } from "@/lib/segment-span";
import type { EditState, EditedWord } from "./types";

/** What the four chips ask for, in the words a person would use. */
const ASK_CHIPS: { label: string; icon: IconName; prompt: string }[] = [
  { label: "Tighten", icon: "wand", prompt: "Which chapters could I drop to tighten this without losing the point?" },
  { label: "Formal tone", icon: "target", prompt: "Does this read as too casual for a technical buyer? Be specific about where." },
  { label: "Cut to 60s", icon: "clock", prompt: "Get this under 60 seconds and tell me what I would lose." },
  { label: "Simplify language", icon: "globe", prompt: "Where is the language more complicated than it needs to be?" },
];

export function Transcript({
  project,
  state,
  timeline,
  activeWord,
  activeSegment,
  onSeek,
  onSelectSegment,
  onToggleSegment,
  onToggleFillers,
  onAsk,
}: {
  project: Project;
  state: EditState;
  timeline: EditedWord[];
  activeWord: EditedWord | null;
  activeSegment: number | null;
  onSeek: (t: number) => void;
  onSelectSegment: (i: number) => void;
  onToggleSegment: (i: number) => void;
  onToggleFillers: () => void;
  /** Sends a request to the Riff panel. Absent in read-only contexts. */
  onAsk?: (prompt: string) => void;
}) {
  const totalWords = project.segments.reduce((n, s) => n + s.words.length, 0);
  // Silent spans stand in for wordless chapters and are not words.
  const keptWords = timeline.filter((w) => !w.silent).length;
  const removed = totalWords - keptWords;

  // Map (segIndex, wordIndex) → edited start time so clicking a word seeks.
  const index = new Map<string, EditedWord>();
  timeline.forEach((w) => index.set(`${w.segIndex}:${w.wordIndex}`, w));

  return (
    <div className="flex min-h-0 flex-col border-r border-[var(--line)] bg-ink-950">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name="doc" className="size-4 text-iris-400" strokeWidth={1.8} />
          <h2 className="text-[0.875rem] font-medium text-fg-strong">Script</h2>
        </div>
        <span className={cn("font-mono text-2xs", removed > 0 ? "text-mint-400" : "text-fg-faint")}>
          {removed > 0 ? `${removed} words cut` : "verbatim"}
        </span>
      </header>

      {/*
        Action chips.

        "Remove fillers" has always been real. The other four had no onClick
        at all — four buttons styled identically to the working one, with no
        disabled state, doing nothing. They now ask Riff, which is where that
        kind of request actually goes.
      */}
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--line)] px-4 py-3">
        <Chip active={state.removeFillers} onClick={onToggleFillers} icon="scissors">
          Remove fillers
        </Chip>
        {onAsk
          ? ASK_CHIPS.map((chip) => (
              <Chip key={chip.label} icon={chip.icon} onClick={() => onAsk(chip.prompt)}>
                {chip.label}
              </Chip>
            ))
          : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {project.segments.map((seg, segIndex) => {
          const deleted = state.deletedSegments.has(segIndex);
          const isActive = activeSegment === segIndex;
          const first = index.get(`${segIndex}:0`);

          return (
            <section
              key={seg.id}
              className={cn(
                "group/seg mb-5 rounded-xl border p-3 transition-colors",
                deleted
                  ? "border-[var(--line)] bg-ink-900/40 opacity-45"
                  : isActive
                    ? "border-iris-500/40 bg-iris-500/[0.06]"
                    : "border-transparent hover:border-[var(--line)]",
              )}
            >
              <header className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onSelectSegment(segIndex);
                    if (first) onSeek(first.start);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="font-mono text-2xs text-fg-faint">
                    {String(segIndex + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate text-[0.75rem] font-medium text-fg-muted">{seg.title}</span>
                  {first ? (
                    <span className="shrink-0 font-mono text-2xs text-fg-faint tabular-nums">
                      {formatDuration(first.start)}
                    </span>
                  ) : null}
                </button>

                {seg.zoom && seg.zoom.scale > 1.2 ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-cyan-500/12 px-1.5 py-0.5 font-mono text-2xs text-cyan-300">
                    <Icon name="zoom" className="size-2.5" strokeWidth={2.6} />
                    {seg.zoom.scale.toFixed(1)}×
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={() => onToggleSegment(segIndex)}
                  aria-label={deleted ? "Restore scene" : "Delete scene"}
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-colors",
                    deleted
                      ? "text-mint-400 hover:bg-mint-500/15"
                      : "text-fg-faint opacity-0 group-hover/seg:opacity-100 hover:bg-rose-500/15 hover:text-rose-400",
                  )}
                >
                  <Icon name={deleted ? "refresh" : "trash"} className="size-3.5" strokeWidth={1.9} />
                </button>
              </header>

              {seg.action ? (
                <p className="mb-2 font-mono text-2xs text-fg-faint">{seg.action}</p>
              ) : null}

              {seg.words.length === 0 ? (
                // Nothing was heard — no microphone, or audio that was music
                // or room noise rather than speech. Said plainly, because a
                // chapter with no text and no explanation looks like a
                // transcription that never ran.
                <p className="text-[0.8125rem] leading-relaxed text-fg-faint">
                  No speech was heard in this chapter. It plays as recorded,{" "}
                  {formatDuration(silentSpanSec(seg))} of footage.
                </p>
              ) : (
                <p className="text-[0.875rem] leading-[1.85]">
                  {seg.words.map((w, wordIndex) => {
                    const edited = index.get(`${segIndex}:${wordIndex}`);
                    const isCut = Boolean(w.cut) && state.removeFillers;
                    const isNow =
                      activeWord?.segIndex === segIndex && activeWord?.wordIndex === wordIndex;
                    return (
                      <span
                        key={wordIndex}
                        onClick={() => edited && onSeek(edited.start)}
                        className={cn(
                          "rounded px-px transition-colors",
                          edited && "cursor-pointer",
                          isCut && "text-fg-faint line-through decoration-rose-400/70",
                          !isCut && w.cut && "bg-rose-500/12 text-rose-300",
                          !isCut && w.em && "font-medium text-cyan-300",
                          !isCut && !w.em && !w.cut && "text-fg-muted hover:text-fg",
                          isNow && "bg-iris-500/25 text-fg-strong",
                        )}
                      >
                        {w.w}{" "}
                      </span>
                    );
                  })}
                </p>
              )}
            </section>
          );
        })}

        {/* The "select a span and press ⌘⏎" hint described a key handler
            that has never existed anywhere in the Studio. */}
      </div>
    </div>
  );
}

function Chip({
  children,
  icon,
  active,
  onClick,
}: {
  children: React.ReactNode;
  icon: IconName;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-2xs font-medium transition-colors",
        active
          ? "border-iris-500/45 bg-iris-500/12 text-iris-300"
          : "border-[var(--line)] text-fg-subtle hover:border-[var(--line-strong)] hover:text-fg",
      )}
    >
      <Icon name={icon} className="size-3" strokeWidth={2.2} />
      {children}
    </button>
  );
}
