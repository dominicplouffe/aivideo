"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * The approval, as a control.
 *
 * Two things this deliberately does not do.
 *
 * It does not hide when the viewer lacks `agent.approve`. A reviewer who
 * cannot approve should still see that an approval is what the run is
 * waiting for, and who can give it — a control that vanishes teaches nobody
 * anything. The server refuses regardless; this is a screen, not a gate.
 *
 * And it does not approve on one click. The confirmation exists because the
 * thing being agreed to is "drive a browser through our product with real
 * credentials, unattended", and a button that does that on a stray click is
 * a button people learn to be afraid of.
 */
export function ApprovalPanel({
  runId,
  requestedBy,
  canApprove,
  isRequester,
  soleApprover = false,
}: {
  runId: string;
  requestedBy: string;
  canApprove: boolean;
  isRequester: boolean;
  /** Nobody else in the workspace can approve, so the requester may. */
  soleApprover?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function decide(decision: "approve" | "cancel") {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/agent/runs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: runId, decision }),
      });
      if (response.ok) {
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(body.error ?? "That could not be completed.");
    } catch {
      setMessage("We could not reach the server. Try again.");
    } finally {
      setPending(false);
      setConfirming(false);
    }
  }

  if (isRequester) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3.5">
        <p className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-fg">
          <Icon name="shield" className="mt-0.5 size-4 shrink-0 text-amber-400" strokeWidth={1.9} />
          <span>
            You asked for this run, so somebody else has to approve it. The gate
            exists to put a second pair of eyes on a plan that will run
            unattended with real credentials — one you can open for yourself is
            not a gate.
          </span>
        </p>
      </div>
    );
  }

  if (!canApprove) {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-ink-900 px-4 py-3.5">
        <p className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-fg-subtle">
          <Icon name="lock" className="mt-0.5 size-4 shrink-0 text-fg-faint" strokeWidth={1.9} />
          <span>
            This run is waiting on an approval. Owners, admins and reviewers can
            give it; {requestedBy} asked for it.
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-4">
      <p className="text-[0.875rem] font-medium text-fg-strong">
        {confirming ? "Approve this run?" : soleApprover ? "Approve your own run" : "This run needs your approval"}
      </p>
      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-fg-subtle">
        {confirming
          ? "The agent will open a browser, sign in with the stored credential for each allowed origin, follow every step above and record the screen. It cannot reach anything else, and it cannot change the plan once you approve it. The recording becomes a project in Projects, with each step's narration as its script, ready for an AI voice."
          : soleApprover
            ? "You are the only person in this workspace who can approve runs, so you can approve your own. Read the steps and the allowed origins first; the audit log will record that you approved your own run. Once a second owner, admin or reviewer joins, someone else will have to approve."
            : `${requestedBy} asked for this. Read the steps and the allowed origins before you agree — this is what the agent will do, and it is the only thing it can do.`}
      </p>

      {message ? (
        <p role="alert" className="mt-3 text-[0.8125rem] text-rose-400">
          {message}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <Button size="sm" onClick={() => decide("approve")} disabled={pending}>
              {pending ? "One moment…" : "Yes, approve and record"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              Back
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={() => setConfirming(true)} disabled={pending}>
              <Icon name="check" className="size-4" strokeWidth={2.2} />
              Approve
            </Button>
            <Button size="sm" variant="secondary" onClick={() => decide("cancel")} disabled={pending}>
              Cancel this run
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
