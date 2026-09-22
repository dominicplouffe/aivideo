"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn, formatDuration } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import type { Project } from "@/lib/app-data";
import { silentSpanSec, wordKey } from "@/lib/segments";
import {
  occurrencesOf,
  resolveWords,
  rewriteFor,
  type EditState,
  type EditedWord,
  type ResolvedWord,
  type WordEdit,
} from "./types";

/** What the four chips ask for, in the words a person would use. */
const ASK_CHIPS: { label: string; icon: IconName; prompt: string }[] = [
  { label: "Tighten", icon: "wand", prompt: "Which chapters could I drop to tighten this without losing the point?" },
  { label: "Formal tone", icon: "target", prompt: "Does this read as too casual for a technical buyer? Be specific about where." },
  { label: "Cut to 60s", icon: "clock", prompt: "Get this under 60 seconds and tell me what I would lose." },
  { label: "Simplify language", icon: "globe", prompt: "Where is the language more complicated than it needs to be?" },
];

/** One change to the word edits: set an edit at a key, or clear it. */
export interface WordEditChange {
  key: string;
  edit: WordEdit | null;
}

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
  onCutWords,
  onEditWords,
  onGlossary,
  pinnedKeys,
  onPin,
  onUnpin,
  pinningKey,
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
  /** Cuts (or restores) the words under these keys; see `wordKey`. */
  onCutWords: (keys: string[], cut: boolean) => void;
  /** Rewrites words. Cuts inside a rewritten run are cleared by the caller. */
  onEditWords: (changes: WordEditChange[]) => void;
  /** Remembers a rewrite for the workspace: future recordings get it too. */
  onGlossary: (term: { heard: string; text: string; spoken: string | null }) => void;
  /** Sync points, when a voice narrates: which words are pinned, and how to pin or unpin one. */
  pinnedKeys?: Set<string>;
  onPin?: (key: string, label: string) => void;
  onUnpin?: (key: string) => void;
  /** The word currently waiting for a frame, if any. */
  pinningKey?: string | null;
  /** Sends a request to the Riff panel. Absent in read-only contexts. */
  onAsk?: (prompt: string) => void;
}) {
  // Every chapter's words after the hand edits, which is what this panel
  // renders and what the selection ranges over.
  const resolved = useMemo(
    () => project.segments.map((seg, segIndex) => resolveWords(seg, segIndex, state)),
    [project.segments, state],
  );

  const totalWords = resolved.reduce((n, words) => n + words.length, 0);
  // Silent spans stand in for wordless chapters and are not words.
  const keptWords = timeline.filter((w) => !w.silent).length;
  const removed = totalWords - keptWords;
  const corrected = resolved.reduce((n, words) => n + words.filter((w) => w.edited).length, 0);

  // Map (segIndex, wordIndex) → edited start time so clicking a word seeks.
  const index = new Map<string, EditedWord>();
  timeline.forEach((w) => index.set(wordKey(w.segIndex, w.wordIndex), w));

  /*
   * Selecting, cutting and rewriting.
   *
   * Click a word to select it, shift-click to extend the selection through
   * its chapter, or right-click a word to select it. A toolbar appears at
   * the selection — above it, or below when there is no room — with Edit
   * and Cut, and follows the selection as the script scrolls, so the actions
   * are where the eyes are and never up in a header that has scrolled away.
   * Delete or Backspace cuts the selection, and the same key on words
   * already cut restores them. Enter, or a double-click, opens the editor,
   * which sits under the selection for the same reason.
   *
   * A selection is kept within one chapter: a span that crosses a chapter
   * boundary would cut across a title, and it is never what a person
   * dragging through a sentence meant. Positions are indices into the
   * chapter's resolved words, so a rewritten run selects as one thing.
   */
  const [selection, setSelection] = useState<{ seg: number; anchor: number; focus: number } | null>(
    null,
  );
  const [editing, setEditing] = useState(false);

  const selectedWords = useMemo((): ResolvedWord[] => {
    if (!selection) return [];
    const words = resolved[selection.seg] ?? [];
    const from = Math.min(selection.anchor, selection.focus);
    const to = Math.max(selection.anchor, selection.focus);
    return words.slice(from, to + 1);
  }, [selection, resolved]);
  const selectedKeys = useMemo(
    () => (selection ? selectedWords.map((w) => wordKey(selection.seg, w.wordIndex)) : []),
    [selection, selectedWords],
  );
  const selectionCut = selectedKeys.length > 0 && selectedKeys.every((key) => state.cutWords.has(key));

  const toggleSelected = useCallback(() => {
    if (selectedKeys.length === 0) return;
    onCutWords(selectedKeys, !selectionCut);
  }, [selectedKeys, selectionCut, onCutWords]);

  useEffect(() => {
    if (!selection || editing) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "Escape") setSelection(null);
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        toggleSelected();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        setEditing(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, editing, toggleSelected]);

  /*
   * Where the selection is on screen, in the scroll container's coordinates,
   * so the toolbar and the editor can sit against it and move with it.
   * Measured after paint and again on scroll and resize.
   */
  const scroller = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; bottom: number; left: number; right: number } | null>(null);
  const measure = useCallback(() => {
    const container = scroller.current;
    if (!container || !selection) {
      setAnchor(null);
      return;
    }
    const from = Math.min(selection.anchor, selection.focus);
    const to = Math.max(selection.anchor, selection.focus);
    const spans = [...container.querySelectorAll<HTMLElement>(`[data-word^="${selection.seg}:"]`)].filter((el) => {
      const position = Number(el.dataset.word?.split(":")[1]);
      return position >= from && position <= to;
    });
    if (spans.length === 0) {
      setAnchor(null);
      return;
    }
    const box = container.getBoundingClientRect();
    let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
    for (const el of spans) {
      const r = el.getBoundingClientRect();
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
    }
    setAnchor({
      top: top - box.top + container.scrollTop,
      bottom: bottom - box.top + container.scrollTop,
      left: left - box.left + container.scrollLeft,
      right: right - box.left + container.scrollLeft,
    });
  }, [selection]);

  useLayoutEffect(() => {
    measure();
  }, [measure, resolved, editing]);
  useEffect(() => {
    const container = scroller.current;
    if (!container) return;
    container.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      container.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const selectWord = (segIndex: number, position: number, extend: boolean) => {
    setEditing(false);
    setSelection((current) =>
      extend && current && current.seg === segIndex
        ? { ...current, focus: position }
        : { seg: segIndex, anchor: position, focus: position },
    );
  };

  /**
   * Applies a rewrite to the selection, and optionally to every other place
   * the transcriber wrote the same words. The original run is matched on
   * what was heard, so "Apply to all" reaches the occurrences the person has
   * not scrolled to yet.
   */
  const applyEdit = (
    edit: { text: string; spoken: string | null },
    everywhere: boolean,
    remember: boolean,
  ) => {
    if (!selection || selectedWords.length === 0) return;
    const first = selectedWords[0];
    const last = selectedWords[selectedWords.length - 1];
    const span = last.wordIndex + last.span - first.wordIndex;
    const originalWords = selectedWords.flatMap((w) => w.original.split(" "));
    const text = edit.text.trim();
    const spoken = edit.spoken?.trim() || null;

    const changes: WordEditChange[] = [];
    const editedLast = originalWords[originalWords.length - 1];
    const target = (segIndex: number, wordIndex: number, n: number, lastOriginal: string) => {
      const key = wordKey(segIndex, wordIndex);
      const shown = rewriteFor(text, editedLast, lastOriginal);
      const isOriginal =
        !spoken &&
        shown === project.segments[segIndex].words.slice(wordIndex, wordIndex + n).map((w) => w.w).join(" ");
      changes.push({
        key,
        edit: isOriginal ? null : { span: n, text: shown, ...(spoken && spoken !== shown ? { spoken } : {}) },
      });
    };

    target(selection.seg, first.wordIndex, span, originalWords[originalWords.length - 1]);
    if (everywhere) {
      for (const hit of occurrencesOf(project, originalWords)) {
        if (hit.segIndex === selection.seg && hit.wordIndex === first.wordIndex) continue;
        const lastWord = project.segments[hit.segIndex].words[hit.wordIndex + hit.span - 1]?.w ?? "";
        target(hit.segIndex, hit.wordIndex, hit.span, lastWord);
      }
    }
    onEditWords(changes);
    if (remember) {
      const bare = (s: string) => s.replace(/[.,!?;:]+$/, "");
      onGlossary({ heard: bare(originalWords.join(" ")), text: bare(text), spoken: spoken ? bare(spoken) : null });
    }
    setEditing(false);
    // The rewritten run is one token now; keep it selected.
    setSelection({ seg: selection.seg, anchor: Math.min(selection.anchor, selection.focus), focus: Math.min(selection.anchor, selection.focus) });
  };

  const otherOccurrences = useMemo(() => {
    if (!selection || selectedWords.length === 0) return 0;
    const originalWords = selectedWords.flatMap((w) => w.original.split(" "));
    return occurrencesOf(project, originalWords).filter(
      (hit) => !(hit.segIndex === selection.seg && hit.wordIndex === selectedWords[0].wordIndex),
    ).length;
  }, [selection, selectedWords, project]);

  return (
    <div className="flex min-h-0 flex-1 flex-col border-r border-[var(--line)] bg-ink-950">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name="doc" className="size-4 text-iris-400" strokeWidth={1.8} />
          <h2 className="text-[0.875rem] font-medium text-fg-strong">Script</h2>
        </div>
        <span className={cn("font-mono text-2xs", removed > 0 || corrected > 0 ? "text-mint-400" : "text-fg-faint")}>
          {[
            removed > 0 ? `${removed} word${removed === 1 ? "" : "s"} cut` : null,
            corrected > 0 ? `${corrected} corrected` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "verbatim"}
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

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {anchor && selectedWords.length > 0 && !editing ? (
          <SelectionToolbar
            anchor={anchor}
            container={scroller.current}
            count={selectedKeys.length}
            cut={selectionCut}
            onEdit={() => setEditing(true)}
            onCut={toggleSelected}
            pin={
              onPin && selectedKeys.length === 1
                ? {
                    pinned: pinnedKeys?.has(selectedKeys[0]) ?? false,
                    onClick: () =>
                      pinnedKeys?.has(selectedKeys[0])
                        ? onUnpin?.(selectedKeys[0])
                        : onPin(selectedKeys[0], selectedWords[0]?.text.replace(/[.,!?;:]+$/, "") ?? ""),
                  }
                : undefined
            }
          />
        ) : null}
        {anchor && editing && selection && selectedWords.length > 0 ? (
          <FloatingCard anchor={anchor} container={scroller.current}>
            <WordEditor
              key={`${selection.seg}:${Math.min(selection.anchor, selection.focus)}:${Math.max(selection.anchor, selection.focus)}`}
              words={selectedWords}
              otherOccurrences={otherOccurrences}
              onApply={applyEdit}
              onCancel={() => setEditing(false)}
            />
          </FloatingCard>
        ) : null}
        {project.segments.map((seg, segIndex) => {
          const deleted = state.deletedSegments.has(segIndex);
          const isActive = activeSegment === segIndex;
          const first = index.get(wordKey(segIndex, 0));
          const words = resolved[segIndex];
          const from = selection?.seg === segIndex ? Math.min(selection.anchor, selection.focus) : -1;
          const to = selection?.seg === segIndex ? Math.max(selection.anchor, selection.focus) : -1;

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

              {words.length === 0 ? (
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
                  {words.map((w, position) => {
                    const key = wordKey(segIndex, w.wordIndex);
                    const edited = index.get(key);
                    const handCut = state.cutWords.has(key);
                    const isCut = (w.cut && state.removeFillers) || handCut;
                    const isNow = activeWord?.segIndex === segIndex && activeWord?.wordIndex === w.wordIndex;
                    const isSelected = position >= from && position <= to;
                    const saysDifferently = w.spoken !== w.text;
                    const pinned = pinnedKeys?.has(key) ?? false;
                    const awaitingPin = pinningKey === key;
                    const bare = (s: string) => s.replace(/[.,!?;:]+$/, "");
                    const title = handCut
                      ? "Cut by hand. Select it and press Delete to restore."
                      : saysDifferently
                        ? `Said as “${bare(w.spoken)}”. Transcribed as “${bare(w.original)}”.`
                        : w.edited
                          ? `Transcribed as “${bare(w.original)}”.`
                          : undefined;
                    return (
                      <span
                        key={w.wordIndex}
                        data-word={`${segIndex}:${position}`}
                        onClick={(e) => {
                          if (edited) onSeek(edited.start);
                          selectWord(segIndex, position, e.shiftKey);
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          selectWord(segIndex, position, false);
                          setEditing(true);
                        }}
                        onContextMenu={(e) => {
                          // The toolbar is the context menu: right-click
                          // selects the word (keeping a selection it is
                          // already part of) and the actions appear on it.
                          e.preventDefault();
                          if (!isSelected) selectWord(segIndex, position, false);
                          setEditing(false);
                        }}
                        title={title}
                        className={cn(
                          "cursor-pointer rounded px-px transition-colors select-none",
                          isCut && "text-fg-faint line-through decoration-rose-400/70",
                          !isCut && w.cut && "bg-rose-500/12 text-rose-300",
                          !isCut && w.em && "font-medium text-cyan-300",
                          !isCut && !w.em && !w.cut && "text-fg-muted hover:text-fg",
                          // A word that is said differently from how it reads.
                          saysDifferently && "underline decoration-dotted decoration-iris-400/70 underline-offset-4",
                          isNow && "bg-iris-500/25 text-fg-strong",
                          isSelected && "bg-iris-500/20 ring-1 ring-iris-400/70",
                          awaitingPin && "bg-amber-500/20 ring-1 ring-amber-400/70",
                        )}
                      >
                        {w.text}
                        {pinned ? (
                          <Icon
                            name="target"
                            className="ml-0.5 inline size-2.5 -translate-y-px text-amber-400"
                            strokeWidth={3}
                            aria-label="pinned to a frame"
                          />
                        ) : null}{" "}
                      </span>
                    );
                  })}
                </p>
              )}

            </section>
          );
        })}

        <p className="px-1 pt-1 text-2xs leading-relaxed text-fg-faint">
          Click or right-click a word to select it, shift-click to extend. Delete cuts it from the
          video; Enter edits its spelling or how it is said.
        </p>
      </div>
    </div>
  );
}

type Anchor = { top: number; bottom: number; left: number; right: number };

/**
 * Places a child against the selection inside the scroll container.
 *
 * Above the selection by default, below when the selection is at the top of
 * the view, and never past either edge horizontally. Measured after mount,
 * so the first paint may be a frame off; nobody sees it.
 */
function useFloatingPosition(
  anchor: Anchor,
  container: HTMLDivElement | null,
  prefer: "above" | "below",
) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !container) return;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const viewTop = container.scrollTop;
    const viewBottom = container.scrollTop + container.clientHeight;
    const gap = 6;
    let top: number;
    if (prefer === "above") {
      top = anchor.top - height - gap;
      if (top < viewTop + 4) top = anchor.bottom + gap;
    } else {
      top = anchor.bottom + gap;
      if (top + height > viewBottom - 4 && anchor.top - height - gap >= viewTop + 4) {
        top = anchor.top - height - gap;
      }
    }
    const centre = (anchor.left + anchor.right) / 2;
    const maxLeft = Math.max(8, container.clientWidth - width - 8);
    const left = Math.min(maxLeft, Math.max(8, prefer === "above" ? centre - width / 2 : anchor.left));
    setStyle({ top, left });
  }, [anchor, container, prefer]);
  return { ref, style };
}

