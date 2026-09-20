"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Card } from "@/components/ui/Primitives";

const topics = [
  { id: "demo", label: "See a walkthrough" },
  { id: "pricing", label: "Volume pricing" },
  { id: "security", label: "Security review" },
  { id: "roi", label: "Written ROI model" },
  { id: "migration", label: "Migrating from another tool" },
  { id: "other", label: "Something else" },
];

const sizes = ["1–10", "11–50", "51–200", "201–1,000", "1,000+"];

export function ContactForm() {
  const [topic, setTopic] = useState("demo");
  const [size, setSize] = useState("51–200");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  if (sent) {
    return (
      <Card className="flex flex-col items-start gap-4 p-8">
        <span className="inline-flex size-11 items-center justify-center rounded-xl bg-mint-500/15 text-mint-400">
          <Icon name="check" className="size-5" strokeWidth={2.4} />
        </span>
        <h2 className="text-[1.375rem]">Got it — we will be in touch today</h2>
        <p className="max-w-lg text-[0.9375rem] leading-relaxed text-fg-muted">
          Someone from the team will reply within one business day, usually sooner. If it is
          urgent, reply to the confirmation email and it will jump the queue.
        </p>
        <p className="text-[0.8125rem] text-fg-subtle">
          In the meantime, you can start recording without waiting for us.
        </p>
        <div className="mt-2 flex gap-3">
          <Button href="/signup" size="md">Start free now</Button>
          <Button variant="outline" size="md" onClick={() => setSent(false)}>
            Send another
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 md:p-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPending(true);
          // Wired to POST /api/contact in production; simulated here.
          setTimeout(() => {
            setPending(false);
            setSent(true);
          }, 700);
        }}
        className="flex flex-col gap-6"
      >
        <div>
          <p className="text-[0.875rem] font-medium text-fg">What brings you here?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {topics.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTopic(t.id)}
                className={cn(
                  "rounded-xl border px-3.5 py-2 text-[0.8125rem] font-medium transition-colors",
                  topic === t.id
                    ? "border-iris-500/50 bg-iris-500/12 text-fg-strong"
                    : "border-[var(--line)] text-fg-subtle hover:border-[var(--line-strong)] hover:text-fg",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Work email" name="email" type="email" placeholder="you@company.com" required />
          <Field label="Full name" name="name" placeholder="Alex Morgan" required />
          <Field label="Company" name="company" placeholder="Meridian" required />
          <Field label="Role" name="role" placeholder="Head of Product Marketing" />
        </div>

        <div>
          <p className="text-[0.875rem] font-medium text-fg">Company size</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {sizes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-[0.8125rem] transition-colors",
                  size === s
                    ? "border-iris-500/50 bg-iris-500/12 text-fg-strong"
                    : "border-[var(--line)] text-fg-subtle hover:border-[var(--line-strong)] hover:text-fg",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="message" className="text-[0.875rem] font-medium text-fg">
            Anything we should know first?
          </label>
          <textarea
            id="message"
            name="message"
            rows={4}
            placeholder="What are you producing today, and what is getting in the way?"
            className="mt-2 w-full resize-y rounded-xl border border-[var(--line)] bg-ink-900 px-4 py-3 text-[0.875rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-2xs text-fg-faint">
            We will not add you to a drip sequence. One human reply, then it is up to you.
          </p>
          <Button type="submit" size="md" disabled={pending} className="shrink-0">
            {pending ? "Sending…" : "Send message"}
            {pending ? null : <Icon name="arrowRight" className="size-4" strokeWidth={2} />}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-[0.875rem] font-medium text-fg">
        {label}
        {required ? <span className="ml-1 text-iris-400">*</span> : null}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] bg-ink-900 px-4 text-[0.875rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none"
      />
    </div>
  );
}
