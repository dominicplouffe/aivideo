"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Panel } from "./Shared";
import { VENDORS, VENDOR_LABELS, type Vendor } from "@/lib/billing/vendors";

/**
 * The workspace's own vendor keys.
 *
 * Three rows, one per vendor: what it is used for, where to get a key, the
 * last four characters of the one saved, and a field to save or replace
 * it. A key is checked with the vendor before it is kept, so a wrong one is
 * caught here and not at the first render. Keys are never shown back.
 */

interface Saved {
  vendor: Vendor;
  last4: string;
  verifiedAt: string | null;
  updatedAt: string;
}

export function VendorKeysEditor({ ownKeysPlan }: { ownKeysPlan: boolean }) {
  const [saved, setSaved] = useState<Saved[] | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<Vendor, string>>>({});
  const [busy, setBusy] = useState<Vendor | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Vendor, string>>>({});

  const load = async () => {
    try {
      const response = await fetch("/api/workspace/vendor-keys");
      const body = (await response.json()) as { data?: Saved[] };
      setSaved(body.data ?? []);
    } catch {
      setSaved([]);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const save = async (vendor: Vendor) => {
    const key = drafts[vendor]?.trim() ?? "";
    if (!key) return;
    setBusy(vendor);
    setErrors((e) => ({ ...e, [vendor]: undefined }));
    try {
      const response = await fetch("/api/workspace/vendor-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor, key }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The key was not saved.");
      setDrafts((d) => ({ ...d, [vendor]: "" }));
      await load();
    } catch (cause) {
      setErrors((e) => ({ ...e, [vendor]: cause instanceof Error ? cause.message : String(cause) }));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (vendor: Vendor) => {
    setBusy(vendor);
    try {
      await fetch(`/api/workspace/vendor-keys?vendor=${vendor}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const field =
    "w-full rounded-lg border border-[var(--line)] bg-ink-950 px-2.5 py-1.5 font-mono text-[0.8125rem] text-fg placeholder:font-sans placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none";

  return (
    <Panel
      title="Your keys"
      description={
        ownKeysPlan
          ? "This workspace runs on its own vendor accounts. Every transcription, reading and Riff message is billed to these keys, not to us."
          : "Used on the Bring-your-own-keys plan. On your current plan our keys do the work and these are not used."
      }
    >
      <div className="divide-y divide-[var(--line)]">
        {!ownKeysPlan ? (
          <p className="px-5 py-3 text-2xs leading-relaxed text-fg-faint">
            Want unlimited projects and unlimited AI on your own vendor accounts?{" "}
            <Link href="/app/billing" className="text-iris-300 underline-offset-2 hover:underline">
              See the Bring-your-own-keys plan
            </Link>
            .
          </p>
        ) : null}
        {VENDORS.map((vendor) => {
          const label = VENDOR_LABELS[vendor];
          const row = saved?.find((k) => k.vendor === vendor) ?? null;
          const error = errors[vendor];
          return (
            <div key={vendor} className="grid gap-3 px-5 py-4 sm:grid-cols-[11rem_1fr]">
              <div>
                <p className="text-[0.875rem] font-medium text-fg-strong">{label.name}</p>
                <p className="mt-0.5 text-2xs leading-relaxed text-fg-subtle">{label.used}</p>
                <p className="mt-1 text-2xs text-fg-faint">{label.where}</p>
              </div>
              <div>
                {saved === null ? (
                  <p className="text-2xs text-fg-faint">Loading…</p>
                ) : row ? (
                  <p className="mb-2 flex items-center gap-2 text-2xs">
                    <Icon name="check" className="size-3.5 text-mint-400" strokeWidth={2.6} />
                    <span className="text-fg">
                      Key ending in <span className="font-mono">{row.last4}</span>
                    </span>
                    <span className="text-fg-faint">
                      · {row.verifiedAt ? `checked ${new Date(row.verifiedAt).toLocaleDateString()}` : "not checked"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void remove(vendor)}
                      disabled={busy === vendor}
                      className="ml-auto text-fg-faint underline-offset-2 hover:text-rose-300 hover:underline"
                    >
                      Remove
                    </button>
                  </p>
                ) : (
                  <p className="mb-2 flex items-center gap-2 text-2xs text-fg-faint">
                    <Icon name="alert" className={ownKeysPlan ? "size-3.5 text-amber-400" : "size-3.5"} strokeWidth={2.2} />
                    No key yet{ownKeysPlan ? `: ${label.used.toLowerCase()} will refuse until one is added.` : "."}
                  </p>
                )}
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(vendor);
                  }}
                >
                  <input
                    type="password"
                    autoComplete="off"
                    value={drafts[vendor] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [vendor]: e.target.value }))}
                    placeholder={row ? "Paste a new key to replace it" : `Paste your ${label.name} API key`}
                    className={field}
                    aria-label={`${label.name} API key`}
                  />
                  <Button size="sm" type="submit" disabled={busy === vendor || !(drafts[vendor] ?? "").trim()}>
                    {busy === vendor ? "Checking…" : row ? "Replace" : "Save"}
                  </Button>
                </form>
                {error ? (
                  <p className="mt-1.5 flex items-start gap-1.5 text-2xs text-rose-300">
                    <Icon name="alert" className="mt-px size-3.5 shrink-0" strokeWidth={2.2} />
                    {error}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
