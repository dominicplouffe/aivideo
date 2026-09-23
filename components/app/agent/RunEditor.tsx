"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import type { OutlineStep } from "@/lib/agent/run";

/**
 * Everything about a run, on one screen, all of it editable.
 *
 * Sites, the sign-in used on each, the start page, the brief and the
 * steps — always visible together, because each one is the reason another
 * is wrong: a step that fails at a login is fixed in the sign-in, a step
 * that goes nowhere is fixed in the start page. Steps are planned from the
 * brief on request and shown before anything is saved.
 *
 * Four uses, one screen: a new run; a run waiting for approval, changed in
 * place; a run that stopped before it made anything, fixed and retried as
 * itself; and a run that made a project, recorded again as a new run so
 * that project and its edits stay as they are.
 */

import type { EditorMode } from "@/lib/agent/edit-mode";
export type { EditorMode };

export interface EditorInitial {
  runId?: string;
  brief: string;
  allowedOrigins: string[];
  entryUrl: string | null;
  outline: OutlineStep[];
  signIns: Record<string, string>;
  attempt?: number;
  error?: string | null;
}

interface SignIn {
  label: string;
  origin: string;
  username: string | null;
  last_used_at: string | null;
  revoked: boolean;
}

type StepDraft = {
  key: number;
  intent: string;
  url: string;
  kind: "none" | "click" | "fill";
  target: string;
  value: string;
  narration: string;
};

let nextKey = 1;
function toDraft(step: OutlineStep): StepDraft {
  return {
    key: nextKey++,
    intent: step.intent,
    url: step.url ?? "",
    kind: step.action?.kind ?? "none",
    target: step.action?.target ?? "",
    value: step.action?.kind === "fill" ? step.action.value : "",
    narration: step.narration ?? "",
  };
}
function fromDraft(d: StepDraft) {
  return {
    intent: d.intent.trim(),
    ...(d.url.trim() ? { url: d.url.trim() } : {}),
    ...(d.narration.trim() ? { narration: d.narration.trim() } : {}),
    ...(d.kind !== "none" && d.target.trim()
      ? { action: d.kind === "click" ? { kind: "click", target: d.target.trim() } : { kind: "fill", target: d.target.trim(), value: d.value } }
      : {}),
  };
}

/** Each line or comma-separated entry, as an origin; wildcards kept as typed. */
function parseSites(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      if (entry.includes("*")) return entry;
      try {
        return new URL(entry.includes("://") ? entry : `https://${entry}`).origin;
      } catch {
        return entry;
      }
    });
}

const SAVE_LABEL: Record<EditorMode, string> = {
  new: "Send for approval",
  edit: "Save changes",
  retry: "Save and send for approval",
  rerecord: "Save as a new run",
};

