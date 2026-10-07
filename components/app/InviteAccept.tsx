"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/** Accepting an invitation while signed in, or being told why you can't. */
export function InviteAccept({
  token,
  workspaceName,
  role,
  invitedEmail,
  signedInAs,
  by,
}: {
  token: string;
  workspaceName: string;
  role: string;
  invitedEmail: string;
  signedInAs: string;
  by: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = signedInAs.toLowerCase() === invitedEmail.toLowerCase();

  const accept = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The invitation could not be accepted.");
      window.location.href = "/app";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPending(false);
    }
  };

  // Ends the identity provider's session too when there is one, or its
  // hosted page would sign them straight back in as the wrong address. That
  // lands on the sign-in page, so the invitation link has to be opened
  // again; without a provider session, the page reloads to its form.
  const signOut = async () => {
    setPending(true);
    const response = await fetch("/api/auth", { method: "DELETE" }).catch(() => null);
    const body = (await response?.json().catch(() => ({}))) as { logout_url?: string | null } | undefined;
    if (body?.logout_url) window.location.href = body.logout_url;
    else window.location.reload();
  };

  return (
    <div>
      <h1 className="text-[1.5rem] leading-tight tracking-[-0.025em]">Join {workspaceName}</h1>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-fg-subtle">
        {by} as {/^[aeiou]/i.test(role) ? "an" : "a"} {role}.
      </p>

      {error ? (
        <p role="alert" className="mt-6 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3.5 py-2.5 text-[0.8125rem] text-fg">
          {error}
        </p>
      ) : null}

      {matches ? (
        <>
          <Button size="lg" className="mt-7 w-full" disabled={pending} onClick={() => void accept()}>
            {pending ? "Joining…" : `Join ${workspaceName}`}
            {pending ? null : <Icon name="arrowRight" className="size-4" strokeWidth={2} />}
          </Button>
          <p className="mt-3 text-2xs leading-relaxed text-fg-faint">
            Signed in as {signedInAs}. Your other workspaces stay yours; switch between them from the sidebar.
          </p>
        </>
      ) : (
        <>
          <p className="mt-6 rounded-xl border border-[var(--line-strong)] px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-fg">
            This invitation is for <strong>{invitedEmail}</strong>, and you are signed in as <strong>{signedInAs}</strong>. Sign out,
            then open this invitation again and sign in with {invitedEmail}.
          </p>
          <Button size="lg" variant="outline" className="mt-5 w-full" disabled={pending} onClick={() => void signOut()}>
            Sign out
          </Button>
        </>
      )}
    </div>
  );
}
