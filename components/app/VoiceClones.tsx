"use client";

import { useEffect, useState } from "react";
import { cn, relativeTime } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

/**
 * Voice clones, and the control that withdraws consent.
 *
 * `POST /api/voices` with `{action: "revoke"}` has existed since the render
 * worker learned to refuse a withdrawn voice — it is the promise that makes
 * cloning somebody's voice defensible, and the render pipeline checks it at
 * the last moment before bytes exist. The button that would call it did
 * nothing, on a page whose own copy said "The person cloned can revoke at
 * any time, which disables the voice for all future renders immediately."
 *
 * Revocation is reversible here because it is reversible in the API: nothing
 * is deleted, a timestamp is set, and the person who set it can unset it.
 */

interface Voice {
  id: string;
  name: string;
  kind: "studio" | "clone";
  consented_at: string | null;
  revoked_at: string | null;
  descriptor?: string;
  accent?: string;
}

export function VoiceClones() {
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const response = await fetch("/api/voices");
      const body = (await response.json()) as { data?: Voice[] };
      setVoices(body.data ?? []);
    } catch {
      setVoices([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggle = async (voice: Voice) => {
    setBusy(voice.id);
    setError(null);
    try {
      const response = await fetch("/api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_id: voice.id,
          action: voice.revoked_at ? "reinstate" : "revoke",
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "That did not work.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const clones = (voices ?? []).filter((v) => v.kind === "clone");

  if (voices === null) {
    return <p className="px-5 py-6 text-[0.8125rem] text-fg-faint">Loading…</p>;
  }

  if (clones.length === 0) {
    return (
      <p className="px-5 py-6 text-[0.8125rem] leading-relaxed text-fg-subtle">
        No voice clones in this workspace. Cloning needs a speech synthesis provider configured,
        and a spoken consent phrase from the person being cloned.
      </p>
    );
  }

  return (
    <>
      {error ? (
        <p role="alert" className="border-b border-rose-500/25 bg-rose-500/[0.07] px-5 py-2.5 text-[0.8125rem] text-rose-200">
          {error}
        </p>
      ) : null}
      <ul className="divide-y divide-[var(--line)]">
        {clones.map((voice) => {
          const revoked = Boolean(voice.revoked_at);
          return (
            <li key={voice.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <span
                className={cn(
                  "inline-flex size-10 shrink-0 items-center justify-center rounded-full",
                  revoked
                    ? "bg-ink-800"
                    : "bg-[linear-gradient(135deg,var(--color-cyan-500),var(--color-mint-500))]",
                )}
              >
                <Icon
                  name="avatar"
                  className={cn("size-4", revoked ? "text-fg-faint" : "text-white")}
                  strokeWidth={2}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "truncate text-[0.9375rem] font-medium",
                      revoked ? "text-fg-subtle line-through" : "text-fg-strong",
                    )}
                  >
                    {voice.name}
                  </span>
                  {revoked ? (
                    <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-2xs text-rose-300">
                      Revoked {relativeTime(voice.revoked_at!)}
                    </span>
                  ) : voice.consented_at ? (
                    <span className="rounded bg-mint-500/15 px-1.5 py-0.5 text-2xs text-mint-400">
                      Consented {relativeTime(voice.consented_at)}
                    </span>
                  ) : (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-2xs text-amber-400">
                      No consent on file
                    </span>
                  )}
                </span>
                <span className="block text-[0.8125rem] text-fg-subtle">
                  {revoked
                    ? "Refused by every render from now on, including re-renders of approved projects."
                    : "Usable in renders."}
                </span>
              </span>
              <Button
                variant={revoked ? "outline" : "ghost"}
                size="sm"
                disabled={busy === voice.id}
                onClick={() => void toggle(voice)}
              >
                <Icon name={revoked ? "refresh" : "trash"} className="size-3.5" strokeWidth={1.9} />
                {busy === voice.id ? "Working…" : revoked ? "Reinstate" : "Revoke"}
              </Button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
