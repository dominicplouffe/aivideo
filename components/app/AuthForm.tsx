"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

const sso = [
  { id: "google", label: "Continue with Google", d: "M21.35 11.1h-9.17v2.96h5.27c-.23 1.4-1.66 4.1-5.27 4.1-3.17 0-5.76-2.62-5.76-5.86s2.59-5.86 5.76-5.86c1.8 0 3.01.77 3.7 1.43l2.52-2.43C16.9 3.9 14.77 3 12.18 3 7.13 3 3 7.13 3 12.2s4.13 9.2 9.18 9.2c5.3 0 8.82-3.73 8.82-8.98 0-.6-.07-1.06-.15-1.32Z" },
  { id: "microsoft", label: "Continue with Microsoft", d: "M3 3h8.5v8.5H3V3Zm9.5 0H21v8.5h-8.5V3ZM3 12.5h8.5V21H3v-8.5Zm9.5 0H21V21h-8.5v-8.5Z" },
  { id: "saml", label: "Continue with SSO", d: "M12 2 4 5.5v6c0 4.7 3.2 9 8 10.5 4.8-1.5 8-5.8 8-10.5v-6L12 2Zm-1 13.5-3-3 1.4-1.4 1.6 1.6 4.1-4.1L16.5 10 11 15.5Z" },
];

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  const isSignup = mode === "signup";

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

      <div className="mt-7 space-y-2">
        {sso.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => router.push("/app")}
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
          setPending(true);
          setTimeout(() => router.push("/app"), 500);
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
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder={isSignup ? "At least 12 characters" : "••••••••••••"}
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          action={
            !isSignup ? (
              <Link href="/signin" className="text-2xs text-iris-300 hover:text-iris-400">
                Forgot?
              </Link>
            ) : null
          }
        />

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "One moment…" : isSignup ? "Create workspace" : "Sign in"}
          {pending ? null : <Icon name="arrowRight" className="size-4" strokeWidth={2} />}
        </Button>
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