export function RunEditor({
  mode,
  initial,
  canManageSignIns,
  hasProject = false,
}: {
  mode: EditorMode;
  initial: EditorInitial;
  canManageSignIns: boolean;
  hasProject?: boolean;
}) {
  const router = useRouter();
  const [sitesText, setSitesText] = useState(initial.allowedOrigins.join("\n"));
  const [entryUrl, setEntryUrl] = useState(initial.entryUrl ?? "");
  const [brief, setBrief] = useState(initial.brief);
  const [steps, setSteps] = useState<StepDraft[]>(() => initial.outline.map(toDraft));
  const [signIns, setSignIns] = useState<Record<string, string>>(initial.signIns);
  const [stored, setStored] = useState<SignIn[] | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planNote, setPlanNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sites = useMemo(() => parseSites(sitesText), [sitesText]);
  const exactSites = sites.filter((site) => site.startsWith("https://") && !site.includes("*"));

  const loadSignIns = async () => {
    try {
      const response = await fetch("/api/agent/credentials");
      const body = (await response.json()) as { credentials?: SignIn[] };
      setStored((body.credentials ?? []).filter((c) => !c.revoked));
    } catch {
      setStored([]);
    }
  };
  useEffect(() => {
    void loadSignIns();
  }, []);

  // A site with exactly one saved sign-in, and none chosen yet, gets it:
  // that is the choice almost everybody would make.
  useEffect(() => {
    if (!stored) return;
    setSignIns((current) => {
      const next = { ...current };
      let changed = false;
      for (const site of exactSites) {
        const forSite = stored.filter((c) => c.origin === site);
        if (next[site] === undefined && forSite.length === 1) {
          next[site] = forSite[0].label;
          changed = true;
        }
      }
      for (const key of Object.keys(next)) {
        if (!exactSites.includes(key)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [stored, exactSites.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = async () => {
    if (steps.length > 0 && !window.confirm(`Replace the ${steps.length} steps below with new ones planned from the brief?`)) return;
    setPlanning(true);
    setError(null);
    setPlanNote(null);
    try {
      const response = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, allowed_origins: sites, entry_url: entryUrl.trim() || undefined }),
      });
      const body = (await response.json()) as { outline?: OutlineStep[]; removed?: { intent: string; reason: string }[]; error?: string };
      if (!response.ok || !body.outline) throw new Error(body.error ?? "The steps could not be planned.");
      setSteps(body.outline.map(toDraft));
      setPlanNote(
        body.removed && body.removed.length > 0
          ? `${body.outline.length} steps planned. ${body.removed.length} proposed step${body.removed.length === 1 ? " was" : "s were"} dropped: ${body.removed.map((r) => `“${r.intent}” (${r.reason})`).join("; ")}.`
          : `${body.outline.length} steps planned. Read them below and change anything before saving.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPlanning(false);
    }
  };

  const save = async () => {
    setError(null);
    const empty = steps.findIndex((s) => !s.intent.trim());
    if (empty >= 0) {
      setError(`Step ${empty + 1} needs a description.`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        brief,
        allowed_origins: sites,
        entry_url: entryUrl.trim() || undefined,
        outline: steps.map(fromDraft),
        sign_ins: signIns,
      };
      const response =
        mode === "edit" || mode === "retry"
          ? await fetch("/api/agent/runs", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: initial.runId, decision: "edit", ...payload }),
            })
          : await fetch("/api/agent/runs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payload, ...(mode === "rerecord" ? { revise_of: initial.runId } : {}) }),
            });
      const body = (await response.json()) as { run?: { id: string }; error?: string };
      if (!response.ok || !body.run) throw new Error(body.error ?? "The run was not saved.");
      router.push(`/app/agent/${body.run.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaving(false);
    }
  };

  const change = (i: number, patch: Partial<StepDraft>) => setSteps((all) => all.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: -1 | 1) =>
    setSteps((all) => {
      const j = i + by;
      if (j < 0 || j >= all.length) return all;
      const next = [...all];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const field =
    "w-full rounded-lg border border-[var(--line)] bg-ink-950 px-2.5 py-1.5 text-[0.8125rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none";
  const small = "mb-1 block text-2xs text-fg-faint";

  return (
    <div className="space-y-4">
      {mode === "retry" ? (
        <Notice tone="amber" icon="refresh">
          Attempt {initial.attempt ?? 1} stopped{initial.error ? `: ${initial.error}` : "."} Fix what went wrong below. Saving sends this run
          for approval again as attempt {(initial.attempt ?? 1) + 1}; the earlier attempt stays in its history.
        </Notice>
      ) : null}
      {mode === "rerecord" ? (
        <Notice tone="iris" icon="layers">
          This run made a project. Saving creates a new run that records into a new project, so the existing project and your
          edits to it stay exactly as they are.
        </Notice>
      ) : null}

      <Section n={1} title="Where the agent may go" hint="One site per line. The agent cannot reach anything else — not a link, a script or a redirect.">
        <textarea value={sitesText} onChange={(e) => setSitesText(e.target.value)} rows={2} placeholder={"https://app.yourproduct.com"} className={cn(field, "font-mono")} spellCheck={false} />
      </Section>

      <Section n={2} title="Sign-in for each site" hint="Which account the agent signs in with, before recording starts, so the login screen is not in the video. Use an account that signs in with an email and password.">
        {exactSites.length === 0 ? (
          <p className="text-2xs text-fg-faint">Add a site above first.</p>
        ) : (
          <div className="space-y-2">
            {exactSites.map((site) => (
              <SignInRow
                key={site}
                site={site}
                stored={stored}
                chosen={signIns[site] ?? ""}
                canManage={canManageSignIns}
                onChoose={(label) => setSignIns((all) => ({ ...all, [site]: label }))}
                onSaved={async (label) => {
                  await loadSignIns();
                  setSignIns((all) => ({ ...all, [site]: label }));
                }}
              />
            ))}
          </div>
        )}
      </Section>

      <Section n={3} title="Start at" hint="Optional. The page the agent opens first; it has to be on one of the sites.">
        <input value={entryUrl} onChange={(e) => setEntryUrl(e.target.value)} placeholder="https://app.yourproduct.com/…" className={cn(field, "h-10 font-mono")} spellCheck={false} />
      </Section>

      <Section n={4} title="What to demonstrate" hint="Plain words. Plan the steps from it, then read and change them below.">
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} className={field} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void plan()} disabled={planning || brief.trim().length < 10 || sites.length === 0}>
            <Icon name="sparkles" className="size-3.5" strokeWidth={2} />
            {planning ? "Planning…" : steps.length > 0 ? "Plan the steps again from this" : "Plan the steps from this"}
          </Button>
          {planNote ? <span className="text-2xs text-fg-subtle">{planNote}</span> : null}
        </div>
      </Section>

      <Section n={5} title={`Steps${steps.length ? ` (${steps.length})` : ""}`} hint="What the agent does, one step at a time, and what the narrator says over each.">
        {steps.length === 0 ? (
          <p className="text-2xs text-fg-faint">No steps yet. Plan them from the brief above, or add one.</p>
        ) : (
          <ol className="space-y-2.5">
            {steps.map((step, i) => (
              <li key={step.key} className="rounded-xl border border-[var(--line)] bg-ink-950/60 p-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-ink-900 font-mono text-2xs text-fg-subtle">{i + 1}</span>
                  <input value={step.intent} onChange={(e) => change(i, { intent: e.target.value })} placeholder="What this step shows" className={field} aria-label={`Step ${i + 1} description`} />
                  <div className="flex shrink-0 items-center">
                    <IconButton label="Move up" icon="chevronDown" rotate onClick={() => move(i, -1)} disabled={i === 0} />
                    <IconButton label="Move down" icon="chevronDown" onClick={() => move(i, 1)} disabled={i === steps.length - 1} />
                    <IconButton label="Remove step" icon="trash" danger onClick={() => setSteps((all) => all.filter((_, k) => k !== i))} />
                  </div>
                </div>
                <div className="mt-2.5 grid gap-2.5 pl-8 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className={small}>Open this page first (optional)</span>
                    <input value={step.url} onChange={(e) => change(i, { url: e.target.value })} placeholder="https://…" className={cn(field, "font-mono")} spellCheck={false} />
                  </label>
                  <label className="block">
                    <span className={small}>Then</span>
                    <select value={step.kind} onChange={(e) => change(i, { kind: e.target.value as StepDraft["kind"] })} className={field}>
                      <option value="none">Just show the page</option>
                      <option value="click">Click a button or link</option>
                      <option value="fill">Type into a field</option>
                    </select>
                  </label>
                  {step.kind !== "none" ? (
                    <label className="block">
                      <span className={small}>{step.kind === "click" ? "Its exact text on the page" : "The field's label or placeholder"}</span>
                      <input value={step.target} onChange={(e) => change(i, { target: e.target.value })} className={field} />
                    </label>
                  ) : null}
                  {step.kind === "fill" ? (
                    <label className="block sm:col-span-2">
                      <span className={small}>What to type</span>
                      <input value={step.value} onChange={(e) => change(i, { value: e.target.value })} className={field} />
                    </label>
                  ) : null}
                  <label className="block sm:col-span-2">
                    <span className={small}>Narration</span>
                    <textarea value={step.narration} onChange={(e) => change(i, { narration: e.target.value })} rows={2} className={field} />
                  </label>
                </div>
              </li>
            ))}
          </ol>
        )}
        <Button type="button" variant="outline" size="sm" className="mt-2.5" onClick={() => setSteps((all) => [...all, toDraft({ ordinal: all.length, intent: "" })])}>
          <Icon name="plus" className="size-3.5" strokeWidth={2.2} />
          Add a step
        </Button>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line-strong)] bg-ink-950/95 px-4 py-3 backdrop-blur">
        {error ? (
          <p role="alert" className="flex min-w-0 flex-1 items-start gap-1.5 text-[0.8125rem] text-rose-300">
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" strokeWidth={2.2} />
            {error}
          </p>
        ) : (
          <p className="min-w-0 flex-1 text-2xs text-fg-faint">Nothing records until the run is approved.</p>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving || steps.length === 0 || sites.length === 0}>
          {saving ? "Saving…" : SAVE_LABEL[mode]}
        </Button>
      </div>
    </div>
  );
}

function Section({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-ink-950 p-4">
      <div className="mb-2.5 flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-iris-500/15 font-mono text-2xs text-iris-300">{n}</span>
        <div>
          <h2 className="text-[0.875rem] font-medium text-fg-strong">{title}</h2>
          <p className="mt-0.5 text-2xs leading-relaxed text-fg-faint">{hint}</p>
        </div>
      </div>
      <div className="pl-7.5">{children}</div>
    </section>
  );
}

function Notice({ tone, icon, children }: { tone: "amber" | "iris"; icon: "refresh" | "layers"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[0.8125rem] leading-relaxed",
        tone === "amber" ? "border-amber-500/30 bg-amber-500/[0.07] text-fg" : "border-iris-500/30 bg-iris-500/[0.07] text-fg",
      )}
    >
      <Icon name={icon} className={cn("mt-0.5 size-4 shrink-0", tone === "amber" ? "text-amber-400" : "text-iris-300")} strokeWidth={1.9} />
      <span>{children}</span>
    </div>
  );
}

function IconButton({ label, icon, onClick, disabled, danger, rotate }: { label: string; icon: "chevronDown" | "trash"; onClick: () => void; disabled?: boolean; danger?: boolean; rotate?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-fg-faint disabled:opacity-30",
        danger ? "hover:bg-rose-500/15 hover:text-rose-300" : "hover:bg-ink-850 hover:text-fg",
      )}
    >
      <Icon name={icon} className={cn("size-3.5", rotate && "rotate-180")} strokeWidth={2} />
    </button>
  );
}

