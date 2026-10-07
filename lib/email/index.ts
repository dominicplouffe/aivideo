/**
 * Sending email, through Resend.
 *
 * One function and no SDK: Resend's API is a single authenticated POST, and
 * a dependency for that would be more code to keep current than the call.
 *
 * Without `RESEND_API_KEY` nothing is sent and the caller is told so, which
 * is a working state rather than an error: an invitation still has a link
 * to copy, and development never mails anybody by accident.
 */

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendOutcome =
  | { sent: true; id: string }
  | { sent: false; reason: "not-configured" | "refused"; detail?: string };

const ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "DemoRiff <hello@demoriff.com>";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(email: Email, fetchImpl: typeof fetch = fetch): Promise<SendOutcome> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email] not sent (RESEND_API_KEY unset): "${email.subject}" to ${email.to}\n${email.text}`);
    }
    return { sent: false, reason: "not-configured" };
  }

  try {
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok || !body.id) {
      console.error(`[email] Resend refused "${email.subject}" (${response.status}): ${body.message ?? "no message"}`);
      return { sent: false, reason: "refused", detail: body.message };
    }
    return { sent: true, id: body.id };
  } catch (error) {
    console.error("[email] could not reach Resend:", error);
    return { sent: false, reason: "refused", detail: "Could not reach the email service." };
  }
}

/** For interpolating into the HTML body. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
