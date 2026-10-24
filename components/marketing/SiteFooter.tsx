import Link from "next/link";
import { footerNav, legalNav, site } from "@/lib/site";
import { LogoMark } from "@/components/brand/Logo";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

const socials = [
  { label: "X", href: "https://x.com/demoriff", d: "M17.5 3h3.2l-7 8 8.2 10h-6.4l-5-6.1L4.8 21H1.6l7.5-8.6L1.2 3h6.6l4.5 5.6L17.5 3Zm-1.1 16.1h1.8L7.7 4.8H5.8l10.6 14.3Z" },
  { label: "LinkedIn", href: "https://linkedin.com/company/demoriff", d: "M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-.95 1.83-1.95 3.77-1.95C21.4 8.75 22 11.1 22 14.2V21h-4v-6c0-1.43-.03-3.27-2-3.27-2 0-2.3 1.56-2.3 3.17V21h-4V9Z" },
  { label: "YouTube", href: "https://youtube.com/@demoriff", d: "M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.25 5 12 5 12 5s-6.25 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.76 1.77C5.75 19 12 19 12 19s6.25 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15.1V8.9l5.2 3.1L10 15.1Z" },
  { label: "GitHub", href: "https://github.com/demoriff", d: "M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" },
];

export function SiteFooter() {
  return (
    <footer className="relative hairline-t bg-ink-1000">
      <div className="container-wide py-16 md:py-20">
        {/* CTA strip */}
        <div className="surface-card relative mb-16 overflow-hidden rounded-3xl px-6 py-12 md:px-12 md:py-14">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-16 size-[26rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--color-iris-500)_26%,transparent),transparent_66%)] blur-2xl"
          />
          <div className="relative grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <h2 className="text-[1.75rem] leading-tight md:text-[2.25rem]">
                Your next demo is one recording away.
              </h2>
              <p className="mt-3 max-w-lg text-[0.9375rem] leading-relaxed text-fg-muted">
                Record the flow you already know by heart. DemoRiff returns a finished video, a
                narrated walkthrough, a clickable tour and a written guide — on your brand, in 34
                languages.
              </p>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              <Button href="/signup" size="lg" className="w-full md:w-auto">
                Start free — no card
              </Button>
              <Button href="/contact" variant="outline" size="lg" className="w-full md:w-auto">
                Book a 20-minute walkthrough
              </Button>
              <p className="text-2xs text-fg-faint">
                10 free video minutes · unlimited guides · cancel anytime
              </p>
            </div>
          </div>
        </div>

        {/* Link columns */}
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.3fr_repeat(5,minmax(0,1fr))]">
          <div className="lg:pr-8">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <LogoMark className="size-8" gradientId="dr-footer" />
              <span className="text-base font-semibold tracking-[-0.03em] text-fg-strong">
                Demo<span className="text-fg-muted">Riff</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-[0.8125rem] leading-relaxed text-fg-subtle">
              The production layer for software companies. One recording in, every format your
              go-to-market needs out.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={s.label}
                  className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--line)] text-fg-subtle transition-colors hover:border-[var(--line-strong)] hover:text-fg"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
                    <path d={s.d} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          {footerNav.map((col) => (
            <div key={col.title}>
              <p className="font-mono text-2xs tracking-[0.16em] text-fg-faint uppercase">
                {col.title}
              </p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[0.8125rem] text-fg-subtle transition-colors hover:text-fg"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-[var(--line)] pt-6 md:flex-row md:items-center md:justify-between">
          <p className="text-2xs text-fg-faint">
            © {new Date().getFullYear()} {site.name}, Inc. All rights reserved. Made in {site.hq}.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {legalNav.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-2xs text-fg-faint transition-colors hover:text-fg-muted"
              >
                {l.label}
              </Link>
            ))}
            <span className="inline-flex items-center gap-1.5 text-2xs text-fg-faint">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full rounded-full bg-mint-400 opacity-60 animate-pulse-ring" />
                <span className="relative inline-flex size-1.5 rounded-full bg-mint-400" />
              </span>
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
