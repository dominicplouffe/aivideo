"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  { id: "google", label: "Continue with Google", d: "M21.35 11.1h-9.17v2.96h5.27c-.23 1.4-1.66 4.1-5.27 4.1-3.17 0-5.76-2.62-5.76-5.86s2.59-5.86 5.76-5.86c1.8 0 3.01.77 3.7 1.43l2.52-2.43C16.9 3.9 14.77 3 12.18 3 7.13 3 3 7.13 3 12.2s4.13 9.2 9.18 9.2c5.3 0 8.82-3.73 8.82-8.98 0-.6-.07-1.06-.15-1.32Z" },
  { id: "microsoft", label: "Continue with Microsoft", d: "M3 3h8.5v8.5H3V3Zm9.5 0H21v8.5h-8.5V3ZM3 12.5h8.5V21H3v-8.5Zm9.5 0H21V21h-8.5v-8.5Z" },
  { id: "saml", label: "Continue with SSO", d: "M12 2 4 5.5v6c0 4.7 3.2 9 8 10.5 4.8-1.5 8-5.8 8-10.5v-6L12 2Zm-1 13.5-3-3 1.4-1.4 1.6 1.6 4.1-4.1L16.5 10 11 15.5Z" },
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
}: {
  mode: "signin" | "signup";
  error?: string;
  next?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(explain(error));

  const isSignup = mode === "signup";

  function startSso() {
    if (!email.includes("@")) {
      // The domain is what routes the request, so there is nothing to do
      // without it. Saying so beats a redirect that comes straight back.
      setMessage("Enter your work email, then continue with single sign-on.");
      return;
    }
    setPending(true);
    const url = new URL("/api/auth/sso", window.location.origin);
    url.searchParams.set("email", email.trim().toLowerCase());
    if (next) url.searchParams.set("next", next);
    window.location.href = url.toString();
  }

  return (
    <div>
      <h1 className="text-[1.5rem] leading-tight tracking-[-0.025em]">
        {isSignup ? "Create your workspace" : "Welcome back"}
      </h1>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-fg-subtle">
        {isSignup
          ? "Ten free video minutes, unlimited guides, and every AI feature unlocked. No credit card."
          : "Sign in to your DemoRiff workspace."}
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
            onClick={startSso}
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
        <span className="text-2xs text-fg-faint">
          {isSignup ? "or with email" : "or with a work email"}
        </span>
        <span className="h-px flex-1 bg-[var(--line)]" />
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setMessage(null);
          try {
            // Signup creates a workspace; sign-in looks one up. These used
            // to be the same request, which is why "Create workspace"
            // answered "No active account for that address."
            const response = await fetch(isSignup ? "/api/auth/signup" : "/api/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                isSignup
                  ? { email: email.trim().toLowerCase(), name: name.trim() }
                  : { email: email.trim().toLowerCase() },
              ),
            });
            if (response.ok) {
              router.push(next ?? "/app");
              return;
            }
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            // A production deployment answers 501 here on purpose: email
            // sign-in is a development path, and single sign-on is the way in.
            setMessage(body.error ?? "That sign-in could not be completed.");
          } catch {
            setMessage("We could not reach the server. Check your connection and try again.");
          } finally {
            setPending(false);
          }
        }}
        className="space-y-3.5"
      >
        {isSignup ? (
          <Input label="Full name" value={name} onChange={setName} placeholder="Alex Morgan" autoComplete="name" />
        ) : null}
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
          {pending ? "One moment…" : isSignup ? "Create workspace" : "Sign in"}
          {pending ? null : <Icon name="arrowRight" className="size-4" strokeWidth={2} />}
        </Button>
        <p className="text-2xs leading-relaxed text-fg-faint">
          {/*
            No password field, and that is deliberate rather than unfinished.
            This build authenticates by single sign-on, with email-only entry
            as a development convenience — so a password box would take a
            credential nothing here can check, and leave somebody believing
            it was protecting their account.
          */}
          This build signs you in with single sign-on. Email-only entry is a development
          convenience and is refused on production deployments — there is no password to set.
        </p>
      </form>

      {isSignup ? (
        <ul className="mt-6 space-y-2">
          {[
            "10 AI video minutes every month",
            "Unlimited step-by-step guides",
            "Every AI feature unlocked",
          ].map((f) => (
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
          href={isSignup ? "/signin" : "/signup"}
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
