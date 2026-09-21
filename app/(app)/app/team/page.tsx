import type { Metadata } from "next";
import { PageHeader, Panel, StatTile, Avatar } from "@/components/app/Shared";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { members as fixtureMembers, workspace, activity } from "@/lib/app-data";
import { getTeam } from "@/lib/data";
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

export default async function TeamPage() {
  // Real members, with a real project count each. The page listed the
  // fixture roster and took counts from a literal array indexed by row, so
  // the fourth person in any workspace owned exactly 24 projects.
  const team = await getTeam();
  const members = team.length > 0 ? team : fixtureMembers.map((m, i) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    lastActiveAt: null as string | null,
    projects: 0,
    hue: m.hue,
    lastActive: m.lastActive,
    index: i,
  }));

  return (
    <>
      <PageHeader
        title="Team"
        description={`${members.length} member${members.length === 1 ? "" : "s"} in this workspace. Roles are enforced on every read and write, not only in this table.`}
      />
      {/* "SSO settings" and "Invite members" had no handlers. Inviting needs
          an invitation route, which does not exist; SCIM provisioning does,
          under /api/scim/v2. */}

      <div className="space-y-4 px-4 py-6 md:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* "Videos this month 41 (+12)", "Pending invites 2 · sent 2 days
              ago" and "SSO enforced — Yes · Okta · SAML 2.0" were four
              constants describing things nothing had checked. */}
          <StatTile label="Members" value={`${members.length}`} icon="users" />
          <StatTile
            label="Projects owned"
            value={`${members.reduce((n, m) => n + m.projects, 0)}`}
            icon="play"
          />
        </div>

        <Panel title="Members">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-left">
              <thead>
                <tr>
                  {["Member", "Role", "Last active", "Projects"].map((h) => (
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
                        <Avatar
                          name={m.name}
                          hue={
                            "hue" in m
                              ? (m.hue as number)
                              : [...m.email].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 7)
                          }
                          size={32}
                        />
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
                      <span
                        className={cn(
                          "inline-block rounded-md border px-2 py-0.5 text-2xs capitalize",
                          roleTone[m.role.charAt(0).toUpperCase() + m.role.slice(1)] ??
                            "bg-white/6 text-fg-subtle border-[var(--line)]",
                        )}
                      >
                        {m.role}
                      </span>
                    </td>
                    <td className="border-b border-[var(--line)] px-5 py-3">
                      <span className="text-[0.8125rem] text-fg-subtle">
                        {m.lastActiveAt
                          ? relativeTime(m.lastActiveAt)
                          : "lastActive" in m
                            ? (m.lastActive as string)
                            : "never"}
                      </span>
                    </td>
                    <td className="border-b border-[var(--line)] px-5 py-3">
                      <span className="font-mono text-[0.8125rem] text-fg-muted">{m.projects}</span>
                    </td>
                    {/* The per-member "Manage" button had no handler. */}
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

          {/* The activity feed is the `activity` fixture — seven invented
              events with names and timestamps. The real audit log is in
              `audit_events`, hash-chained and append-only, and wants its own
              page rather than a fixture wearing its clothes. */}
          <Panel title="Recent activity" description="Sample data — the real audit log is not wired to this panel yet">
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
