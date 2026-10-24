import Link from "next/link";
import { Wordmark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* form side */}
      <div className="flex flex-col px-5 py-8 md:px-10">
        <Link href="/" className="inline-flex w-fit items-center">
          <Wordmark />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-center text-2xs text-fg-faint">
          By continuing you agree to our{" "}
          <Link href="/legal/terms" className="text-fg-subtle hover:text-fg">Terms</Link> and{" "}
          <Link href="/legal/privacy" className="text-fg-subtle hover:text-fg">Privacy Policy</Link>.
        </p>
      </div>

      {/* proof side */}
      <div className="relative hidden overflow-hidden border-l border-[var(--line)] bg-ink-950 lg:block">
        <div aria-hidden className="absolute inset-0 grid-bg opacity-40" />
        <div
          aria-hidden
          className="absolute -top-32 -right-24 size-[34rem] rounded-full opacity-45"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--color-iris-500) 38%, transparent), transparent 64%)",
            filter: "blur(70px)",
          }}
        />
        <div className="relative flex h-full flex-col justify-center px-12 py-16">
          <div className="max-w-md">
            <p className="font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
              From one recording
            </p>
            <p className="mt-5 text-[1.25rem] leading-snug text-fg-strong">
              Record the flow you already know by heart. DemoRiff turns it into a directed demo
              video you edit by editing its transcript.
            </p>
          </div>

          <dl className="mt-14 grid max-w-md grid-cols-3 gap-6 border-t border-[var(--line)] pt-8">
            {[
              { v: "1", l: "Recording in" },
              { v: "Text", l: "Edit the script, the cut follows" },
              { v: "MP4", l: "Share page and embed" },
            ].map((s) => (
              <div key={s.l}>
                <dt className="text-[1.375rem] leading-none font-semibold tracking-[-0.03em] text-gradient">
                  {s.v}
                </dt>
                <dd className="mt-1.5 text-[0.75rem] leading-snug text-fg-subtle">{s.l}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
