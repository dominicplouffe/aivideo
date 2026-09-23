"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { relativeTime } from "@/lib/utils";

/**
 * The sign-ins the agent may use.
 *
 * One per site: the address the app's login page lives on, the account's
 * email, and its password. The password goes in and is never shown again;
 * saving the same site replaces it. The agent types it only into that exact
 * site, and signs in before the recording starts, so the login screen and
 * the email are not in the video.
 */

interface SignIn {
  id: string;
  label: string;
  origin: string;
  username: string | null;
  last_used_at: string | null;
  revoked: boolean;
}

/** "qore.gotrellis.com/trellis/x" or "https://qore…/login" → "https://qore.gotrellis.com". */
function originOf(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).origin;
  } catch {
    return null;
  }
}

export function SignInsPanel({ canManage, suggestedOrigins }: { canManage: boolean; suggestedOrigins: string[] }) {
  const [items, setItems] = useState<SignIn[] | null>(null);
  const [draft, setDraft] = useState({ site: suggestedOrigins[0] ?? "", username: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      const response = await fetch("/api/agent/credentials");
      const body = (await response.json()) as { credentials?: SignIn[] };
      setItems((body.credentials ?? []).filter((c) => !c.revoked));
    } catch {
      setItems([]);
    }
  };
  useEffect(() => {
    if (canManage) void load();
  }, [canManage]);

  const save = async () => {
    setError(null);
    const origin = originOf(draft.site);
    if (!origin) {
      setError("That is not a web address.");
      return;
    }
    if (!origin.startsWith("https://")) {
      setError("The sign-in page has to be on https, so the password is never sent in the clear.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/agent/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // One sign-in per site, named for it, so saving again replaces it.
        body: JSON.stringify({ label: new URL(origin).host, origin, username: draft.username.trim() || null, secret: draft.password }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The sign-in was not saved.");
      setDraft({ site: "", username: "", password: "" });
      setOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (label: string) => {
    setBusy(true);
    try {
      await fetch(`/api/agent/credentials?label=${encodeURIComponent(label)}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) {
    return (
      <p className="px-5 py-4 text-2xs leading-relaxed text-fg-faint">
        Sign-ins for the sites the agent records are managed by the workspace's owners and admins.
      </p>
    );
  }

  const field =
    "w-full rounded-lg border border-[var(--line)] bg-ink-950 px-2.5 py-1.5 text-[0.8125rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none";

  return (
    <div className="space-y-3 px-5 py-4">
      <p className="text-2xs leading-relaxed text-fg-subtle">
        If your app needs signing in, store a sign-in for it here. The agent signs in before recording, so the login
        screen is not in the video. Use a demo account with an email and password: sign-in with Google or two-factor
        codes cannot be done by the agent.
      </p>

      {items === null ? (
        <p className="text-2xs text-fg-faint">Loading…</p>
      ) : items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-2.5 py-2">
              <Icon name="key" className="size-3.5 shrink-0 text-fg-faint" strokeWidth={1.9} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-2xs text-fg">{item.origin}</span>
                <span className="block truncate text-2xs text-fg-faint">
                  {item.username ?? "no email"} · {item.last_used_at ? `used ${relativeTime(item.last_used_at)}` : "not used yet"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void remove(item.label)}
                disabled={busy}
                className="text-2xs text-fg-faint underline-offset-2 hover:text-rose-300 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <form
          className="space-y-2 rounded-lg border border-[var(--line)] bg-ink-900/60 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="block">
            <span className="mb-1 block text-2xs text-fg-faint">Site</span>
            <input value={draft.site} onChange={(e) => setDraft({ ...draft, site: e.target.value })} placeholder="https://app.yourproduct.com" className={`${field} font-mono`} spellCheck={false} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-2xs text-fg-faint">Email or username</span>
            <input value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} placeholder="demo@yourproduct.com" autoComplete="off" className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-2xs text-fg-faint">Password</span>
            <input type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} autoComplete="new-password" className={field} required />
          </label>
          {error ? (
            <p className="flex items-start gap-1.5 text-2xs text-rose-300">
              <Icon name="alert" className="mt-px size-3.5 shrink-0" strokeWidth={2.2} />
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" size="sm" disabled={busy || !draft.site.trim() || !draft.password}>
              {busy ? "Saving…" : "Save sign-in"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-2xs text-fg-faint">Stored encrypted. The password is never shown again, and is typed only into this exact site.</p>
        </form>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Icon name="plus" className="size-3.5" strokeWidth={2.2} />
          Add a sign-in
        </Button>
      )}
    </div>
  );
}
