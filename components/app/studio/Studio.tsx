"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn, formatDuration } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/app/Shared";
import type { Project } from "@/lib/app-data";
import { wordKey } from "@/lib/segments";
import { Canvas, type NarratedPreviewControl } from "./Canvas";
import { Timeline } from "./Timeline";
import { clipOutputSeconds, mapOutputToSource, type EdlClip } from "@/lib/render/edl";

/** The narrated edit as the server planned it, for playing in the browser. */
interface NarrationPlan {
  /** The edit and voice it was planned for; a different key means it is stale. */
  key: string;
  voice: { id: string; name: string };
  durationSec: number;
  clips: EdlClip[];
  audio: { segmentId: string; url: string; at: number; durationSec: number }[];
  words: { seg: number; word: number; start: number; end: number }[];
}
import { Transcript, type WordEditChange } from "./Transcript";
import { CARD_SECONDS, resolveBrand } from "@/lib/brand";
import { applyOption, type CutOption, type SuggestGoal } from "@/lib/edit/suggest";
import {
  AppliedBanner,
  HistoryPanel,
  SuggestionsCard,
  goalTitle,
  goalVerb,
  type Applied,
  type CheckpointSummary,
  type Suggesting,
} from "./Suggestions";
import { kitLogoUrl } from "@/components/app/brand/BrandPreview";
import type { KitRecord } from "@/components/app/brand/BrandKitsEditor";
import { Inspector, type StudioVoice } from "./Inspector";
import { ExportDialog } from "./ExportDialog";
import { ProjectTitle } from "./ProjectTitle";
import {
  buildTimeline,
  hydrateEditState,
  serializeEditState,
  sourceTimeAt,
  timelineDuration,
  wordAt,
  type EditState,
  resolveWords,
  type EditedWord,
} from "./types";

