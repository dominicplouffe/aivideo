"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Panel } from "./Shared";
import { integrations } from "@/lib/marketing-data";
import { workspace, currentUser } from "@/lib/app-data";

type Tab = "general" | "security" | "masking" | "integrations" | "api";

const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: "general", label: "General", icon: "settings" },
  { id: "security", label: "Security", icon: "shield" },
  { id: "masking", label: "Masking", icon: "lock" },
  { id: "integrations", label: "Integrations", icon: "puzzle" },
  { id: "api", label: "API keys", icon: "key" },
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
        {tab === "general" ? <General /> : null}
        {tab === "security" ? <Security /> : null}
        {tab === "masking" ? <Masking /> : null}
        {tab === "integrations" ? <Integrations /> : null}
        {tab === "api" ? <ApiKeys /> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- general */

function General() {
  return (
    <>
      <Panel title="Workspace">
        <div className="space-y-4 p-5">
          <Field label="Workspace name" defaultValue={workspace.name} />
          <Field label="Workspace URL" defaultValue="meridian" prefix="demoriff.com/" />
          <Field label="Custom share domain" defaultValue="demos.meridian.app" hint="CNAME to share.demoriff.com — certificate issued automatically." />
          <Select label="Default language" options={["English (US)", "English (UK)", "German", "Japanese"]} />
        </div>
        <div className="border-t border-[var(--line)] p-4">
          <Button size="sm">Save changes</Button>
        </div>
      </Panel>

      <Panel title="Your profile">
        <div className="space-y-4 p-5">
          <Field label="Name" defaultValue={currentUser.name} />
          <Field label="Email" defaultValue={currentUser.email} hint="Managed by your identity provider." disabled />
          <Select label="Theme" options={["Dark", "System"]} />
        </div>
      </Panel>

      <Panel title="Danger zone">
        <div className="flex flex-wrap items-center gap-3 p-5">
          <div className="min-w-0 flex-1">
            <p className="text-[0.875rem] font-medium text-fg-strong">Delete workspace</p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
              Exports remain available for 90 days, after which everything is purged from primary
              storage, replicas and backups. We issue a signed deletion certificate on request.
            </p>
          </div>
          <Button variant="danger" size="sm" className="shrink-0">Delete workspace</Button>
        </div>
      </Panel>
    </>
  );
}

/* ---------------------------------------------------------- security */

function Security() {
  const rows = [
    { label: "SAML single sign-on", value: "Okta · enforced", on: true },
    { label: "SCIM provisioning", value: "Synced 14 minutes ago", on: true },
    { label: "Enforced domain capture", value: "meridian.app", on: true },
    { label: "Two-factor for non-SSO", value: "Required", on: true },
    { label: "Session length", value: "12 hours", on: true },
    { label: "IP allowlist", value: "Not configured", on: false },
  ];
  return (
    <>
      <Panel title="Identity">
        <ul className="divide-y divide-[var(--line)]">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-4 px-5 py-3.5">
              <Icon
                name={r.on ? "check" : "x"}
                className={cn("size-4 shrink-0", r.on ? "text-mint-400" : "text-fg-faint")}
                strokeWidth={2.4}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.875rem] text-fg">{r.label}</span>
                <span className="block text-2xs text-fg-faint">{r.value}</span>
              </span>
              <Button variant="ghost" size="xs" className="shrink-0">
                {r.on ? "Configure" : "Enable"}
              </Button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Data residency">
        <div className="space-y-4 p-5">
          <div className="grid gap-2 sm:grid-cols-3">
            {["United States", "European Union", "Australia"].map((r, i) => (
              <button
                key={r}
                type="button"
                className={cn(
                  "rounded-xl border px-3.5 py-3 text-left transition-colors",
                  i === 0 ? "border-iris-500/45 bg-iris-500/[0.08]" : "border-[var(--line)] hover:border-[var(--line-strong)]",
                )}
              >
                <span className="block text-[0.8125rem] font-medium text-fg">{r}</span>
                <span className="block text-2xs text-fg-faint">
                  {i === 0 ? "Active · us-east-1" : "Available"}
                </span>
              </button>
            ))}
          </div>
          <p className="flex items-start gap-2.5 rounded-xl border border-[var(--line)] bg-ink-900 p-3.5 text-[0.8125rem] leading-relaxed text-fg-subtle">
            <Icon name="info" className="mt-0.5 size-4 shrink-0 text-iris-400" strokeWidth={1.9} />
            Capture, processing and storage are pinned to the selected region. Private rendering
            inside your own cloud account is available on Enterprise.
          </p>
        </div>
      </Panel>

      <Panel title="Audit log">
        <div className="space-y-3 p-5">
          <p className="text-[0.8125rem] leading-relaxed text-fg-subtle">
            Every view, export, share, permission change, masking rule and agent run, with actor,
            timestamp, IP and resource. Retained 24 months.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">
              <Icon name="download" className="size-4" strokeWidth={1.8} />
              Export CSV
            </Button>
            <Button variant="outline" size="sm">
              <Icon name="link" className="size-4" strokeWidth={1.8} />
              Stream to SIEM
            </Button>
          </div>
        </div>
      </Panel>
    </>
  );
}

