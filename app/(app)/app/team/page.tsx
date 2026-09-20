import type { Metadata } from "next";
import { PageHeader, Panel, StatTile, Avatar } from "@/components/app/Shared";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { members, workspace, activity } from "@/lib/app-data";
import { relativeTime, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Team" };

const roleDescriptions = [
  { role: "Owner", can: "Everything, including billing and deleting the workspace." },
  { role: "Admin", can: "Manage members, brand kits, masking policies and integrations." },
  { role: "Creator", can: "Record, edit, publish and translate. Cannot change locked kits." },
  { role: "Reviewer", can: "Comment and approve. Cannot publish externally." },
  { role: "Viewer", can: "Watch and read. No editing." },
];

const roleTone: Record<string, string> = {
  Owner: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  Admin: "bg-iris-500/15 text-iris-300 border-iris-500/30",
  Creator: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  Reviewer: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Viewer: "bg-white/6 text-fg-subtle border-[var(--line)]",
};

export default function TeamPage() {
  return (
    <>
      <PageHeader
        title="Team"
        description={`${members.length} members across ${workspace.seats.total} seats. Roles are scoped per workspace, and SCIM keeps them in sync with your directory.`}
        actions={
          <>
            <Button variant="outline" size="sm">
              <Icon name="key" className="size-4" strokeWidth={1.8} />
              SSO settings
            </Button>
            <Button size="sm">
              <Icon name="plus" className="size-4" strokeWidth={2.2} />
              Invite members
            </Button>
          </>
        }
      />

      <div className="space-y-4 px-4 py-6 md:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Seats used" value={`${workspace.seats.used} / ${workspace.seats.total}`} icon="users" sub="3 available" />
          <StatTile label="Videos this month" value="41" delta="+12" icon="play" />
          <StatTile label="Pending invites" value="2" icon="mail" sub="sent 2 days ago" />
          <StatTile label="SSO enforced" value="Yes" icon="lock" sub="Okta · SAML 2.0" />
        </div>

        <Panel title="Members" description="Directory-synced via SCIM">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-left">
              <thead>
                <tr>
                  {["Member", "Role", "Last active", "Projects", ""].map((h) => (
                    <th key={h} className="border-b border-[var(--line)] px-5 py-2.5 text-2xs font-medium text-fg-faint">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.id}>
                    <td className="border-b border-[var(--line)] px-5 py-3">
                      <span className="flex items-center gap-3">
                        <Avatar name={m.name} hue={m.hue} size={32} />
                        <span className="min-w-0">
                          <span className="block truncate text-[0.875rem] font-medium text-fg-strong">
                            {m.name}
                            {i === 0 ? <span className="ml-1.5 text-2xs text-fg-faint">(you)</span> : null}
                          </span>
                          <span className="block truncate text-[0.75rem] text-fg-subtle">{m.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="border-b border-[var(--line)] px-5 py-3">
                      <span className={cn("inline-block rounded-md border px-2 py-0.5 text-2xs", roleTone[m.role])}>
                        {m.role}
                      </span>
                    </td>
                    <td className="border-b border-[var(--line)] px-5 py-3">
                      <span className="text-[0.8125rem] text-fg-subtle">{m.lastActive}</span>
                    </td>
                    <td className="border-b border-[var(--line)] px-5 py-3">
                      <span className="font-mono text-[0.8125rem] text-fg-muted">
                        {[12, 8, 19, 24, 6, 0, 0][i] ?? 0}
                      </span>
                    </td>
                    <td className="border-b border-[var(--line)] px-5 py-3 text-right">
                      <button
                        aria-label={`Manage ${m.name}`}
                        className="inline-flex size-7 items-center justify-center rounded-lg text-fg-faint transition-colors hover:bg-ink-850 hover:text-fg"
                      >
                        <Icon name="dragHandle" className="size-4" strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Panel title="Roles" description="What each role can do">
            <ul className="divide-y divide-[var(--line)]">
              {roleDescriptions.map((r) => (
                <li key={r.role} className="flex gap-4 px-5 py-3">
                  <span className={cn("h-fit shrink-0 rounded-md border px-2 py-0.5 text-2xs", roleTone[r.role])}>
                    {r.role}
                  </span>
                  <span className="text-[0.8125rem] leading-relaxed text-fg-subtle">{r.can}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Recent activity" description="Streamable to your SIEM on Enterprise">
            <ul className="divide-y divide-[var(--line)]">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-3 px-5 py-3">
                  <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg bg-ink-850 text-fg-faint">
                    <Icon
                      name={
                        a.kind === "publish" ? "rocket"
                        : a.kind === "comment" ? "quote"
                        : a.kind === "translate" ? "globe"
                        : a.kind === "invite" ? "users"
                        : a.kind === "render" ? "refresh"
                        : "wand"
                      }
                      className="size-3"
                      strokeWidth={2}
                    />
                  </span>
                  <span className="min-w-0 text-[0.8125rem] leading-snug">
                    <span className="text-fg">{a.who}</span>{" "}
                    <span className="text-fg-subtle">{a.what}</span>{" "}
                    <span className="text-fg">{a.target}</span>
                    <span className="mt-0.5 block text-2xs text-fg-faint">{relativeTime(a.when)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
