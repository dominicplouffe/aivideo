import Link from "next/link";
import { Wordmark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";
import { customers } from "@/lib/marketing-data";

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
          <blockquote className="max-w-md">
            <Icon name="quote" className="size-7 text-iris-500/45" />
            <p className="mt-5 text-[1.25rem] leading-snug text-fg-strong">
              We used to budget two weeks and eleven thousand dollars for a launch video. Our last
              three launches were recorded on a Tuesday and live on Wednesday.
            </p>
            <footer className="mt-5 flex items-center gap-3">
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-iris-600),var(--color-cyan-500))] text-[0.75rem] font-semibold text-white">
                PR
              </span>
              <span>
                <span className="block text-[0.875rem] font-medium text-fg-strong">Priya Raman</span>
                <span className="block text-[0.75rem] text-fg-subtle">VP Product Marketing, Northwind</span>
              </span>
            </footer>
          </blockquote>

          <dl className="mt-14 grid max-w-md grid-cols-3 gap-6 border-t border-[var(--line)] pt-8">
            {[
              { v: "11 min", l: "Record to publish" },
              { v: "34", l: "Languages" },
              { v: "2.4M", l: "Demos produced" },
            ].map((s) => (
              <div key={s.l}>
                <dt className="text-[1.375rem] leading-none font-semibold tracking-[-0.03em] text-gradient">
                  {s.v}
                </dt>
                <dd className="mt-1.5 text-[0.75rem] leading-snug text-fg-subtle">{s.l}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-12 max-w-md">
            <p className="font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
              Trusted by product teams at
            </p>
            <div className="mt-4 flex flex-wrap gap-x-7 gap-y-3">
              {customers.slice(0, 6).map((c) => (
                <span key={c.slug} className="text-[0.9375rem] font-semibold tracking-tight text-fg-faint">
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
