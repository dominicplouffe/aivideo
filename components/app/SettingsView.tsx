"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Panel } from "./Shared";
import { ThemePicker } from "./ThemePicker";
import { GlossaryEditor } from "./GlossaryEditor";

/**
 * Workspace settings.
 *
 * This page previously asserted an entire security posture that nothing
 * checked: "SAML single sign-on — Okta · enforced", "SCIM provisioning —
 * Synced 14 minutes ago", six masking rules marked Enforced, three API keys
 * with prefixes and last-used times, "42 available · 5 connected". All of it
 * was hardcoded, and every button on the page — Save changes, Delete
 * workspace, Connect, Rotate, Revoke, Create API key, Stream to SIEM — had
 * no handler.
 *
 * A settings screen is where somebody goes to find out what is true about
 * their account. Inventing the answer is worse here than anywhere else in a
 * product, so what is real is wired up and what is not says so.
 */

type Tab = "general" | "glossary" | "security" | "integrations";

const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: "general", label: "General", icon: "settings" },
  { id: "glossary", label: "Glossary", icon: "book" },
  { id: "security", label: "Security", icon: "shield" },
  { id: "integrations", label: "Integrations", icon: "puzzle" },
];

export function SettingsView() {
  const [tab, setTab] = useState<Tab>("general");

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mb-5 flex flex-wrap gap-1 border-b border-[var(--line)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id}
            className={cn(
              "-mb-px inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[0.8125rem] font-medium transition-colors",
              tab === t.id
                ? "border-iris-500 text-fg-strong"
                : "border-transparent text-fg-subtle hover:text-fg",
            )}
          >
            <Icon name={t.icon} className="size-4" strokeWidth={1.8} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-w-3xl space-y-4">
        {tab === "general" ? (
          <>
            <Panel title="Appearance" description="Saved on this device, not on the workspace">
              <div className="p-5">
                <ThemePicker />
              </div>
            </Panel>
            <General />
          </>
        ) : null}
        {tab === "glossary" ? <GlossaryEditor /> : null}
        {tab === "security" ? <Security /> : null}
        {tab === "integrations" ? <Integrations /> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- general */

interface WorkspaceSettings {
  name: string;
  slug: string;
  plan: string;
  region: string;
  share_domain: string | null;
  hard_stop_at_limit: boolean;
}

function General() {
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [shareDomain, setShareDomain] = useState("");
  const [hardStop, setHardStop] = useState(false);
  const [state, setState] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/workspace");
        const body = (await response.json()) as { workspace?: WorkspaceSettings; error?: string };
        if (!response.ok || !body.workspace) throw new Error(body.error ?? "Could not load settings.");
        setSettings(body.workspace);
        setName(body.workspace.name);
        setSlug(body.workspace.slug);
        setShareDomain(body.workspace.share_domain ?? "");
        setHardStop(body.workspace.hard_stop_at_limit);
        setState("idle");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setState("error");
      }
    })();
  }, []);

  const save = async () => {
    setState("saving");
    setError(null);
    try {
      const response = await fetch("/api/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          share_domain: shareDomain,
          hard_stop_at_limit: hardStop,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "That did not save.");
      setState("saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setState("error");
    }
  };

  if (state === "loading") {
    return <Panel title="Workspace"><p className="p-5 text-[0.8125rem] text-fg-faint">Loading…</p></Panel>;
  }

  return (
    <>
      <Panel title="Workspace">
        <div className="space-y-4 p-5">
          <Field label="Workspace name" value={name} onChange={setName} />
          <Field label="Workspace URL" value={slug} onChange={setSlug} prefix="demoriff.com/" />
          <Field
            label="Custom share domain"
            value={shareDomain}
            onChange={setShareDomain}
            placeholder="demos.example.com"
            hint="Point a CNAME at this deployment. Leave blank to serve share pages from here."
          />
          <Toggle
            label="Stop renders at the plan limit"
            hint="Off by default. Running out mid-launch is worse than an overage line."
            on={hardStop}
            onChange={setHardStop}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] p-4">
          <Button size="sm" disabled={state === "saving"} onClick={() => void save()}>
            {state === "saving" ? "Saving…" : "Save changes"}
          </Button>
          {state === "saved" ? (
            <span className="inline-flex items-center gap-1.5 text-2xs text-mint-400">
              <Icon name="check" className="size-3" strokeWidth={3} />
              Saved
            </span>
          ) : null}
          {error ? <span className="text-2xs text-rose-300">{error}</span> : null}
        </div>
      </Panel>

      <Panel title="Plan">
        <div className="space-y-1.5 p-5">
          <Readout label="Plan" value={settings?.plan ?? "—"} />
          <Readout label="Region" value={(settings?.region ?? "").toUpperCase() || "—"} />
        </div>
      </Panel>

      {/*
        The danger zone is gone until deletion works.

        It was a `variant="danger"` button with no confirmation and no
        effect, beside a paragraph promising purges from replicas and
        backups and a signed deletion certificate. `lib/db/erase.ts` is the
        real erasure path; this returns when a route calls it.
      */}
    </>
  );
}