/** Edit and Cut, at the selection. What Descript calls the selection toolbar. */
function SelectionToolbar({
  anchor,
  container,
  count,
  cut,
  onEdit,
  onCut,
  pin,
}: {
  anchor: Anchor;
  container: HTMLDivElement | null;
  count: number;
  cut: boolean;
  onEdit: () => void;
  onCut: () => void;
  /** Present under a narrator with one word selected: pin it to a frame, or unpin it. */
  pin?: { pinned: boolean; onClick: () => void };
}) {
  const { ref, style } = useFloatingPosition(anchor, container, "above");
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Selection actions"
      style={style ? { top: style.top, left: style.left } : { top: anchor.top, left: anchor.left, visibility: "hidden" }}
      className="absolute z-20 flex items-center gap-1 rounded-lg border border-[var(--line-strong)] bg-ink-900 p-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)]"
      // Pressing a button must not drop the selection the toolbar is for.
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-medium text-fg transition-colors hover:bg-ink-800"
      >
        <Icon name="wand" className="size-3" strokeWidth={2.2} />
        Edit
        <kbd className="rounded border border-current/30 px-1 font-mono text-[0.625rem] opacity-60">↵</kbd>
      </button>
      <button
        type="button"
        onClick={onCut}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-medium transition-colors",
          cut ? "text-mint-300 hover:bg-mint-500/15" : "text-rose-300 hover:bg-rose-500/15",
        )}
      >
        <Icon name={cut ? "refresh" : "scissors"} className="size-3" strokeWidth={2.2} />
        {cut ? "Restore" : "Cut"} {count}
        <kbd className="rounded border border-current/30 px-1 font-mono text-[0.625rem] opacity-60">⌫</kbd>
      </button>
      {pin ? (
        <button
          type="button"
          onClick={pin.onClick}
          title={pin.pinned ? "Unpin this word from its frame" : "Pin this word to a frame of the footage"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-2xs font-medium transition-colors",
            pin.pinned ? "text-amber-300 hover:bg-amber-500/15" : "text-fg hover:bg-ink-800",
          )}
        >
          <Icon name="target" className="size-3" strokeWidth={2.2} />
          {pin.pinned ? "Unpin" : "Pin to frame"}
        </button>
      ) : null}
    </div>
  );
}

