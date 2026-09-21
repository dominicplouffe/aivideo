import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { ProjectStatus } from "@/lib/app-data";

/* ---------------------------------------------------------- page header */

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <div className={cn("border-b border-[var(--line)] px-4 py-6 md:px-8 md:py-8", className)}>
      {breadcrumb ? (
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-2xs text-fg-faint">
          {breadcrumb.map((b, i) => (
            <span key={b.label} className="flex items-center gap-2">
              {i > 0 ? <Icon name="chevronRight" className="size-3" strokeWidth={2.4} /> : null}
              {b.href ? (
                <Link href={b.href} className="transition-colors hover:text-fg-muted">
                  {b.label}
                </Link>
              ) : (
                <span className="text-fg-muted">{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.375rem] leading-tight tracking-[-0.025em] md:text-[1.625rem]">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-[0.875rem] leading-relaxed text-fg-subtle">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- status pill */

const statusMeta: Record<ProjectStatus, { label: string; cls: string; dot: string }> = {
  draft: { label: "Draft", cls: "text-fg-subtle border-[var(--line-strong)] bg-ink-850", dot: "bg-fg-faint" },
  processing: { label: "Processing", cls: "text-iris-300 border-iris-500/35 bg-iris-500/10", dot: "bg-iris-400 animate-pulse" },
  ready: { label: "Ready", cls: "text-cyan-300 border-cyan-500/35 bg-cyan-500/10", dot: "bg-cyan-400" },
  published: { label: "Published", cls: "text-mint-400 border-mint-500/35 bg-mint-500/10", dot: "bg-mint-400" },
  stale: { label: "Stale", cls: "text-amber-400 border-amber-500/35 bg-amber-500/10", dot: "bg-amber-400" },
  failed: { label: "Failed", cls: "text-rose-300 border-rose-500/35 bg-rose-500/10", dot: "bg-rose-400" },
};

export function StatusPill({ status, className }: { status: ProjectStatus; className?: string }) {
  const m = statusMeta[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium",
        m.cls,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

/* ---------------------------------------------------------- panel */

export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border border-[var(--line)] bg-ink-950", className)}>
      {title ? (
        <header className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-[0.9375rem] font-medium text-fg-strong">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-[0.75rem] text-fg-subtle">{description}</p>
            ) : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  );
}

/* ---------------------------------------------------------- stat tile */

export function StatTile({
  label,
  value,
  delta,
  deltaTone = "up",
  icon,
  sub,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "up" | "down" | "flat";
  icon?: IconName;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-ink-950 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[0.75rem] text-fg-subtle">{label}</span>
        {icon ? <Icon name={icon} className="size-4 text-fg-faint" strokeWidth={1.7} /> : null}
      </div>
      <p className="mt-2.5 text-[1.75rem] leading-none font-semibold tracking-[-0.03em] text-fg-strong tabular-nums">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-2">
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[0.75rem] font-medium",
              deltaTone === "up" && "text-mint-400",
              deltaTone === "down" && "text-rose-400",
              deltaTone === "flat" && "text-fg-subtle",
            )}
          >
            {deltaTone !== "flat" ? (
              <Icon
                name="trending"
                className={cn("size-3.5", deltaTone === "down" && "-scale-y-100")}
                strokeWidth={2}
              />
            ) : null}
            {delta}
          </span>
        ) : null}
        {sub ? <span className="text-[0.75rem] text-fg-faint">{sub}</span> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- avatar */

export function Avatar({
  name,
  hue,
  size = 32,
  className,
}: {
  name: string;
  hue: number;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${hue + 40} 70% 45%))`,
      }}
      title={name}
    >
      {name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
    </span>
  );
}

/* ---------------------------------------------------------- empty */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl border border-[var(--line)] bg-ink-900 text-fg-faint">
        <Icon name={icon} className="size-5" strokeWidth={1.6} />
      </span>
      <h3 className="text-[1rem] font-medium text-fg-strong">{title}</h3>
      <p className="max-w-sm text-[0.875rem] leading-relaxed text-fg-subtle">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ---------------------------------------------------------- sparkline */

export function Sparkline({
  data,
  className,
  stroke = "var(--color-iris-400)",
  fill = true,
}: {
  data: number[];
  className?: string;
  stroke?: string;
  fill?: boolean;
}) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - ((v - min) / range) * 100;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const d = `M${pts.join(" L")}`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cn("h-10 w-full", className)} aria-hidden>
      {fill ? (
        <path d={`${d} L100,100 L0,100 Z`} fill="url(#spark-grad)" opacity="0.25" />
      ) : null}
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
