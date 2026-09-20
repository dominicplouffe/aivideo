import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Card, IconTile, Badge } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";
import {
  capabilities,
  testimonials,
  securityHighlights,
  languages,
  integrations,
  type Testimonial,
} from "@/lib/marketing-data";

/* ---------------------------------------------------- Capability bento */

export function CapabilityBento({ limit }: { limit?: number }) {
  const items = limit ? capabilities.slice(0, limit) : capabilities;
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((c, i) => (
        <Reveal key={c.title} delay={(i % 3) * 80}>
          <Link href={c.href} className={cn("group block h-full", c.span)}>
            <Card interactive className="flex h-full flex-col gap-4 p-6">
              <div className="flex items-start justify-between">
                <IconTile name={c.icon} tone={c.tone} />
                <Icon
                  name="arrowUpRight"
                  className="size-4 text-fg-faint opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100"
                  strokeWidth={1.9}
                />
              </div>
              <div>
                <h3 className="text-[1.0625rem] leading-snug">{c.title}</h3>
                <p className="mt-2 text-[0.875rem] leading-relaxed text-fg-subtle">{c.body}</p>
              </div>
            </Card>
          </Link>
        </Reveal>
      ))}
    </div>
  );
}

/* ---------------------------------------------------- Testimonials */

export function TestimonialCard({ t, featured }: { t: Testimonial; featured?: boolean }) {
  return (
    <Card className={cn("flex h-full flex-col gap-5 p-6", featured && "md:p-8")}>
      <Icon name="quote" className="size-6 text-iris-500/45" />
      <blockquote className={cn("flex-1 leading-relaxed text-fg", featured ? "text-[1.0625rem] md:text-[1.1875rem]" : "text-[0.9375rem]")}>
        {t.quote}
      </blockquote>
      {t.metric ? (
        <div className="flex items-baseline gap-2.5 rounded-xl border border-[var(--line)] bg-ink-850/60 px-3.5 py-2.5">
          <span className="text-[1.0625rem] font-semibold tracking-tight text-gradient">{t.metric.value}</span>
          <span className="text-[0.75rem] text-fg-subtle">{t.metric.label}</span>
        </div>
      ) : null}
      <footer className="flex items-center gap-3 border-t border-[var(--line)] pt-4">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-iris-600),var(--color-cyan-500))] text-[0.75rem] font-semibold text-white">
          {t.name.split(" ").map((p) => p[0]).join("")}
        </span>
        <span className="min-w-0">
          <span className="block text-[0.875rem] font-medium text-fg-strong">{t.name}</span>
          <span className="block truncate text-[0.75rem] text-fg-subtle">
            {t.role} · {t.company}
          </span>
        </span>
      </footer>
    </Card>
  );
}

export function TestimonialGrid({ limit = 3 }: { limit?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {testimonials.slice(0, limit).map((t, i) => (
        <Reveal key={t.name} delay={i * 80}>
          <TestimonialCard t={t} />
        </Reveal>
      ))}
    </div>
  );
}

/* ---------------------------------------------------- Security strip */

export function SecurityStrip() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {securityHighlights.map((s, i) => (
        <Reveal key={s.title} delay={(i % 3) * 70}>
          <div className="flex h-full items-start gap-3.5 rounded-2xl border border-[var(--line)] p-5">
            <Icon name={s.icon} className="mt-0.5 size-[1.125rem] shrink-0 text-mint-400" strokeWidth={1.7} />
            <div>
              <p className="text-[0.9375rem] font-medium text-fg-strong">{s.title}</p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">{s.body}</p>
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

/* ---------------------------------------------------- Language cloud */

export function LanguageCloud() {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {languages.map((l, i) => (
        <span
          key={l}
          className="rounded-full border border-[var(--line)] bg-[color-mix(in_oklab,var(--color-fg)_3%,transparent)] px-3 py-1.5 text-[0.8125rem] text-fg-subtle transition-colors hover:border-[var(--line-strong)] hover:text-fg"
          style={{ animationDelay: `${i * 18}ms` }}
        >
          {l}
        </span>
      ))}
    </div>
  );
}

/* ---------------------------------------------------- Integrations strip */

export function IntegrationsStrip({ limit = 12 }: { limit?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {integrations.slice(0, limit).map((it, i) => (
        <Reveal key={it.name} delay={(i % 6) * 55}>
          <div className="flex h-full flex-col items-center gap-2.5 rounded-xl border border-[var(--line)] p-4 text-center transition-colors hover:border-[var(--line-strong)]">
            <Icon name={it.icon} className="size-5 text-fg-muted" strokeWidth={1.6} />
            <span className="text-[0.8125rem] font-medium text-fg">{it.name}</span>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

/* ---------------------------------------------------- Comparison row */

export function ValueRow({
  title,
  before,
  after,
  icon,
}: {
  title: string;
  before: string;
  after: string;
  icon: IconName;
}) {
  return (
    <div className="grid gap-4 border-b border-[var(--line)] py-6 last:border-0 md:grid-cols-[14rem_1fr_1fr] md:items-center md:gap-8">
      <div className="flex items-center gap-2.5">
        <Icon name={icon} className="size-4 text-fg-faint" strokeWidth={1.7} />
        <span className="text-[0.9375rem] font-medium text-fg-strong">{title}</span>
      </div>
      <div className="flex items-start gap-2.5">
        <Badge tone="rose" className="mt-0.5 shrink-0">Before</Badge>
        <span className="text-[0.875rem] leading-relaxed text-fg-subtle">{before}</span>
      </div>
      <div className="flex items-start gap-2.5">
        <Badge tone="mint" className="mt-0.5 shrink-0">With DemoRiff</Badge>
        <span className="text-[0.875rem] leading-relaxed text-fg">{after}</span>
      </div>
    </div>
  );
}
