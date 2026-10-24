"use client";

import Link from "next/link";
import { currentFirstTouch, firstTouchParams } from "@/lib/attribution/first-touch";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

/**
 * All three start the same flow.
 *
 * Google Workspace, Entra and raw SAML are connections on the identity
 * provider's side, not three different protocols on ours — the work email
 * routes to whichever one the workspace configured. Showing three buttons
 * that do one thing is not a fiction; it is what the person is looking for
 * on the screen.
 */
const sso = [
  { id: "google", method: "google", label: "Continue with Google", d: "M21.35 11.1h-9.17v2.96h5.27c-.23 1.4-1.66 4.1-5.27 4.1-3.17 0-5.76-2.62-5.76-5.86s2.59-5.86 5.76-5.86c1.8 0 3.01.77 3.7 1.43l2.52-2.43C16.9 3.9 14.77 3 12.18 3 7.13 3 3 7.13 3 12.2s4.13 9.2 9.18 9.2c5.3 0 8.82-3.73 8.82-8.98 0-.6-.07-1.06-.15-1.32Z" },
  { id: "microsoft", method: "microsoft", label: "Continue with Microsoft", d: "M3 3h8.5v8.5H3V3Zm9.5 0H21v8.5h-8.5V3ZM3 12.5h8.5V21H3v-8.5Zm9.5 0H21V21h-8.5v-8.5Z" },
  { id: "saml", method: "sso", label: "Continue with SSO", d: "M12 2 4 5.5v6c0 4.7 3.2 9 8 10.5 4.8-1.5 8-5.8 8-10.5v-6L12 2Zm-1 13.5-3-3 1.4-1.4 1.6 1.6 4.1-4.1L16.5 10 11 15.5Z" },
];

/**
 * What a redirect back from the single sign-on flow means, in words.
 *
 * Every one of these arrives as `?error=` on this page, because the browser
 * is mid-navigation from an identity provider and the useful thing to hand
 * somebody at that moment is the form they were trying to get past — with a
 * sentence explaining what happened.
 */
const REASONS: Record<string, string> = {
  "sso-connection-none": "We could not find a single sign-on connection for that email domain.",
  "sso-connection-ambiguous": "More than one workspace claims that domain. Ask your administrator for your connection link.",
  "sso-unknown-connection": "That identity provider is not connected to any workspace.",
  "sso-connection-disabled": "Single sign-on is switched off for this workspace.",
  "sso-domain-not-claimed": "That email domain is not claimed by this workspace's connection.",
  "sso-no-just-in-time": "This workspace provisions accounts from its directory. Ask an administrator to add you.",
  "sso-deactivated": "This account has been deactivated. Contact your workspace administrator.",
  "idp-refused": "Your identity provider refused the sign-in. Your administrator may not have assigned you this application.",
  "connection-mismatch": "That sign-in came back from a different identity provider than the one it started with.",
  "exchange-failed": "We could not complete the sign-in with your identity provider. Try again.",
  "no-database": "This deployment is running on fixtures and cannot sign anybody in.",
  "sso-email-required": "Enter your work email, then continue with single sign-on.",
  "sso-connection-unconfigured":
    "Your workspace's single sign-on is not finished being set up. Ask your administrator to connect it.",
  "sso-unknown-organization": "That identity provider is not connected to any workspace.",
  "sso-email-unverified":
    "Confirm your email address with your provider, then sign in again. We do not create a workspace for an address nobody has verified.",
  "organization-selection-required":
    "That account belongs to more than one organization. Use the link your administrator sent you.",
  "mfa-required": "Finish setting up two-factor authentication with your provider, then try again.",
  "sso-required": "Your organization requires single sign-on. Use the SSO button above.",
};

function explain(error: string | null | undefined): string | null {
  if (!error) return null;
  if (REASONS[error]) return REASONS[error];
  // Every `state-*` reason is the same story to the person reading it: the
  // round trip did not come back the way it went out. The distinction
  // between a bad signature and a missing nonce is for our logs.
  if (error.startsWith("state-")) {
    return "That sign-in link has expired or was opened in a different browser. Start again.";
  }
  return "Sign-in could not be completed. Try again.";
}

