"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Panel } from "./Shared";

/**
 * The studio library: the voices the synthesis vendor licenses to everybody.
 *
 * Imported rather than typed in. The page used to show four invented voices
 * under a licensing claim nobody had made; what it shows now is whatever the
 * vendor's catalogue said the last time somebody pressed Sync, and a person
 * who can hear a voice before choosing it. The sample is the vendor's own,
 * so playing it costs nothing.
 */

interface Voice {
  id: string;
  name: string;
  kind: "studio" | "clone";
  descriptor: string | null;
  accent: string | null;
  preview_url: string | null;
  available: boolean;
}

export function StudioLibrary({
  canManage,
  synthesisLive,
  synthesisMissing,
}: {
  /** Whether the viewer may import the catalogue. */
  canManage: boolean;
  synthesisLive: boolean;
  synthesisMissing: string[];
}) {
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const load = async () => {
    try {
      const response = await fetch("/api/voices");
      const body = (await response.json()) as { data?: Voice[] };
      setVoices((body.data ?? []).filter((voice) => voice.kind === "studio"));
    } catch {
      setVoices([]);
    }
  };

  useEffect(() => {
    void load();
    return () => audio.current?.pause();
  }, []);

  const sync = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const response = await fetch("/api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const body = (await response.json()) as {
        error?: string;
        added?: number;
        refreshed?: number;
        removed?: number;
        withdrawn?: number;
      };
      if (!response.ok) throw new Error(body.error ?? "The import did not complete.");
      setNotice({
        tone: "ok",
        text: `Catalogue imported: ${body.added ?? 0} added, ${body.refreshed ?? 0} refreshed, ${
          (body.removed ?? 0) + (body.withdrawn ?? 0)
        } no longer offered.`,
      });
      await load();
    } catch (cause) {
      setNotice({ tone: "error", text: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setSyncing(false);
    }
  };

  // One element for the whole grid: pressing play on a second voice stops
  // the first, which is what a person comparing two voices expects.
  const preview = (voice: Voice) => {
    if (!voice.preview_url) return;
    if (playing === voice.id) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    if (!audio.current) {
      audio.current = new Audio();
      audio.current.addEventListener("ended", () => setPlaying(null));
      audio.current.addEventListener("error", () => {
        setPlaying(null);
        setNotice({ tone: "error", text: "That sample could not be played." });
      });
    }
    audio.current.src = voice.preview_url;
    void audio.current.play().catch(() => setPlaying(null));
    setPlaying(voice.id);
  };

  return (
    <Panel
      title="Studio library"
      description="Voices offered by your synthesis provider"
      action={
        canManage ? (
          <Button variant="outline" size="sm" disabled={syncing || !synthesisLive} onClick={() => void sync()}>
            <Icon name="refresh" className={cn("size-3.5", syncing && "animate-spin")} strokeWidth={1.9} />
            {syncing ? "Importing…" : "Sync from provider"}
          </Button>
        ) : null
      }
    >
      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={cn(
            "border-b px-5 py-2.5 text-[0.8125rem]",
            notice.tone === "error"
              ? "border-rose-500/25 bg-rose-500/[0.07] text-rose-200"
              : "border-mint-500/25 bg-mint-500/[0.07] text-mint-200",
          )}
        >
          {notice.text}
        </p>
      ) : null}

      {voices === null ? (
        <p className="px-5 py-6 text-[0.8125rem] text-fg-faint">Loading…</p>
      ) : voices.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-[0.875rem] text-fg-muted">No studio voices yet.</p>
          <p className="mx-auto mt-2 max-w-md text-[0.8125rem] leading-relaxed text-fg-subtle">
            {synthesisLive
              ? canManage
                ? "Press Sync from provider to import the catalogue your synthesis vendor offers."
                : "An owner or admin can import the catalogue with Sync from provider."
              : `Synthesis is not configured, so there is no catalogue to read. Set ${
                  synthesisMissing.join(" and ") || "a synthesis provider"
                } to enable it. Until then a video carries the voice on the recording.`}
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          {voices.map((voice) => {
            const isPlaying = playing === voice.id;
            return (
              <li
                key={voice.id}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border border-[var(--line)] p-4 transition-colors hover:border-[var(--line-strong)]",
                  !voice.available && "opacity-55",
                )}
              >
                <button
                  type="button"
                  onClick={() => preview(voice)}
                  disabled={!voice.preview_url}
                  aria-label={
                    !voice.preview_url
                      ? `No sample of ${voice.name} is available`
                      : isPlaying
                        ? `Stop ${voice.name}`
                        : `Play a sample of ${voice.name}`
                  }
                  aria-pressed={isPlaying}
                  className={cn(
                    "inline-flex size-9 items-center justify-center rounded-full transition-transform",
                    voice.preview_url
                      ? "bg-[linear-gradient(135deg,var(--color-iris-600),var(--color-violet-500))] hover:scale-105"
                      : "cursor-not-allowed bg-ink-800",
                  )}
                >
                  <Icon
                    name={isPlaying ? "pause" : "play"}
                    className={cn("size-3.5", voice.preview_url ? "text-white" : "text-fg-faint")}
                  />
                </button>
                <div className="min-w-0">
                  <p className="truncate text-[0.875rem] font-medium text-fg-strong">{voice.name}</p>
                  <p className="truncate text-2xs text-fg-subtle">
                    {!voice.available
                      ? "No longer offered by the provider"
                      : [voice.accent, voice.descriptor].filter(Boolean).join(" · ") ||
                        (voice.preview_url ? "Studio voice" : "No sample available")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
