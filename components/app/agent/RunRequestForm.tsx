"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * Asking for a run.
 *
 * The allowlist is a required field rather than an advanced setting, and it
 * is above the brief rather than below it. That ordering is the point: the
 * first thing somebody decides is where the agent may go, not what it should
 * do there. A form that asks for the brief first and the boundary last
 * teaches people that the boundary is an afterthought.
 */
export function RunRequestForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [origins, setOrigins] = useState("");
  const [entryUrl, setEntryUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/agent/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: brief.trim(),
          allowed_origins: origins
            .split(/[\s,]+/)
            .map((entry) => entry.trim())
            .filter(Boolean),
          entry_url: entryUrl.trim() || undefined,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        run?: { id: string };
      };

      if (response.ok && body.run) {
        onDone?.();
        router.push(`/app/agent/${body.run.id}`);
        router.refresh();
        return;
      }
      setMessage(body.error ?? "That run could not be planned.");
    } catch {
      setMessage("We could not reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field
        label="Where the agent may go"
        hint="One origin per line. The agent cannot reach anything else — not a link on the page, not a script, not a redirect."
      >
        <textarea
          value={origins}
          onChange={(e) => setOrigins(e.target.value)}
          rows={2}
          required
          placeholder={"https://app.yourproduct.com\n*.demo.yourproduct.com"}
          className={inputClass}
          spellCheck={false}
        />
      </Field>

      <Field
        label="What to demonstrate"
        hint="Plain words. The agent turns this into numbered steps that somebody reviews before anything records."
      >
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
          required
          minLength={10}
          placeholder="Open the shipments list, create a shipment for the Berlin warehouse, add two line items, and show the tracking page."
          className={inputClass}
        />
      </Field>

      <Field label="Start at" hint="Optional. Must be one of the origins above.">
        <input
          value={entryUrl}
          onChange={(e) => setEntryUrl(e.target.value)}
          placeholder="https://app.yourproduct.com/signin"
          className={cn(inputClass, "h-11")}
          spellCheck={false}
        />
      </Field>

      {message ? (
        <p role="alert" className="text-[0.8125rem] leading-relaxed text-rose-400">
          {message}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Planning…" : "Plan the run"}
          {pending ? null : <Icon name="arrowRight" className="size-4" strokeWidth={2.2} />}
        </Button>
        <p className="text-2xs text-fg-faint">Planning records nothing.</p>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-xl border border-[var(--line)] bg-ink-900 px-3.5 py-2.5 text-[0.875rem] text-fg " +
  "placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[0.8125rem] font-medium text-fg">{label}</label>
      <p className="mb-1.5 mt-0.5 text-2xs leading-relaxed text-fg-faint">{hint}</p>
      {children}
    </div>
  );
}