export function AuthForm({
  mode,
  error,
  next,
  title,
  subtitle,
  initialEmail = "",
  ticks,
}: {
  mode: "signin" | "signup";
  error?: string;
  next?: string;
  /** In place of the default heading, for a page with more to say — an invitation. */
  title?: string;
  subtitle?: string;
  initialEmail?: string;
  /** In place of the default sign-up ticks, for a page that must say less. */
  ticks?: string[];
}) {
  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(explain(error));

  const isSignup = mode === "signup";

  /**
   * Hands the browser to the identity provider.
   *
   * All three buttons used to call one function that resolved an enterprise
   * SAML connection from the email domain, so "Continue with Google" did not
   * involve Google in any way. Each one now names the method it means.
   */
  function start(method: string) {
    // Only the enterprise door needs an address up front, because the domain
    // is what routes it. Google and Microsoft collect it themselves, and
    // asking first would be a field with nothing to do.
    if (method === "sso" && !email.includes("@")) {
      setMessage("Enter your work email, then continue with single sign-on.");
      return;
    }
    setPending(true);
    const url = new URL("/api/auth/authkit", window.location.origin);
    url.searchParams.set("method", method);
    if (email.includes("@")) url.searchParams.set("email", email.trim().toLowerCase());
    if (isSignup) url.searchParams.set("intent", "sign-up");
    if (next) url.searchParams.set("next", next);
    // First touch rides the URL into the signed sign-in state; no cookie.
    for (const [k, v] of firstTouchParams(currentFirstTouch(window.location.href, document.referrer))) {
      url.searchParams.set(k, v);
    }
    window.location.href = url.toString();
  }

  return (
    <div>
      <h1 className="text-[1.5rem] leading-tight tracking-[-0.025em]">
        {title ?? (isSignup ? "Create your workspace" : "Welcome back")}
      </h1>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-fg-subtle">
        {subtitle ??
          (isSignup
            ? "Ten free video minutes, unlimited guides, and every AI feature unlocked. No credit card."
            : "Sign in to your DemoRiff workspace.")}
      </p>

      {message ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-[color-mix(in_oklab,var(--color-rose-400,#f43f5e)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-rose-400,#f43f5e)_10%,transparent)] px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-fg"
        >
          {message}
        </p>
      ) : null}

      <div className="mt-7 space-y-2">
        {sso.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => start(s.method)}
            disabled={pending}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-[var(--line-strong)] text-[0.875rem] font-medium text-fg transition-colors hover:bg-[color-mix(in_oklab,var(--color-fg)_6%,transparent)]"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
              <path d={s.d} />
            </svg>
            {s.label}
          </button>
        ))}
      </div>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--line)]" />
        <span className="text-2xs text-fg-faint">or with email</span>
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          // AuthKit's hosted pane with the address filled in: it asks for the
          // password or sends the magic link, and proves the address is theirs.
          start("authkit");
        }}
        className="space-y-3.5"
      >
        <Input
          label="Work email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@company.com"
          autoComplete="email"
          required
        />

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "One moment…" : isSignup ? "Continue with email" : "Sign in"}
          {pending ? null : <Icon name="arrowRight" className="size-4" strokeWidth={2} />}
        </Button>
        <p className="text-2xs leading-relaxed text-fg-faint">
          {isSignup
            ? "Next you'll set a password or get a sign-in link by email."
            : "Next you'll enter your password or get a sign-in link by email."}
        </p>
      </form>

      {isSignup && (ticks || !title) ? (
        <ul className="mt-6 space-y-2">
          {(ticks ?? [
            "10 AI video minutes every month",
            "Unlimited step-by-step guides",
            "Every AI feature unlocked",
          ]).map((f) => (
            <li key={f} className="flex items-center gap-2.5 text-[0.8125rem] text-fg-subtle">
              <Icon name="check" className="size-3.5 shrink-0 text-mint-400" strokeWidth={2.6} />
              {f}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-7 text-center text-[0.8125rem] text-fg-subtle">
        {isSignup ? "Already have an account?" : "No account yet?"}{" "}
        <Link
          // Carries where they were headed, so an invitee who already has an
          // account comes back to the invitation after signing in.
          href={`${isSignup ? "/signin" : "/signup"}${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-iris-300 hover:text-iris-400"
        >
          {isSignup ? "Sign in" : "Start free"}
        </Link>
      </p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  required,
  action,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  action?: React.ReactNode;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="text-[0.8125rem] font-medium text-fg">{label}</label>
        {action}
      </div>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className={cn(
          "h-11 w-full rounded-xl border border-[var(--line)] bg-ink-900 px-3.5 text-[0.875rem] text-fg",
          "placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none",
        )}
      />
    </div>
  );
}
