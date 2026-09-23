"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { relativeTime } from "@/lib/utils";

/**
 * The sign-ins saved for the agent, across runs.
 *
 * Added and changed where they are used — in a run's editor, beside the
 * site they sign in to — so there is one way to do it. This list is for
 * seeing what is saved, when each was last used, and removing what is no
 * longer needed. A run that chose a removed sign-in says so and asks for
 * another before it can be approved.
 */

interface SignIn {
  id: string;
  label: string;
  origin: string;
  username: string | null;
  last_used_at: string | null;
  revoked: boolean;
}

export function SignInsPanel({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<SignIn[] | null>(null);
  const [busy, setBusy] = useState(false);

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
    void load();
  }, []);

  const remove = async (label: string) => {
    if (!window.confirm(`Remove the saved sign-in ${label}? Runs that use it will ask for another.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/agent/credentials?label=${encodeURIComponent(label)}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 px-5 py-4">
      <p className="text-2xs leading-relaxed text-fg-subtle">
        Accounts the agent signs in to your app with. Add or change one while editing a run, next to its site.
      </p>
      {items === null ? (
        <p className="text-2xs text-fg-faint">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-2xs text-fg-faint">None saved yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-2.5 py-2">
              <Icon name="key" className="size-3.5 shrink-0 text-fg-faint" strokeWidth={1.9} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-2xs text-fg">{item.username ?? item.label}</span>
                <span className="block truncate text-2xs text-fg-faint">
                  <span className="font-mono">{new URL(item.origin).host}</span> ·{" "}
                  {item.last_used_at ? `used ${relativeTime(item.last_used_at)}` : "not used yet"}
                </span>
              </span>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => void remove(item.label)}
                  disabled={busy}
                  className="text-2xs text-fg-faint underline-offset-2 hover:text-rose-300 hover:underline"
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