/** A card under the selection: the word editor's home. */
function FloatingCard({
  anchor,
  container,
  children,
}: {
  anchor: Anchor;
  container: HTMLDivElement | null;
  children: React.ReactNode;
}) {
  const { ref, style } = useFloatingPosition(anchor, container, "below");
  const width = Math.min(380, (container?.clientWidth ?? 400) - 16);
  return (
    <div
      ref={ref}
      style={{ width, ...(style ? { top: style.top, left: style.left } : { top: anchor.bottom, left: anchor.left, visibility: "hidden" }) }}
      className="absolute z-20 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.7)]"
    >
      {children}
    </div>
  );
}

/**
 * The editor for a selected run of words.
 *
 * One field, prefilled. Changing it corrects the transcript, the captions
 * and what a narrator says — which is the whole fix for a transcription
 * error. For a brand spelling, where the transcriber's word is how it is
 * actually said, one click keeps that pronunciation; a second field for a
 * different pronunciation is there but folded away, because it is rarely
 * needed and would otherwise be read every time.
 */
function WordEditor({
  words,
  otherOccurrences,
  onApply,
  onCancel,
}: {
  words: ResolvedWord[];
  otherOccurrences: number;
  onApply: (edit: { text: string; spoken: string | null }, everywhere: boolean, remember: boolean) => void;
  onCancel: () => void;
}) {
  const original = words.map((w) => w.original).join(" ");
  // For reading aloud in the hint; the alias itself keeps the transcriber's
  // punctuation, which the narrator turns into a pause.
  const heard = original.replace(/[.,!?;:]+$/, "");
  const currentText = words.map((w) => w.text).join(" ");
  const currentSpoken = words.map((w) => w.spoken).join(" ");
  const [text, setText] = useState(currentText);
  const [spoken, setSpoken] = useState<string | null>(currentSpoken !== currentText ? currentSpoken : null);
  const [showSpoken, setShowSpoken] = useState(currentSpoken !== currentText);
  const [remember, setRemember] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const trimmed = text.trim();
  const changed = trimmed !== original || spoken !== null;
  const saidAs = spoken ?? trimmed;
  const textDiffersFromHeard = trimmed && trimmed.toLowerCase() !== original.toLowerCase();

  const apply = (everywhere: boolean) => {
    if (!trimmed) return;
    // A glossary term applies to every occurrence here as well as to future
    // recordings; remembering a fix for one instance and not the rest would
    // be a strange thing to have asked for.
    onApply(
      { text: trimmed, spoken: spoken && spoken.trim() !== trimmed ? spoken : null },
      everywhere || remember,
      remember,
    );
  };

  return (
    <div
      className="rounded-xl border border-iris-500/35 bg-ink-900 p-3"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
        if (e.key === "Enter") {
          e.preventDefault();
          apply(e.metaKey || e.ctrlKey);
        }
      }}
    >
      <label htmlFor="word-editor-text" className="block text-2xs font-medium tracking-[0.12em] text-fg-faint uppercase">
        Text
      </label>
      <input
        id="word-editor-text"
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={200}
        className="mt-1 w-full rounded-lg border border-[var(--line)] bg-ink-950 px-2.5 py-1.5 text-[0.875rem] text-fg focus:border-iris-500/50 focus:outline-none"
      />
      <div className="mt-1.5 space-y-0.5 text-2xs leading-relaxed text-fg-subtle">
        {textDiffersFromHeard ? <p>Transcribed as “{heard}”.</p> : null}
        {!showSpoken ? (
          <p>
            Spoken as “{saidAs.replace(/[.,!?;:]+$/, "")}”.
            {textDiffersFromHeard && spoken === null ? (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => setSpoken(original)}
                  className="text-iris-300 underline-offset-2 hover:underline"
                >
                  Keep saying “{heard}”
                </button>
                {" · "}
              </>
            ) : (
              " "
            )}
            <button
              type="button"
              onClick={() => {
                setShowSpoken(true);
                setSpoken((s) => s ?? trimmed);
              }}
              className="text-iris-300 underline-offset-2 hover:underline"
            >
              {spoken !== null ? "Change" : "Say it differently"}
            </button>
          </p>
        ) : (
          <div>
            <label htmlFor="word-editor-spoken" className="block pt-1 text-2xs font-medium tracking-[0.12em] text-fg-faint uppercase">
              Said as
            </label>
            <input
              id="word-editor-spoken"
              value={spoken ?? ""}
              onChange={(e) => setSpoken(e.target.value)}
              maxLength={200}
              placeholder={trimmed}
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-ink-950 px-2.5 py-1.5 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none"
            />
            <p className="mt-1">
              A respelling the narrator reads instead of the text.{" "}
              <button
                type="button"
                onClick={() => {
                  setSpoken(null);
                  setShowSpoken(false);
                }}
                className="text-iris-300 underline-offset-2 hover:underline"
              >
                Say it as written
              </button>
            </p>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!trimmed} onClick={() => apply(false)}>
          Apply
        </Button>
        {otherOccurrences > 0 ? (
          <Button variant="outline" size="sm" disabled={!trimmed} onClick={() => apply(true)}>
            Apply to all {otherOccurrences + 1}
          </Button>
        ) : null}
        {textDiffersFromHeard || spoken !== null ? (
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-2xs text-fg-subtle">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-3.5 accent-[var(--color-iris-500)]"
            />
            Add to glossary
          </label>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto text-2xs text-fg-subtle underline-offset-2 hover:text-fg hover:underline"
        >
          {changed ? "Cancel" : "Close"}
        </button>
      </div>
      {remember ? (
        <p className="mt-2 text-2xs leading-relaxed text-fg-faint">
          Applies everywhere in this video, and to every recording this workspace transcribes
          from now on. Manage terms under Settings → Glossary.
        </p>
      ) : null}
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
