"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn, formatDate, relativeTime } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Avatar, Panel, roleTone } from "./Shared";

/**
 * The roster, and changing it: inviting, re-sending, revoking, changing a
 * role, removing somebody.
 *
 * The page reads everything on the server. Each change here goes to its
 * route and then refreshes the page, so what is shown is what was written;
 * the rules (seats, rank, the last owner) are the server's to enforce, and
 * its refusals are shown as they come.
 */

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  lastActiveAt: string | null;
  projects: number;
  you: boolean;
}

export interface TeamManagement {
  invitations: { id: string; email: string; role: string; expiresAt: string; expired: boolean }[];
  seats: { limit: number | null; members: number; invited: number };
  invitableRoles: string[];
  mayChangeRoles: boolean;
  mayRemove: boolean;
  role: string;
}

const inputClass =
  "h-10 rounded-xl border border-[var(--line)] bg-ink-900 px-3.5 text-[0.875rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none";

async function call(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "That did not work. Try again.");
  return body;
}

export function TeamMembers({ members, manage }: { members: TeamMember[]; manage: TeamManagement | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** Bumped when a role change is refused, to put the dropdown back. */
  const [refused, setRefused] = useState(0);
  /** The last link minted, for passing on by hand. */
  const [sent, setSent] = useState<{ email: string; link: string; emailed: boolean; emailError: string | null } | null>(null);

  const run = async (key: string, work: () => Promise<void>): Promise<boolean> => {
    setBusy(key);
    setError(null);
    try {
      await work();
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(null);
    }
  };

  // Whether the viewer may act on this row at all: only an owner touches an
  // owner. The server decides; this only hides controls it would refuse.
  const outranks = (role: string) => manage !== null && (manage.role === "owner" || role !== "owner");

  const delivered = (email: string, body: Record<string, unknown>) =>
    setSent({ email, link: String(body.link), emailed: body.emailed === true, emailError: (body.emailError as string | null) ?? null });

  return (
    <div className="space-y-4">
      {manage ? (
        <InvitePanel
          manage={manage}
          busy={busy === "invite"}
          onInvite={(email, role) =>
            run("invite", async () => {
              const body = await call("/api/invitations", { method: "POST", body: JSON.stringify({ email, role }) });
              delivered(email, body);
            })
          }
        />
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3.5 py-2.5 text-[0.8125rem] text-fg">
          {error}
        </p>
      ) : null}

      {sent ? <SentNotice sent={sent} onClose={() => setSent(null)} /> : null}

      <Panel title="Members">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <thead>
              <tr>
                {["Member", "Role", "Last active", "Projects", ""].map((h, i) => (
                  <th key={i} className="border-b border-[var(--line)] px-5 py-2.5 text-2xs font-medium text-fg-faint">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const editable = !m.you && outranks(m.role);
                return (
                  <tr key={m.id}>
                    <td className="border-b border-[var(--line)] px-5 py-3">
                      <span className="flex items-center gap-3">
                        <Avatar name={m.name} hue={[...m.email].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 7)} size={32} />
                        <span className="min-w-0">
                          <span className="block truncate text-[0.875rem] font-medium text-fg-strong">
                            {m.name}
                            {m.you ? <span className="ml-1.5 text-2xs text-fg-faint">(you)</span> : null}
                          </span>
                          <span className="block truncate text-[0.75rem] text-fg-subtle">{m.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="border-b border-[var(--line)] px-5 py-3">
                      {editable && manage?.mayChangeRoles ? (
                        <select
                          // Uncontrolled, so the new role stays shown while it saves;
                          // remounted when the saved role changes or a change is refused.
                          key={`${m.role}:${refused}`}
                          aria-label={`Role for ${m.email}`}
                          defaultValue={m.role}
                          disabled={busy === `role:${m.id}`}
                          onChange={(e) => {
                            const role = e.target.value;
                            void run(`role:${m.id}`, async () => {
                              await call(`/api/members/${m.id}`, { method: "PATCH", body: JSON.stringify({ role }) });
                            }).then((ok) => ok || setRefused((n) => n + 1));
                          }}
                          className="h-8 rounded-lg border border-[var(--line)] bg-ink-900 px-2 text-[0.8125rem] capitalize text-fg focus:border-iris-500/50 focus:outline-none"
                        >
                          {manage.invitableRoles.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <RoleBadge role={m.role} />
                      )}
                    </td>
                    <td className="border-b border-[var(--line)] px-5 py-3">
                      {/* Relative to "now", which the server and the browser read a moment apart. */}
                      <span className="text-[0.8125rem] text-fg-subtle" suppressHydrationWarning>
                        {m.lastActiveAt ? relativeTime(m.lastActiveAt) : "never"}
                      </span>
                    </td>
                    <td className="border-b border-[var(--line)] px-5 py-3">
                      <span className="font-mono text-[0.8125rem] text-fg-muted">{m.projects}</span>
                    </td>
                    <td className="border-b border-[var(--line)] px-5 py-3 text-right">
                      {editable && manage?.mayRemove ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === `remove:${m.id}`}
                          onClick={() => {
                            if (!window.confirm(`Remove ${m.name} (${m.email}) from this workspace? They are signed out at once. Their projects stay.`)) return;
                            void run(`remove:${m.id}`, async () => {
                              await call(`/api/members/${m.id}`, { method: "DELETE" });
                            });
                          }}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {manage && manage.invitations.length > 0 ? (
        <Panel title="Invitations" description="Not yet accepted. Each holds a seat until it is accepted or revoked.">
          <ul className="divide-y divide-[var(--line)]">
            {manage.invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <span className="min-w-0 flex-1 basis-52">
                  <span className="block truncate text-[0.875rem] text-fg-strong">{inv.email}</span>
                  <span className={cn("block text-2xs", inv.expired ? "text-amber-400" : "text-fg-faint")}>
                    {inv.expired ? "Expired — resend for a new link" : `Expires ${formatDate(inv.expiresAt)}`}
                  </span>
                </span>
                <RoleBadge role={inv.role} />
                <span className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === `resend:${inv.id}`}
                    onClick={() =>
                      run(`resend:${inv.id}`, async () => {
                        const body = await call(`/api/invitations/${inv.id}`, { method: "POST" });
                        delivered(inv.email, body);
                      })
                    }
                  >
                    {busy === `resend:${inv.id}` ? "Sending…" : "Resend"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy === `revoke:${inv.id}`}
                    onClick={() =>
                      run(`revoke:${inv.id}`, async () => {
                        await call(`/api/invitations/${inv.id}`, { method: "DELETE" });
                      })
                    }
                  >
                    Revoke
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={cn("inline-block rounded-md border px-2 py-0.5 text-2xs capitalize", roleTone[role] ?? roleTone.viewer)}>
      {role}
    </span>
  );
}

function InvitePanel({
  manage,
  busy,
  onInvite,
}: {
  manage: TeamManagement;
  busy: boolean;
  onInvite: (email: string, role: string) => Promise<boolean>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(manage.invitableRoles.includes("creator") ? "creator" : (manage.invitableRoles.at(-1) ?? "viewer"));
  const { limit, members, invited } = manage.seats;
  const full = limit !== null && members + invited >= limit;

  return (
    <Panel
      title="Invite people"
      description={
        limit === null
          ? `${members} member${members === 1 ? "" : "s"}${invited ? `, ${invited} invited` : ""}. No seat limit on this plan.`
          : `${members + invited} of ${limit} seat${limit === 1 ? "" : "s"} used${invited ? ` (${invited} invited)` : ""}.`
      }
    >
      {full ? (
        <p className="flex items-start gap-2 px-5 py-4 text-[0.8125rem] leading-relaxed text-fg-subtle">
          <Icon name="info" className="mt-0.5 size-4 shrink-0 text-fg-faint" />
          <span>
            Every seat is taken. Move to a plan with more seats on the{" "}
            <a href="/app/billing" className="text-iris-300 hover:text-iris-400">
              billing page
            </a>
            , or revoke an invitation.
          </span>
        </p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onInvite(email.trim(), role).then((ok) => ok && setEmail(""));
          }}
        >
          <label className="min-w-0 flex-1 basis-60">
            <span className="text-[0.8125rem] font-medium text-fg">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className={cn(inputClass, "mt-1.5 w-full")}
            />
          </label>
          <label>
            <span className="text-[0.8125rem] font-medium text-fg">Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={cn(inputClass, "mt-1.5 block capitalize")}>
              {manage.invitableRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" size="md" disabled={busy}>
            {busy ? "Inviting…" : "Send invitation"}
          </Button>
        </form>
      )}
    </Panel>
  );
}

function SentNotice({
  sent,
  onClose,
}: {
  sent: { email: string; link: string; emailed: boolean; emailError: string | null };
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-mint-500/35 bg-mint-500/10 px-4 py-3 text-[0.8125rem] text-fg">
      <div className="flex items-start gap-3">
        <Icon name="check" className="mt-0.5 size-4 shrink-0 text-mint-400" strokeWidth={2.4} />
        <div className="min-w-0 flex-1">
          <p>
            {sent.emailed
              ? `Invitation emailed to ${sent.email}. You can also send them this link:`
              : sent.emailError
                ? `The email to ${sent.email} could not be sent (${sent.emailError}). Send them this link instead:`
                : `Invitation created for ${sent.email}. Send them this link:`}
          </p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={sent.link} onFocus={(e) => e.target.select()} className={cn(inputClass, "h-9 min-w-0 flex-1 font-mono text-2xs")} aria-label="Invitation link" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(sent.link).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-1.5 text-2xs text-fg-faint">Only {sent.email} can use it: they accept by signing in with that address.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Dismiss" className="text-fg-faint hover:text-fg">
          <Icon name="x" className="size-4" />
        </button>
      </div>
    </div>
  );
}
