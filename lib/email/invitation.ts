import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { escapeHtml, sendEmail, type Email } from "./index";

/** The invitation email: who, where, as what, and the one link. */
export function invitationEmail(input: {
  to: string;
  workspaceName: string;
  inviterName: string | null;
  role: string;
  link: string;
  expiresAt: Date;
}): Email {
  const who = input.inviterName ? `${input.inviterName} has` : "You have been";
  const subject = input.inviterName
    ? `${input.inviterName} invited you to ${input.workspaceName} on DemoRiff`
    : `You're invited to ${input.workspaceName} on DemoRiff`;
  const expires = input.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const text = [
    `${who} invited you to join ${input.workspaceName} on DemoRiff as ${article(input.role)} ${input.role}.`,
    "",
    `Accept the invitation: ${input.link}`,
    "",
    `Sign in with ${input.to} to accept. The link works until ${expires}.`,
    "If you weren't expecting this, you can ignore it.",
  ].join("\n");

  const e = escapeHtml;
  const html = `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f6f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#17171c">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e6e6ee;border-radius:16px;padding:32px">
    <p style="margin:0 0 24px;font-weight:600;font-size:16px">DemoRiff</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55">${e(who)} invited you to join <strong>${e(input.workspaceName)}</strong> as ${e(article(input.role))} ${e(input.role)}.</p>
    <p style="margin:24px 0">
      <a href="${e(input.link)}" style="display:inline-block;background:#5b5bf0;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:10px">Accept invitation</a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:#5c5c6b">Sign in with ${e(input.to)} to accept. The link works until ${e(expires)}.</p>
    <p style="margin:0;font-size:13px;line-height:1.55;color:#5c5c6b">If you weren't expecting this, you can ignore it.</p>
  </div>
</body></html>`;

  return { to: input.to, subject, text, html };
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

/**
 * Mails an invitation's link, and returns the link either way so whoever
 * sent it can pass it on by hand when there is no email service, or when
 * the service refused.
 */
export async function deliverInvitation(input: {
  invitation: { id: string; workspaceId: string; email: string; role: string; invitedBy: string | null; expiresAt: Date };
  token: string;
  origin: string;
}): Promise<{ link: string; emailed: boolean; emailError: string | null }> {
  const link = new URL(`/invite/${input.token}`, input.origin).toString();
  const [workspace] = await getDb()
    .select({ name: s.workspaces.name })
    .from(s.workspaces)
    .where(eq(s.workspaces.id, input.invitation.workspaceId))
    .limit(1);
  const [inviter] = input.invitation.invitedBy
    ? await getDb().select({ name: s.members.name }).from(s.members).where(eq(s.members.id, input.invitation.invitedBy)).limit(1)
    : [];

  const outcome = await sendEmail(
    invitationEmail({
      to: input.invitation.email,
      workspaceName: workspace?.name ?? "a workspace",
      inviterName: inviter?.name ?? null,
      role: input.invitation.role,
      link,
      expiresAt: input.invitation.expiresAt,
    }),
  );

  return {
    link,
    emailed: outcome.sent,
    emailError: outcome.sent ? null : outcome.reason === "not-configured" ? null : (outcome.detail ?? "The email could not be sent."),
  };
}