/* ---------------------------------------------------------- masking */

function Masking() {
  const rules = [
    { type: "detector", label: "Email addresses", detail: "Built-in detector", enforced: true },
    { type: "detector", label: "Card numbers and IBANs", detail: "Built-in detector", enforced: true },
    { type: "detector", label: "API keys and JWTs", detail: "Built-in detector", enforced: true },
    { type: "selector", label: "[data-customer-name]", detail: "Blur · DOM selector", enforced: true },
    { type: "region", label: "Left panel (0–18%)", detail: "Pixelate · fixed region", enforced: false },
    { type: "pattern", label: "ACC-[0-9]{8}", detail: "Redact · regex", enforced: true },
  ];
  const tone: Record<string, string> = {
    detector: "bg-iris-500/15 text-iris-300",
    selector: "bg-cyan-500/15 text-cyan-300",
    region: "bg-amber-500/15 text-amber-400",
    pattern: "bg-violet-500/15 text-violet-400",
  };

  return (
    <>
      <Panel title="Production safeguards" description="Applied at capture, before frames are encoded">
        <ul className="divide-y divide-[var(--line)]">
          {rules.map((r) => (
            <li key={r.label} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-mono text-2xs", tone[r.type])}>
                {r.type}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[0.8125rem] text-fg">{r.label}</span>
                <span className="block text-2xs text-fg-faint">{r.detail}</span>
              </span>
              {r.enforced ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded bg-mint-500/15 px-1.5 py-0.5 text-2xs text-mint-400">
                  <Icon name="lock" className="size-2.5" strokeWidth={2.6} />
                  Enforced
                </span>
              ) : (
                <span className="shrink-0 rounded bg-white/6 px-1.5 py-0.5 text-2xs text-fg-faint">
                  Advisory
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] p-4">
          <Button variant="outline" size="sm">
            <Icon name="plus" className="size-4" strokeWidth={2.2} />
            Add rule
          </Button>
          <p className="min-w-0 flex-1 text-2xs leading-relaxed text-fg-faint">
            Enforced rules cannot be disabled by the person recording. Masking applies to frames,
            transcripts, generated guides, screenshots and the search index.
          </p>
        </div>
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
              assets are never used to train any model, ours or a subprocessor's, on any plan. Every
              inference subprocessor operates under a zero-retention agreement.
            </p>
          </div>
        </div>
      </Panel>
    </>
  );
}

/* ---------------------------------------------------------- integrations */

function Integrations() {
  const connected = ["Slack", "HubSpot", "Zendesk", "Notion", "Okta"];
  return (
    <Panel title="Integrations" description="42 available · 5 connected">
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        {integrations.map((it) => {
          const on = connected.includes(it.name);
          return (
            <div
              key={it.name}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3.5",
                on ? "border-mint-500/30 bg-mint-500/[0.05]" : "border-[var(--line)]",
              )}
            >
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink-850 text-iris-400">
                <Icon name={it.icon} className="size-4" strokeWidth={1.7} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.875rem] font-medium text-fg-strong">{it.name}</span>
                <span className="block truncate text-2xs text-fg-faint">{it.category}</span>
              </span>
              <Button variant={on ? "ghost" : "outline"} size="xs" className="shrink-0">
                {on ? "Configure" : "Connect"}
              </Button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------- api keys */

function ApiKeys() {
  const keys = [
    { name: "CI render pipeline", prefix: "dr_live_7f2a", created: "Mar 4, 2026", lastUsed: "2 hours ago", scope: "renders:write" },
    { name: "Help center sync", prefix: "dr_live_91cb", created: "Jan 18, 2026", lastUsed: "yesterday", scope: "guides:write" },
    { name: "Warehouse export", prefix: "dr_live_3e08", created: "Nov 2, 2025", lastUsed: "5 days ago", scope: "analytics:read" },
  ];
  return (
    <>
      <Panel title="API keys" description="Scoped, rotatable, never shown again after creation">
        <ul className="divide-y divide-[var(--line)]">
          {keys.map((k) => (
            <li key={k.prefix} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[0.875rem] font-medium text-fg-strong">{k.name}</span>
                <span className="block font-mono text-2xs text-fg-faint">
                  {k.prefix}••••••••••••••••
                </span>
              </span>
              <span className="shrink-0 rounded-md bg-ink-850 px-2 py-0.5 font-mono text-2xs text-cyan-300">
                {k.scope}
              </span>
              <span className="w-28 shrink-0 text-2xs text-fg-faint">Used {k.lastUsed}</span>
              <span className="flex shrink-0 gap-1">
                <Button variant="ghost" size="xs">Rotate</Button>
                <Button variant="ghost" size="xs">Revoke</Button>
              </span>
            </li>
          ))}
        </ul>
        <div className="border-t border-[var(--line)] p-4">
          <Button size="sm">
            <Icon name="plus" className="size-4" strokeWidth={2.2} />
            Create API key
          </Button>
        </div>
      </Panel>

      <Panel title="Webhooks">
        <ul className="divide-y divide-[var(--line)]">
          {[
            { url: "https://hooks.meridian.app/demoriff", events: 7, status: "Healthy" },
            { url: "https://ci.meridian.app/webhooks/render", events: 2, status: "Healthy" },
          ].map((w) => (
            <li key={w.url} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
              <span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] text-fg">{w.url}</span>
              <span className="shrink-0 text-2xs text-fg-faint">{w.events} events</span>
              <span className="shrink-0 rounded-md bg-mint-500/15 px-2 py-0.5 text-2xs text-mint-400">
                {w.status}
              </span>
            </li>
          ))}
        </ul>
        <div className="border-t border-[var(--line)] p-4">
          <Button href="/docs/api" variant="outline" size="sm">
            <Icon name="code" className="size-4" strokeWidth={1.8} />
            API reference
          </Button>
        </div>
      </Panel>
    </>
  );
}

/* ---------------------------------------------------------- fields */

function Field({
  label,
  defaultValue,
  hint,
  prefix,
  disabled,
}: {
  label: string;
  defaultValue?: string;
  hint?: string;
  prefix?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-[0.8125rem] font-medium text-fg">{label}</label>
      <div className="flex items-center">
        {prefix ? (
          <span className="rounded-l-xl border border-r-0 border-[var(--line)] bg-ink-850 px-3 py-2.5 font-mono text-[0.75rem] text-fg-faint">
            {prefix}
          </span>
        ) : null}
        <input
          defaultValue={defaultValue}
          disabled={disabled}
          className={cn(
            "h-10 w-full border border-[var(--line)] bg-ink-900 px-3.5 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none disabled:opacity-55",
            prefix ? "rounded-r-xl" : "rounded-xl",
          )}
        />
      </div>
      {hint ? <p className="mt-1.5 text-2xs text-fg-faint">{hint}</p> : null}
    </div>
  );
}

function Select({ label, options }: { label: string; options: string[] }) {
  return (
    <div>
      <label className="mb-2 block text-[0.8125rem] font-medium text-fg">{label}</label>
      <select className="h-10 w-full rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}