/* ---------------------------------------------------------- security */

interface SessionRow {
  id: string;
  created_at: string;
  last_seen_at: string;
  ip: string | null;
  user_agent: string | null;
  current: boolean;
}

interface SiemDestination {
  id: string;
  name: string;
  kind?: string;
  url?: string;
}

function Security() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [destinations, setDestinations] = useState<SiemDestination[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const [auth, siem] = await Promise.all([
      fetch("/api/auth").then((r) => (r.ok ? r.json() : { sessions: [] })),
      fetch("/api/siem").then((r) => (r.ok ? r.json() : { destinations: [] })),
    ]);
    setSessions((auth as { sessions?: SessionRow[] }).sessions ?? []);
    setDestinations((siem as { destinations?: SiemDestination[] }).destinations ?? []);
  };

  useEffect(() => {
    void load().catch(() => {
      setSessions([]);
      setDestinations([]);
    });
  }, []);

  const signOutEverywhere = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth?all=true", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not end those sessions.");
      window.location.href = "/signin";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  };

  return (
    <>
      {/*
        Sessions, which are real and revocable — the one security control on
        this page that was already implemented end to end, and the one the
        page did not mention. What it listed instead was six hardcoded rows
        claiming Okta SSO was enforced and SCIM had synced fourteen minutes
        ago.
      */}
      <Panel
        title="Where you are signed in"
        description="Ending a session takes effect on the next request, not at the next expiry"
      >
        {sessions === null ? (
          <p className="p-5 text-[0.8125rem] text-fg-faint">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="p-5 text-[0.8125rem] text-fg-subtle">No active sessions to show.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {sessions.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <Icon
                  name={session.current ? "check" : "clock"}
                  className={cn("size-4 shrink-0", session.current ? "text-mint-400" : "text-fg-faint")}
                  strokeWidth={2.2}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] text-fg">
                    {session.user_agent ?? "Unknown client"}
                    {session.current ? " · this device" : ""}
                  </span>
                  <span className="block text-2xs text-fg-faint">
                    {session.ip ?? "no address recorded"} · last seen{" "}
                    {new Date(session.last_seen_at).toLocaleString()}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] p-4">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void signOutEverywhere()}>
            {busy ? "Ending…" : "Sign out everywhere"}
          </Button>
          {error ? <span className="text-2xs text-rose-300">{error}</span> : null}
        </div>
      </Panel>

      <Panel
        title="Audit log"
        description="Append-only, hash-chained, with actor, timestamp, IP and resource"
      >
        <div className="space-y-3 p-5">
          {destinations === null ? (
            <p className="text-[0.8125rem] text-fg-faint">Loading…</p>
          ) : destinations.length === 0 ? (
            <p className="text-[0.8125rem] leading-relaxed text-fg-subtle">
              No SIEM destination is registered. The log is recorded either way;{" "}
              <code className="font-mono text-fg-muted">POST /api/siem</code> registers a collector
              to stream it to.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {destinations.map((destination) => (
                <li
                  key={destination.id}
                  className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2"
                >
                  <Icon name="check" className="size-3 shrink-0 text-mint-400" strokeWidth={3} />
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-fg">
                    {destination.name}
                  </span>
                  <span className="shrink-0 font-mono text-2xs text-fg-faint">
                    {destination.kind ?? "siem"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Panel title="Single sign-on">
        <p className="p-5 text-[0.8125rem] leading-relaxed text-fg-subtle">
          {/*
            Previously: "SAML single sign-on — Okta · enforced" with a green
            tick, on a deployment where no identity provider was configured.
          */}
          Sign-in, SSO and SCIM all run on WorkOS AuthKit and need{" "}
          <code className="font-mono text-fg-muted">WORKOS_API_KEY</code> and{" "}
          <code className="font-mono text-fg-muted">WORKOS_CLIENT_ID</code> set on the deployment.
          Whether they are is a property of the server, not of this workspace, so this page will not
          guess at it. Connecting your own identity provider needs a WorkOS organization recorded
          against this workspace, which is not yet something this screen can do.
        </p>
      </Panel>

      <Panel title="Model training">
        <div className="flex items-start gap-3.5 p-5">
          <Icon name="brain" className="mt-0.5 size-5 shrink-0 text-mint-400" strokeWidth={1.8} />
          <div>
            <p className="text-[0.875rem] font-medium text-fg-strong">
              Your content never enters a training set
            </p>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-fg-subtle">
              This is not a setting because it is not optional. Media, transcripts and derived
              assets are never used to train any model, and nothing in this codebase sends them
              anywhere but the transcription, synthesis and translation calls a render needs.
            </p>
          </div>
        </div>
      </Panel>
    </>
  );
}

/* ---------------------------------------------------------- integrations */

interface Vendor {
  id: string;
  name: string;
  category?: string;
}

interface Installation {
  id: string;
  vendor: string;
  status?: string;
  last_sync_at?: string | null;
}

function Integrations() {
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [installations, setInstallations] = useState<Installation[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/connectors");
        const body = (await response.json()) as {
          vendors?: Vendor[];
          installations?: Installation[];
        };
        setVendors(body.vendors ?? []);
        setInstallations(body.installations ?? []);
      } catch {
        setVendors([]);
      }
    })();
  }, []);

  if (vendors === null) {
    return <Panel title="Integrations"><p className="p-5 text-[0.8125rem] text-fg-faint">Loading…</p></Panel>;
  }

  const connected = new Set(installations.map((i) => i.vendor));

  return (
    <Panel
      title="Help centre connectors"
      // Counted, not asserted. The description used to read "42 available ·
      // 5 connected" over a hardcoded list of five names.
      description={`${vendors.length} available · ${connected.size} connected`}
    >
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        {vendors.map((vendor) => {
          const installation = installations.find((i) => i.vendor === vendor.id);
          return (
            <div
              key={vendor.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3.5",
                installation ? "border-mint-500/30 bg-mint-500/[0.05]" : "border-[var(--line)]",
              )}
            >
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink-850 text-iris-400">
                <Icon name="puzzle" className="size-4" strokeWidth={1.7} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.875rem] font-medium text-fg-strong">{vendor.name}</span>
                <span className="block truncate text-2xs text-fg-faint">
                  {installation
                    ? installation.last_sync_at
                      ? `Synced ${new Date(installation.last_sync_at).toLocaleDateString()}`
                      : "Connected, never synced"
                    : (vendor.category ?? "Not connected")}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="border-t border-[var(--line)] px-5 py-3 text-2xs leading-relaxed text-fg-faint">
        Connecting one needs its OAuth credentials on the deployment. The Connect buttons that used
        to sit here had no handlers.
      </p>
    </Panel>
  );
}

/* ---------------------------------------------------------- bits */

function Field({
  label,
  value,
  onChange,
  prefix,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  hint?: string;
  placeholder?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-fg">
        {label}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        {prefix ? <span className="shrink-0 font-mono text-2xs text-fg-faint">{prefix}</span> : null}
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-ink-900 px-3.5 text-[0.875rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none"
        />
      </div>
      {hint ? <p className="mt-1.5 text-2xs leading-relaxed text-fg-faint">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center gap-3 rounded-lg py-1.5 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[0.8125rem] text-fg">{label}</span>
        {hint ? <span className="block text-2xs text-fg-faint">{hint}</span> : null}
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

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[0.8125rem] text-fg-subtle">{label}</span>
      <span className="font-mono text-2xs text-fg-muted">{value}</span>
    </div>
  );
}