/**
 * The sign-in a run uses on one site: choose a saved account, add a new
 * one, or change a saved one's password. A password is never shown back.
 */
function SignInRow({
  site,
  stored,
  chosen,
  canManage,
  onChoose,
  onSaved,
}: {
  site: string;
  stored: SignIn[] | null;
  chosen: string;
  canManage: boolean;
  onChoose: (label: string) => void;
  onSaved: (label: string) => Promise<void>;
}) {
  const forSite = (stored ?? []).filter((c) => c.origin === site);
  const current = forSite.find((c) => c.label === chosen) ?? null;
  const [form, setForm] = useState<null | { mode: "add" | "password"; username: string; password: string }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = new URL(site).host;

  const submit = async () => {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const username = form.mode === "password" ? current?.username ?? "" : form.username.trim();
      const label = form.mode === "password" && current ? current.label : `${host} · ${username || "account"}`;
      const response = await fetch("/api/agent/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, origin: site, username: username || null, secret: form.password }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The sign-in was not saved.");
      setForm(null);
      await onSaved(label);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-lg border border-[var(--line)] bg-ink-950 px-2.5 py-1.5 text-[0.8125rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none";

  return (
    <div className="rounded-xl border border-[var(--line)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-2xs text-fg">{host}</span>
        <select
          value={chosen}
          onChange={(e) => {
            if (e.target.value === "__add") {
              setForm({ mode: "add", username: "", password: "" });
              return;
            }
            onChoose(e.target.value);
          }}
          className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-ink-950 px-2 py-1.5 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none"
          aria-label={`Sign-in for ${host}`}
        >
          <option value="">{stored === null ? "Loading…" : "No sign-in (the site does not need one)"}</option>
          {forSite.map((c) => (
            <option key={c.label} value={c.label}>
              {c.username ?? c.label}
            </option>
          ))}
          {canManage ? <option value="__add">Add a new sign-in…</option> : null}
        </select>
        {current && canManage ? (
          <Button type="button" variant="ghost" size="xs" onClick={() => setForm({ mode: "password", username: current.username ?? "", password: "" })}>
            Change password
          </Button>
        ) : null}
      </div>
      {current ? (
        <p className="mt-1.5 text-2xs text-fg-faint">
          Signs in as <span className="text-fg-subtle">{current.username ?? "(no email)"}</span> ·{" "}
          {current.last_used_at ? `last used ${new Date(current.last_used_at).toLocaleString()}` : "not used yet"}
        </p>
      ) : !canManage && forSite.length === 0 ? (
        <p className="mt-1.5 text-2xs text-fg-faint">No saved sign-ins for this site. An owner or admin can add one.</p>
      ) : null}

      {form ? (
        <form
          className="mt-2.5 grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {form.mode === "add" ? (
            <label className="block">
              <span className="mb-1 block text-2xs text-fg-faint">Email or username on {host}</span>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" className={field} required />
            </label>
          ) : (
            <p className="self-end text-2xs text-fg-subtle">New password for {current?.username}</p>
          )}
          <label className="block">
            <span className="mb-1 block text-2xs text-fg-faint">Password</span>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" className={field} required />
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit" size="xs" disabled={busy || !form.password || (form.mode === "add" && !form.username.trim())}>
              {busy ? "Saving…" : form.mode === "add" ? "Save sign-in" : "Save password"}
            </Button>
            <Button type="button" variant="ghost" size="xs" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <span className="text-2xs text-fg-faint">Stored encrypted, typed only into {host}, never shown again.</span>
          </div>
          {error ? <p className="text-2xs text-rose-300 sm:col-span-2">{error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
