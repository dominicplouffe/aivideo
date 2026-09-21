"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Panel } from "./Shared";

/**
 * The workspace glossary: words spelled the workspace's way.
 *
 * Each row is a fix made once. The transcriber is primed with the spelling
 * on every new recording, what it still gets wrong is corrected before
 * anyone sees it, and a narrator is told how the word is said when the
 * spelling would mislead it. Most terms arrive from the Studio's word
 * editor; this is where they are reviewed and retired.
 */

interface Term {
  id: string;
  heard: string;
  text: string;
  spoken: string | null;
}

export function GlossaryEditor() {
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [draft, setDraft] = useState({ heard: "", text: "", spoken: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const response = await fetch("/api/glossary");
      const body = (await response.json()) as { data?: Term[] };
      setTerms(body.data ?? []);
    } catch {
      setTerms([]);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "That term was not saved.");
      setDraft({ heard: "", text: "", spoken: "" });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (term: Term) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/glossary?id=${encodeURIComponent(term.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("That term was not removed.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-lg border border-[var(--line)] bg-ink-950 px-2.5 py-1.5 text-[0.8125rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none";

  return (
    <Panel
      title="Glossary"
      description="Words this workspace spells its own way. Applied to every new recording, and to the narrator."
    >
      {error ? (
        <p role="alert" className="border-b border-rose-500/25 bg-rose-500/[0.07] px-5 py-2.5 text-[0.8125rem] text-rose-200">
          {error}
        </p>
      ) : null}

      <form
        className="grid gap-2 border-b border-[var(--line)] px-5 py-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-2xs font-medium tracking-[0.12em] text-fg-faint uppercase">Heard as</span>
          <input value={draft.heard} onChange={(e) => setDraft({ ...draft, heard: e.target.value })} placeholder="core" className={field} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-2xs font-medium tracking-[0.12em] text-fg-faint uppercase">Show as</span>
          <input value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="Qore" className={field} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-2xs font-medium tracking-[0.12em] text-fg-faint uppercase">Said as</span>
          <input value={draft.spoken} onChange={(e) => setDraft({ ...draft, spoken: e.target.value })} placeholder="as written" className={field} />
        </label>
        <div className="flex items-end">
          <Button size="sm" type="submit" disabled={busy || !draft.heard.trim() || !draft.text.trim()}>
            <Icon name="plus" className="size-3.5" strokeWidth={2.2} />
            Add
          </Button>
        </div>
      </form>

      {terms === null ? (
        <p className="px-5 py-6 text-[0.8125rem] text-fg-faint">Loading…</p>
      ) : terms.length === 0 ? (
        <p className="px-5 py-6 text-[0.8125rem] leading-relaxed text-fg-subtle">
          No terms yet. Add one here, or tick “Add to glossary” when you correct a word in the Studio.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {terms.map((term) => (
            <li key={term.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="min-w-0 flex-1 text-[0.875rem]">
                <span className="text-fg-faint line-through decoration-fg-faint/60">{term.heard}</span>
                <span className="mx-2 text-fg-faint">→</span>
                <span className="font-medium text-fg-strong">{term.text}</span>
                {term.spoken ? (
                  <span className={cn("ml-2 text-2xs text-fg-subtle")}>said “{term.spoken}”</span>
                ) : null}
              </span>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove(term)} aria-label={`Remove ${term.text}`}>
                <Icon name="trash" className="size-3.5" strokeWidth={1.9} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
