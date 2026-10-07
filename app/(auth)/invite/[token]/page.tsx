import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/app/AuthForm";
import { InviteAccept } from "@/components/app/InviteAccept";
import { getCurrentActor } from "@/lib/auth/current";
import { findInvitation } from "@/lib/db/repositories/invitations";
import { isDatabaseConfigured } from "@/lib/db/client";

export const metadata: Metadata = {
  title: "Invitation",
  robots: { index: false, follow: false },
};

/**
 * Where an invitation link lands.
 *
 * Signed out, it is a sign-in form with the address filled in; signing in
 * with that address accepts it. Signed in as that address, it is one button.
 * Signed in as anybody else, it says so — the link is not the invitation,
 * the address is.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = isDatabaseConfigured() ? await findInvitation(token) : ({ ok: false, reason: "not-found" } as const);
  const actor = await getCurrentActor();

  if (!found.ok) {
    // Accepted by the sign-in that brought them back here, most likely.
    if (found.reason === "used" && actor) redirect("/app");
    return (
      <div>
        <h1 className="text-[1.5rem] leading-tight tracking-[-0.025em]">
          {found.reason === "expired" ? "This invitation has expired" : "This invitation is no longer valid"}
        </h1>
        <p className="mt-2 text-[0.875rem] leading-relaxed text-fg-subtle">
          {found.reason === "expired"
            ? "Invitations last a week. Ask whoever invited you to send a new one."
            : "It may have been used already or withdrawn. Ask whoever invited you to send a new one."}
        </p>
        <p className="mt-7 text-[0.8125rem] text-fg-subtle">
          <Link href={actor ? "/app" : "/signin"} className="font-medium text-iris-300 hover:text-iris-400">
            {actor ? "Go to your workspace" : "Sign in"}
          </Link>
        </p>
      </div>
    );
  }

  const { invitation, workspaceName, inviterName } = found;
  const by = inviterName ? `${inviterName} invited you` : "You've been invited";

  if (!actor) {
    return (
      <AuthForm
        mode="signup"
        next={`/invite/${token}`}
        initialEmail={invitation.email}
        title={`Join ${workspaceName}`}
        subtitle={`${by} to DemoRiff as ${article(invitation.role)} ${invitation.role}. Sign in or create an account with ${invitation.email} to accept.`}
      />
    );
  }

  return (
    <InviteAccept
      token={token}
      workspaceName={workspaceName}
      role={invitation.role}
      invitedEmail={invitation.email}
      signedInAs={actor.email}
      by={by}
    />
  );
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}