export function Studio({
  project: initialProject,
  transcriptionLive = true,
  transcriptionMissing = [],
}: {
  project: Project;
  /** False when these words came from the mock rather than a microphone. */
  transcriptionLive?: boolean;
  transcriptionMissing?: string[];
}) {
  // Held here rather than read from the prop, because a split or merge
  // reshapes the chapters on the server and the editor swaps the fresh
  // project in without a page load. The page still remounts the Studio if
  // it is navigated to with different chapters.
  const [project, setProject] = useState(initialProject);
  // Seeded from what was saved last time. The editor used to start from the
  // defaults on every load, so a person who deleted three chapters and came
  // back the next morning found all three restored and no explanation.
  const [state, setState] = useState<EditState>(() => hydrateEditState(project.editState));

  // The playhead over the whole export: intro card, the cut, outro card.
  // `time`, derived below, is where it is within the cut, which is what the
  // timeline, the words and the footage are measured in.
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // A question pushed from the transcript's chips into the Riff panel.
  // The voices this workspace may narrate with, and which one this project
  // uses. Fetched here rather than in the Audio tab so the header can name
  // the voice before that tab has ever been opened.
  const [voices, setVoices] = useState<StudioVoice[]>([]);
  const [voiceId, setVoiceId] = useState<string | null>(project.voiceId ?? null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/voices")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((body: { data?: StudioVoice[] }) => {
        if (!cancelled) setVoices(body.data ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const narrator = voiceId ? voices.find((v) => v.id === voiceId) ?? null : null;

  // The brand kits the workspace has, and which one this project wears.
  // The canvas draws captions and the logo the kit's way, so this is
  // fetched here and not in the Brand tab.
  const [brandKits, setBrandKits] = useState<KitRecord[]>([]);
  const [brandKitId, setBrandKitId] = useState<string | null>(project.brandKitId ?? null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/brand-kits")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((body: { data?: KitRecord[] }) => {
        if (!cancelled) setBrandKits(body.data ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const brandKit = brandKitId ? brandKits.find((k) => k.id === brandKitId) ?? null : null;
  const brand = useMemo(
    () => (brandKit ? { kit: brandKit, tokens: resolveBrand(brandKit.tokens), logoUrl: kitLogoUrl(brandKit) } : null),
    [brandKit],
  );
  // With a voice chosen, chapters play whole and the cut is a cut of words,
  // not of footage. The timeline and the strip follow the render's rule.
  const narrated = voiceId !== null;
  const raf = useRef<number | null>(null);
  const last = useRef<number>(0);

  /*
   * The narrated preview.
   *
   * The render fits the footage to the readings; until the plan exists the
   * Studio can only guess at that. "Hear it narrated" asks the server for the
   * plan — every chapter read in the chosen voice, the footage fitted — and
   * the player then follows it: the video runs at each clip's speed, parks
   * on held frames, and the readings play over it. The readings are cached,
   * so a later render buys nothing twice. Any edit makes the plan stale and
   * the button offers to refresh it.
   */
  const [plan, setPlan] = useState<NarrationPlan | null>(null);
  const [planStatus, setPlanStatus] = useState<"off" | "loading" | "on" | "error">("off");
  const [planError, setPlanError] = useState<string | null>(null);
  const planKey = `${JSON.stringify(serializeEditState(state))}|${voiceId ?? ""}`;
  const planStale = plan !== null && plan.key !== planKey;
  // A stale plan keeps playing. The audio has the words as they were when
  // it was planned, which the person knows; dropping back to the recorded
  // voice on every keystroke would make the preview unusable while editing.
  const previewing = planStatus === "on" && plan !== null;

  const fetchPlan = useCallback(async () => {
    const key = planKey;
    setPlanStatus("loading");
    setPlanError(null);
    try {
      const response = await fetch(`/api/projects/${project.id}/narration/plan`, { method: "POST" });
      const body = (await response.json()) as {
        error?: string;
        voice?: { id: string; name: string };
        duration_sec?: number;
        clips?: { segment_id: string; source_start: number; source_end: number; output_start: number; speed: number; hold_sec: number }[];
        audio?: { segment_id: string; url: string; at: number; duration_sec: number }[];
        words?: { seg: number; word: number; start: number; end: number }[];
      };
      if (!response.ok || !body.clips) throw new Error(body.error ?? "The preview did not come back.");
      setPlan({
        key,
        voice: body.voice ?? { id: voiceId ?? "", name: "" },
        durationSec: body.duration_sec ?? 0,
        clips: body.clips.map((c) => ({
          label: c.segment_id,
          sourceStart: c.source_start,
          sourceEnd: c.source_end,
          outputStart: c.output_start,
          ...(c.speed !== 1 ? { speed: c.speed } : {}),
          ...(c.hold_sec > 0 ? { holdSec: c.hold_sec } : {}),
        })),
        audio: (body.audio ?? []).map((a) => ({ segmentId: a.segment_id, url: a.url, at: a.at, durationSec: a.duration_sec })),
        words: body.words ?? [],
      });
      setPlanStatus("on");
      setClock(0);
    } catch (cause) {
      setPlanStatus("error");
      setPlanError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [planKey, project.id, voiceId]);

  // Leaving the voice behind leaves the preview behind.
  useEffect(() => {
    if (!narrated) setPlanStatus("off");
  }, [narrated]);

  const editedTimeline = useMemo(
    () => buildTimeline(project, state, { continuous: narrated }),
    [project, state, narrated],
  );
  // Under the plan, the words sit where the narrator says them and the
  // source frame comes from the plan's clips, speeds and holds.
  const planTimeline = useMemo((): EditedWord[] => {
    if (!previewing || !plan) return [];
    return plan.words
      .map((w) => {
        const seg = project.segments[w.seg];
        const word = seg ? resolveWords(seg, w.seg, state).find((r) => r.wordIndex === w.word) : undefined;
        if (!word) return null;
        return {
          segIndex: w.seg,
          wordIndex: w.word,
          text: word.text,
          start: w.start,
          end: w.end,
          srcStart: mapOutputToSource(plan.clips, w.start) ?? word.t,
          cut: false,
          em: word.em,
          silent: false,
        };
      })
      .filter((w): w is EditedWord => w !== null)
      .sort((a, b) => a.start - b.start);
  }, [previewing, plan, project.segments, state]);
  const timeline = previewing ? planTimeline : editedTimeline;
  const duration = useMemo(
    () => (previewing && plan ? plan.durationSec : timelineDuration(editedTimeline)),
    [previewing, plan, editedTimeline],
  );
  // The kit's cards, as the export will have them, so the preview runs to
  // the same length the export dialog promises.
  const introSec = brand?.tokens.intro ? CARD_SECONDS : 0;
  const outroSec = brand?.tokens.outro ? CARD_SECONDS : 0;
  const total = introSec + duration + outroSec;
  const time = Math.max(0, Math.min(clock - introSec, duration));
  const card: "intro" | "outro" | null =
    clock < introSec ? "intro" : outroSec > 0 && clock >= introSec + duration ? "outro" : null;
  const planClipAt = useMemo(() => {
    if (!previewing || !plan) return null;
    return plan.clips.find((c) => time >= c.outputStart && time < c.outputStart + clipOutputSeconds(c)) ?? null;
  }, [previewing, plan, time]);
  const chapterSeconds = useMemo(() => {
    if (!previewing || !plan) return undefined;
    const out: Record<string, number> = {};
    for (const c of plan.clips) out[c.label ?? ""] = (out[c.label ?? ""] ?? 0) + clipOutputSeconds(c);
    return out;
  }, [previewing, plan]);
  const active = useMemo(() => wordAt(timeline, time), [timeline, time]);
  const activeSegIndex = active?.segIndex ?? null;
  const activeSegment = activeSegIndex !== null ? project.segments[activeSegIndex] : null;
  const inspectedIndex = selected ?? activeSegIndex;
  const inspected = inspectedIndex !== null ? project.segments[inspectedIndex] : null;

  /* ---------------- playback loop ---------------- */
  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const step = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      setClock((t) => {
        const next = t + dt;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, total]);

  // Keep the playhead inside the export when an edit shortens it or a card goes.
  useEffect(() => {
    setClock((t) => Math.min(t, total));
  }, [total]);

  /* ---------------- edits ---------------- */
  const patch = useCallback((p: Partial<EditState>) => {
    setState((s) => ({ ...s, ...p }));
    setDirty(true);
  }, []);

  /* ---------------- autosave ---------------- */
  // `dirty` rather than a save on every render: the first render must not
  // write, or opening a project you never edit would stamp its row.
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    setSaved("saving");

    // Coalesced. Ticking four checkboxes in a row is one write, not four,
    // and the last one wins — which is the only ordering that is correct
    // when the requests can overtake each other.
    const id = setTimeout(async () => {
      try {
        const response = await fetch(`/api/projects/${project.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ edit_state: serializeEditState(state) }),
        });
        setSaved(response.ok ? "saved" : "error");
      } catch {
        setSaved("error");
      }
    }, 600);

    return () => clearTimeout(id);
  }, [dirty, state, project.id]);

  const toggleSegment = useCallback(
    (i: number) => {
      setState((s) => {
        const next = new Set(s.deletedSegments);
        next.has(i) ? next.delete(i) : next.add(i);
        return { ...s, deletedSegments: next };
      });
      setDirty(true);
    },
    [],
  );

  // Saved at once, not coalesced with the edit: it is one deliberate choice,
  // and the person wants to know it took.
  const chooseVoice = useCallback(
    async (next: string | null) => {
      const previous = voiceId;
      setVoiceId(next);
      setSaved("saving");
      try {
        const response = await fetch(`/api/projects/${project.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voice_id: next }),
        });
        if (!response.ok) throw new Error();
        setSaved("saved");
      } catch {
        setVoiceId(previous);
        setSaved("error");
      }
    },
    [project.id, voiceId],
  );

  // A rewrite replaces whatever sat under it: an earlier rewrite inside the
  // run, and any hand cuts, which would otherwise remove words that no
  // longer exist as words.
  const editWords = useCallback((changes: WordEditChange[]) => {
    setState((s) => {
      const edits = new Map(s.wordEdits);
      const cuts = new Set(s.cutWords);
      for (const { key, edit } of changes) {
        const [seg, first] = key.split(":").map(Number);
        const span = edit?.span ?? edits.get(key)?.span ?? 1;
        for (let i = first; i < first + span; i++) {
          const inner = wordKey(seg, i);
          cuts.delete(inner);
          if (inner !== key) edits.delete(inner);
        }
        if (edit) edits.set(key, edit);
        else edits.delete(key);
      }
      return { ...s, wordEdits: edits, cutWords: cuts };
    });
    setDirty(true);
  }, []);

  // A glossary term is a workspace fact, saved on its own rather than with
  // the edit, and reported through the same Saved indicator.
  const rememberTerm = useCallback(async (term: { heard: string; text: string; spoken: string | null }) => {
    setSaved("saving");
    try {
      const response = await fetch("/api/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(term),
      });
      setSaved(response.ok ? "saved" : "error");
    } catch {
      setSaved("error");
    }
  }, []);

  /*
   * Sync points. A word selected in the script, then a frame chosen on the
   * player: the retimer must land that word on that frame. Pinning is a
   * two-step gesture — Pin in the script's toolbar, scrub, Pin here in the
   * transport — because the frame is chosen by looking at the picture,
   * which the script panel cannot show.
   */
  const [pinning, setPinning] = useState<{ key: string; label: string } | null>(null);
  const pinHere = useCallback(
    (at: number) => {
      if (!pinning) return;
      setState((s) => {
        const next = new Map(s.syncPoints);
        next.set(pinning.key, Math.round(at * 1000) / 1000);
        return { ...s, syncPoints: next };
      });
      setDirty(true);
      setPinning(null);
    },
    [pinning],
  );
  const unpin = useCallback((key: string) => {
    setState((s) => {
      const next = new Map(s.syncPoints);
      next.delete(key);
      return { ...s, syncPoints: next };
    });
    setDirty(true);
  }, []);
  const pins = useMemo(
    () =>
      [...state.syncPoints.keys()].map((key) => {
        const [segIndex, wordIndex] = key.split(":").map(Number);
        const seg = project.segments[segIndex];
        const word = seg ? resolveWords(seg, segIndex, state).find((r) => r.wordIndex === wordIndex) : undefined;
        return { key, label: word?.text ?? "", segIndex, wordIndex };
      }),
    [state, project.segments],
  );

  /*
   * Reshaping chapters. A split or merge rewrites the stored chapters and
   * renumbers every edit on the server, so the unsaved edit is flushed first
   * — otherwise the autosave, six hundred milliseconds later, would write
   * the old numbering over the new — and the page is refreshed to load the
   * chapters as they now are.
   */
  const router = useRouter();
  const [reshaping, setReshaping] = useState(false);
  const reshape = useCallback(
    async (body: { action: "split"; segment_index: number; word_index: number } | { action: "merge"; segment_index: number }) => {
      if (reshaping) return;
      setReshaping(true);
      setSaved("saving");
      try {
        if (dirty) {
          const flushed = await fetch(`/api/projects/${project.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ edit_state: serializeEditState(state) }),
          });
          if (!flushed.ok) throw new Error("The edit could not be saved first.");
          setDirty(false);
        }
        const response = await fetch(`/api/projects/${project.id}/segments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "The chapter could not be changed.");
        // The chapters and the renumbered edit, straight from the server, so
        // the editor shows exactly what was stored and nothing keyed on the
        // old numbering survives on this side.
        const fresh = await fetch(`/api/projects/${project.id}`);
        const payload = (await fresh.json()) as { project?: Project };
        if (!fresh.ok || !payload.project) throw new Error("The chapters changed but could not be reloaded.");
        setProject(payload.project);
        setState(hydrateEditState(payload.project.editState));
        setSelected(null);
        setPlanStatus("off");
        setSaved("saved");
        // Server components elsewhere (the project list, the header) learn
        // of the change on their next render.
        router.refresh();
      } catch (error) {
        setSaved("error");
        console.error("[studio] reshape failed:", error);
      } finally {
        setReshaping(false);
      }
    },
    [dirty, project.id, reshaping, router, state],
  );

  /*
   * A copy to experiment on. The unsaved edit is flushed first for the same
   * reason as above: the copy should carry what is on screen, not what was
   * on screen six hundred milliseconds ago. Then the copy opens, and this
   * project stays exactly as it was.
   */
  const [copying, setCopying] = useState<"idle" | "working" | "error">("idle");
  const duplicate = useCallback(async () => {
    if (copying === "working") return;
    setCopying("working");
    try {
      if (dirty) {
        setSaved("saving");
        const flushed = await fetch(`/api/projects/${project.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ edit_state: serializeEditState(state) }),
        });
        if (!flushed.ok) throw new Error("The edit could not be saved first.");
        setDirty(false);
        setSaved("saved");
      }
      const response = await fetch(`/api/projects/${project.id}/duplicate`, { method: "POST" });
      const result = (await response.json()) as { project?: Project; error?: string };
      if (!response.ok || !result.project) throw new Error(result.error ?? "The project could not be copied.");
      router.push(`/app/studio/${result.project.id}`);
    } catch (error) {
      setCopying("error");
      console.error("[studio] duplicate failed:", error);
    }
  }, [copying, dirty, project.id, router, state]);

  /**
   * Deletes the project after a confirmation and goes back to the library.
   * Nothing is flushed first: the edit is going with the project.
   */
  const [deleting, setDeleting] = useState<"idle" | "working" | "error">("idle");
  const remove = useCallback(async () => {
    if (deleting === "working") return;
    if (!window.confirm(`Delete "${project.title}"? It leaves your projects, and its share page and embeds stop working.`)) return;
    setDeleting("working");
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(result.error ?? "The project could not be deleted.");
      }
      router.push("/app/projects");
    } catch (error) {
      setDeleting("error");
      console.error("[studio] delete failed:", error);
    }
  }, [deleting, project.id, project.title, router]);

  const chooseBrandKit = useCallback(
    async (next: string | null) => {
      const previous = brandKitId;
      setBrandKitId(next);
      setSaved("saving");
      try {
        const response = await fetch(`/api/projects/${project.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brand_kit_id: next }),
        });
        if (!response.ok) throw new Error();
        setSaved("saved");
      } catch {
        setBrandKitId(previous);
        setSaved("error");
      }
    },
    [brandKitId, project.id],
  );

  /*
   * Suggested cuts. The server reads the stored edit, so the unsaved edit is
   * flushed first; the options come back measured from the transcript, and
   * picking one previews it in the script. Apply takes a checkpoint of the
   * edit as it is, then makes the cuts through the same state the hand
   * edits go through, so the autosave and the narration re-plan follow.
   */
  const [suggesting, setSuggesting] = useState<Suggesting | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const [applying, setApplying] = useState(false);

  const flushEdit = useCallback(async () => {
    if (!dirty) return;
    const flushed = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edit_state: serializeEditState(state) }),
    });
    if (!flushed.ok) throw new Error("The edit could not be saved first.");
    setDirty(false);
  }, [dirty, project.id, state]);

  const suggest = useCallback(
    async (goal: SuggestGoal) => {
      setApplied(null);
      setHistoryOpen(false);
      setSuggesting({ goal, status: "loading" });
      try {
        await flushEdit();
        const response = await fetch(`/api/projects/${project.id}/suggest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(goal.kind === "tighten" ? { goal: "tighten" } : { goal: "target", target_sec: goal.targetSec }),
        });
        const body = (await response.json()) as { options?: CutOption[]; note?: string; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Suggestions could not be made.");
        const options = body.options ?? [];
        // For a target, the one option previews at once; for tightening,
        // the middle one is the sensible starting point.
        const picked = options.length === 0 ? null : options[Math.min(options.length - 1, goal.kind === "tighten" ? 1 : 0)].id;
        setSuggesting({ goal, status: "ready", options, note: body.note ?? "", picked });
      } catch (error) {
        setSuggesting({ goal, status: "error", error: error instanceof Error ? error.message : String(error) });
      }
    },
    [flushEdit, project.id],
  );

  const pickedOption = suggesting?.status === "ready" ? suggesting.options.find((o) => o.id === suggesting.picked) ?? null : null;
  const proposed = useMemo(
    () => (pickedOption ? { words: new Set(pickedOption.cutKeys), chapters: new Set(pickedOption.chapters.map((c) => c.index)) } : null),
    [pickedOption],
  );

  const applySuggestion = useCallback(async () => {
    if (!suggesting || suggesting.status !== "ready" || !pickedOption) return;
    setApplying(true);
    try {
      const label = `Before ${goalTitle(suggesting.goal)} (${pickedOption.label})`;
      const response = await fetch(`/api/projects/${project.id}/checkpoints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, kind: "ai", edit_state: serializeEditState(state) }),
      });
      const body = (await response.json()) as { checkpoint?: { id: string }; error?: string };
      if (!response.ok || !body.checkpoint) throw new Error(body.error ?? "The checkpoint could not be saved, so nothing was changed.");
      setState((s) => applyOption(s, pickedOption));
      setDirty(true);
      setSelected(null);
      setApplied({
        label: `${goalVerb(suggesting.goal)} (${pickedOption.label})`,
        savedSec: Math.max(0, pickedOption.beforeSec - pickedOption.afterSec),
        checkpointId: body.checkpoint.id,
      });
      setHistoryKey((k) => k + 1);
      setSuggesting(null);
    } catch (error) {
      setSuggesting({ ...suggesting, status: "error", error: error instanceof Error ? error.message : String(error) } as Suggesting);
    } finally {
      setApplying(false);
    }
  }, [pickedOption, project.id, state, suggesting]);

  const restoreCheckpoint = useCallback(
    async (checkpointId: string) => {
      setRestoring(true);
      setSaved("saving");
      try {
        const response = await fetch(`/api/projects/${project.id}/checkpoints/${checkpointId}/restore`, { method: "POST" });
        const body = (await response.json()) as { edit_state?: Record<string, unknown>; error?: string };
        if (!response.ok || !body.edit_state) throw new Error(body.error ?? "Could not go back.");
        setState(hydrateEditState(body.edit_state));
        setDirty(false);
        setSaved("saved");
        setSelected(null);
        setApplied(null);
        setHistoryKey((k) => k + 1);
      } catch (error) {
        setSaved("error");
        console.error("[studio] restore failed:", error);
      } finally {
        setRestoring(false);
      }
    },
    [project.id],
  );

  const scriptPanel = (
    <>
      {suggesting ? (
        <SuggestionsCard
          suggesting={suggesting}
          applying={applying}
          onPick={(id) => setSuggesting((s) => (s && s.status === "ready" ? { ...s, picked: id } : s))}
          onApply={() => void applySuggestion()}
          onCancel={() => setSuggesting(null)}
          onRetry={() => void suggest(suggesting.goal)}
        />
      ) : null}
      {applied && !suggesting ? (
        <AppliedBanner
          applied={applied}
          busy={restoring}
          onUndo={() => void restoreCheckpoint(applied.checkpointId)}
          onDismiss={() => setApplied(null)}
          onHistory={() => setHistoryOpen(true)}
        />
      ) : null}
      {historyOpen ? (
        <HistoryPanel
          projectId={project.id}
          busy={restoring}
          refreshKey={historyKey}
          onClose={() => setHistoryOpen(false)}
          onRestore={(checkpoint: CheckpointSummary) => void restoreCheckpoint(checkpoint.id)}
        />
      ) : null}
    </>
  );

  const setWordsCut = useCallback((keys: string[], cut: boolean) => {
    setState((s) => {
      const next = new Set(s.cutWords);
      for (const key of keys) cut ? next.add(key) : next.delete(key);
      return { ...s, cutWords: next };
    });
    setDirty(true);
  }, []);

  /** Seek in export time: the transport bar and the arrow keys. */
  const seek = useCallback((t: number) => setClock(Math.max(0, Math.min(t, total))), [total]);
  /** Seek in cut time: the timeline, which does not show the cards. */
  const seekCut = useCallback(
    (t: number) => setClock(introSec + Math.max(0, Math.min(t, duration))),
    [introSec, duration],
  );

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
      if (e.key === "Escape") setPinning(null);
      if (e.key === "ArrowRight") seek(clock + (e.shiftKey ? 5 : 1));
      if (e.key === "ArrowLeft") seek(clock - (e.shiftKey ? 5 : 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clock, seek]);

  const captionText = useMemo(() => {
    if (!active) return "";
    const around = timeline.filter(
      (w) => w.segIndex === active.segIndex && w.start >= active.start - 2.2 && w.start <= active.start + 2.2,
    );
    return around.map((w) => w.text).join(" ");
  }, [active, timeline]);

  const savedMinutes = ((project.sourceDurationSec - duration) / 60).toFixed(1);

  // Where the source file should be, for the frame the playhead is over.
  const sourceTime = useMemo(
    () => (previewing && plan ? mapOutputToSource(plan.clips, time) : sourceTimeAt(timeline, time)),
    [previewing, plan, timeline, time],
  );
  const narratedPreview: NarratedPreviewControl | undefined = narrated
    ? {
        status: planStatus,
        stale: planStale,
        error: planError,
        voiceName: narrator?.name ?? "the chosen voice",
        // The button refreshes an out-of-date plan; turning the preview off
        // is the separate control beside it.
        onToggle: () => {
          if (planStatus === "on" && !planStale) {
            setPlanStatus("off");
            setClock(0);
          } else {
            void fetchPlan();
          }
        },
        onOff: () => {
          setPlanStatus("off");
          setClock(0);
        },
        audio: previewing && plan ? plan.audio : [],
        playbackRate: planClipAt?.speed ?? 1,
        holding:
          planClipAt !== null &&
          time - planClipAt.outputStart >= (planClipAt.sourceEnd - planClipAt.sourceStart) / (planClipAt.speed ?? 1),
      }
    : undefined;
  // Only when the bytes arrived. A recording row exists from the moment
  // somebody presses record, so pointing a <video> at one that never
  // finished uploading is a guaranteed 404.
  const mediaUrl =
    project.recordingId && project.hasMedia !== false
      ? `/api/recordings/${project.recordingId}/media`
      : null;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* ---------------- studio header ---------------- */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--line)] bg-ink-950 px-4 py-2.5">
        <Link
          href="/app/projects"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-ink-850 hover:text-fg"
          aria-label="Back to projects"
        >
          <Icon name="chevronLeft" className="size-4" strokeWidth={2.2} />
        </Link>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ProjectTitle projectId={project.id} title={project.title} onRenamed={(title) => setProject((p) => ({ ...p, title }))} />
            <StatusPill status={project.status} />
            {narrator ? (
              // Said in the header, not only in a tab: a render of this
              // project will not carry the voice on the recording.
              // The same tokens as the Ready pill beside it: cyan-300 is
              // remapped for the light theme, cyan-200 is not.
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-2xs font-medium text-cyan-300">
                <Icon name="mic" className="size-3" strokeWidth={2} />
                Narrated by {narrator.name}
              </span>
            ) : null}
          </div>
          <p className="flex items-center gap-2.5 text-2xs text-fg-faint">
            <span>{project.collection}</span>
            <span>·</span>
            <span className="tabular-nums">
              {formatDuration(duration)} cut from a {formatDuration(project.sourceDurationSec)} take
            </span>
            {Number(savedMinutes) > 0 ? (
              <>
                <span>·</span>
                <span className="text-mint-400">{savedMinutes} min of dead air removed</span>
              </>
            ) : null}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span
            aria-live="polite"
            className={cn(
              "hidden items-center gap-1.5 font-mono text-2xs transition-opacity sm:inline-flex",
              saved === "idle" ? "opacity-0" : "opacity-100",
              saved === "saved" && "text-mint-400",
              saved === "error" && "text-rose-300",
              (saved === "idle" || saved === "saving") && "text-fg-faint",
            )}
          >
            {saved === "saving" ? (
              <>
                <span className="size-1.5 rounded-full bg-current animate-pulse" />
                Saving
              </>
            ) : saved === "error" ? (
              <>
                <Icon name="alert" className="size-3" strokeWidth={2.4} />
                Not saved
              </>
            ) : (
              <>
                <Icon name="check" className="size-3" strokeWidth={3} />
                Saved
              </>
            )}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={duplicate}
            disabled={copying === "working"}
            title={
              copying === "error"
                ? "The copy failed. Try again."
                : "Make a copy of this project to try something different, keeping this one as it is"
            }
            className={cn(copying === "error" && "text-rose-300")}
          >
            <Icon
              name={copying === "error" ? "alert" : "copy"}
              className={cn("size-4", copying === "working" && "animate-pulse")}
              strokeWidth={1.8}
            />
            <span className="hidden sm:inline">
              {copying === "working" ? "Copying…" : copying === "error" ? "Copy failed" : "Make a copy"}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={remove}
            disabled={deleting === "working"}
            title={deleting === "error" ? "The delete failed. Try again." : "Delete this project"}
            className={cn("hover:text-rose-300", deleting === "error" && "text-rose-300")}
          >
            <Icon
              name={deleting === "error" ? "alert" : "trash"}
              className={cn("size-4", deleting === "working" && "animate-pulse")}
              strokeWidth={1.8}
            />
            <span className="hidden sm:inline">
              {deleting === "working" ? "Deleting…" : deleting === "error" ? "Delete failed" : "Delete"}
            </span>
          </Button>
          <Button href={`/d/${project.slug}`} variant="ghost" size="sm">
            <Icon name="eye" className="size-4" strokeWidth={1.8} />
            <span className="hidden sm:inline">Preview</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            <Icon name="share" className="size-4" strokeWidth={1.8} />
            <span className="hidden sm:inline">Share</span>
          </Button>
          <Button size="sm" onClick={() => setExportOpen(true)}>
            <Icon name="download" className="size-4" strokeWidth={1.9} />
            Export
          </Button>
        </div>
      </header>

      {/* ---------------- placeholder-transcript warning ---------------- */}
      {/*
        The mock providers are what make this app explorable with no
        credentials, and they are worth keeping. But a person who records
        themselves and reads back words they never said deserves to be told
        why before they spend an hour editing them — not after.
      */}
      {!transcriptionLive && project.segments.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2 text-2xs text-amber-200">
          <Icon name="alert" className="size-3.5 shrink-0" strokeWidth={2.2} />
          <span className="font-medium">This transcript is a placeholder.</span>
          <span className="text-amber-200/80">
            No speech-to-text provider is configured, so these words were generated rather than
            heard.
            {transcriptionMissing.length > 0 ? (
              <>
                {" "}
                Set <code className="font-mono">{transcriptionMissing.join(", ")}</code> and
                reprocess the take to transcribe it for real.
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      {/* ---------------- body ---------------- */}
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[19rem_1fr_19rem] 2xl:grid-cols-[22rem_1fr_21rem]">
        <div className="hidden min-h-0 min-w-0 xl:flex xl:flex-col">
          <Transcript
            project={project}
            state={state}
            timeline={timeline}
            activeWord={active}
            activeSegment={selected ?? activeSegIndex}
            onSeek={seek}
            onSelectSegment={setSelected}
            onToggleSegment={toggleSegment}
            onCutWords={setWordsCut}
            onEditWords={editWords}
            onGlossary={(term) => void rememberTerm(term)}
            pinnedKeys={narrated ? new Set(state.syncPoints.keys()) : undefined}
            onPin={narrated ? (key, label) => setPinning({ key, label }) : undefined}
            onUnpin={narrated ? unpin : undefined}
            pinningKey={pinning?.key ?? null}
            onSplit={(segIndex, wordIndex) => void reshape({ action: "split", segment_index: segIndex, word_index: wordIndex })}
            onMerge={(segIndex) => void reshape({ action: "merge", segment_index: segIndex })}
            onToggleFillers={() => patch({ removeFillers: !state.removeFillers })}
            onSuggest={(goal) => void suggest(goal === "tighten" ? { kind: "tighten" } : { kind: "target", targetSec: 60 })}
            suggesting={suggesting?.status === "loading"}
            proposed={proposed}
            panel={scriptPanel}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-col">
          <Canvas
            project={project}
            segment={activeSegment}
            captionText={captionText}
            time={clock}
            duration={total}
            cutTime={time}
            cutDuration={duration}
            card={card}
            playing={playing}
            state={state}
            mediaUrl={mediaUrl}
            sourceTime={sourceTime}
            narration={narratedPreview}
            brand={brand}
            pinning={
              pinning
                ? {
                    label: pinning.label,
                    onConfirm: () => {
                      if (sourceTime != null) pinHere(sourceTime);
                    },
                    onCancel: () => setPinning(null),
                  }
                : undefined
            }
            onScrub={seek}
            onTogglePlay={() => setPlaying((p) => !p)}
          />
          <Timeline
            project={project}
            state={state}
            timeline={timeline}
            duration={duration}
            time={time}
            playing={playing}
            activeSegment={selected ?? activeSegIndex}
            continuous={narrated}
            chapterSeconds={chapterSeconds}
            mediaUrl={mediaUrl}
            pins={narrated ? pins : []}
            onUnpin={unpin}
            onScrub={seekCut}
            onSelectSegment={setSelected}
          />
        </div>

        <div className="hidden min-h-0 min-w-0 xl:flex xl:flex-col">
          <Inspector
            project={project}
            segment={inspected}
            segmentIndex={inspectedIndex}
            state={state}
            onState={patch}
            voices={voices}
            voiceId={voiceId}
            onVoice={(next) => void chooseVoice(next)}
            brandKits={brandKits}
            brandKitId={brandKitId}
            onBrandKit={(next) => void chooseBrandKit(next)}
          />
        </div>
      </div>

      {/* small screens: stacked transcript below */}
      <div className="min-h-0 border-t border-[var(--line)] xl:hidden">
        <div className="max-h-[50vh] overflow-y-auto">
          <Transcript
            project={project}
            state={state}
            timeline={timeline}
            activeWord={active}
            activeSegment={selected ?? activeSegIndex}
            onSeek={seek}
            onSelectSegment={setSelected}
            onToggleSegment={toggleSegment}
            onCutWords={setWordsCut}
            onEditWords={editWords}
            onGlossary={(term) => void rememberTerm(term)}
            pinnedKeys={narrated ? new Set(state.syncPoints.keys()) : undefined}
            onPin={narrated ? (key, label) => setPinning({ key, label }) : undefined}
            onUnpin={narrated ? unpin : undefined}
            pinningKey={pinning?.key ?? null}
            onSplit={(segIndex, wordIndex) => void reshape({ action: "split", segment_index: segIndex, word_index: wordIndex })}
            onMerge={(segIndex) => void reshape({ action: "merge", segment_index: segIndex })}
            onToggleFillers={() => patch({ removeFillers: !state.removeFillers })}
            onSuggest={(goal) => void suggest(goal === "tighten" ? { kind: "tighten" } : { kind: "target", targetSec: 60 })}
            suggesting={suggesting?.status === "loading"}
            proposed={proposed}
            panel={scriptPanel}
          />
        </div>
      </div>

      {exportOpen ? (
        <ExportDialog
          project={project}
          duration={duration}
          brand={
            brand
              ? {
                  name: brand.kit.name,
                  cards: Number(Boolean(brand.tokens.intro)) + Number(Boolean(brand.tokens.outro)),
                  logo: Boolean(brand.logoUrl),
                }
              : null
          }
          kitsAvailable={brandKits.length > 0}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
    </div>
  );
}
