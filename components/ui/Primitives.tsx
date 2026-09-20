import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./Icon";

/* -------------------------------------------------- Eyebrow */

export function Eyebrow({
  children,
  icon,
  className,
}: {
  children: ReactNode;
  icon?: IconName;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[color-mix(in_oklab,var(--color-fg)_4%,transparent)] px-3 py-1",
        "font-mono text-2xs tracking-[0.14em] text-fg-muted uppercase",
        className,
      )}
    >
      {icon ? <Icon name={icon} className="size-3.5 text-iris-400" strokeWidth={1.9} /> : null}
      {children}
    </span>
  );
}

/* -------------------------------------------------- Badge */

const badgeTones = {
  neutral: "border-[var(--line-strong)] bg-[color-mix(in_oklab,var(--color-fg)_6%,transparent)] text-fg-muted",
  iris: "border-[color-mix(in_oklab,var(--color-iris-500)_34%,transparent)] bg-[color-mix(in_oklab,var(--color-iris-500)_14%,transparent)] text-iris-300",
  mint: "border-[color-mix(in_oklab,var(--color-mint-500)_34%,transparent)] bg-[color-mix(in_oklab,var(--color-mint-500)_14%,transparent)] text-mint-400",
  amber: "border-[color-mix(in_oklab,var(--color-amber-500)_34%,transparent)] bg-[color-mix(in_oklab,var(--color-amber-500)_14%,transparent)] text-amber-400",
  rose: "border-[color-mix(in_oklab,var(--color-rose-500)_34%,transparent)] bg-[color-mix(in_oklab,var(--color-rose-500)_14%,transparent)] text-rose-400",
  cyan: "border-[color-mix(in_oklab,var(--color-cyan-500)_34%,transparent)] bg-[color-mix(in_oklab,var(--color-cyan-500)_14%,transparent)] text-cyan-300",
} as const;

export type BadgeTone = keyof typeof badgeTones;

export function Badge({
  children,
  tone = "neutral",
  className,
  dot,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-2xs font-medium",
        badgeTones[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/* -------------------------------------------------- Section */

export function Section({
  children,
  className,
  id,
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: "default" | "raised";
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative py-20 md:py-28",
        tone === "raised" && "bg-ink-950 hairline-t hairline-b",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  eyebrowIcon,
  title,
  description,
  align = "center",
  className,
  children,
}: {
  eyebrow?: string;
  eyebrowIcon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "left";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "items-center text-center mx-auto max-w-2xl" : "items-start max-w-2xl",
        className,
      )}
    >
      {eyebrow ? <Eyebrow icon={eyebrowIcon}>{eyebrow}</Eyebrow> : null}
      <h2 className="text-[1.75rem] leading-[1.15] md:text-[2.5rem] md:leading-[1.1]">{title}</h2>
      {description ? (
        <p className="text-[0.9375rem] leading-relaxed text-fg-muted md:text-base">{description}</p>
      ) : null}
      {children}
    </div>
  );
}

/* -------------------------------------------------- Card */

export function Card({
  children,
  className,
  interactive,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  as?: "div" | "article" | "li";
}) {
  return (
    <As
      className={cn(
        "surface-card rounded-2xl",
        interactive &&
          "transition-[border-color,background,transform] duration-300 hover:border-[var(--line-strong)] hover:bg-[color-mix(in_oklab,var(--color-fg)_5%,transparent)]",
        className,
      )}
    >
      {children}
    </As>
  );
}

/* -------------------------------------------------- Feature icon tile */

export function IconTile({
  name,
  className,
  tone = "iris",
}: {
  name: IconName;
  className?: string;
  tone?: "iris" | "cyan" | "mint" | "amber" | "rose" | "violet";
}) {
  const tones = {
    iris: "text-iris-400 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-iris-500)_28%,transparent),0_10px_30px_-16px_var(--color-iris-500)]",
    violet: "text-violet-400 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-violet-500)_28%,transparent),0_10px_30px_-16px_var(--color-violet-500)]",
    cyan: "text-cyan-400 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-cyan-500)_28%,transparent),0_10px_30px_-16px_var(--color-cyan-500)]",
    mint: "text-mint-400 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-mint-500)_28%,transparent),0_10px_30px_-16px_var(--color-mint-500)]",
    amber: "text-amber-400 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-amber-500)_28%,transparent),0_10px_30px_-16px_var(--color-amber-500)]",
    rose: "text-rose-400 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-rose-500)_28%,transparent),0_10px_30px_-16px_var(--color-rose-500)]",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-[11px] bg-ink-850",
        tones[tone],
        className,
      )}
    >
      <Icon name={name} className="size-[1.125rem]" strokeWidth={1.7} />
    </span>
  );
}

/* -------------------------------------------------- Inline link */

export function TextLink({
  href,
  children,
  className,
  arrow = true,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  arrow?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-1.5 text-sm font-medium text-iris-300 transition-colors hover:text-iris-400",
        className,
      )}
    >
      {children}
      {arrow ? (
        <Icon
          name="arrowRight"
          className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
          strokeWidth={1.8}
        />
      ) : null}
    </Link>
  );
}

/* -------------------------------------------------- Divider */

export function GradientRule({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-px w-full bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--color-fg)_18%,transparent),transparent)]",
        className,
      )}
    />
  );
}

/* -------------------------------------------------- Stat */

export function Stat({
  value,
  label,
  sub,
  className,
}: {
  value: string;
  label: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-[2rem] leading-none font-semibold tracking-[-0.03em] text-gradient md:text-[2.5rem]">
        {value}
      </span>
      <span className="text-sm font-medium text-fg">{label}</span>
      {sub ? <span className="text-[0.8125rem] text-fg-subtle">{sub}</span> : null}
    </div>
  );
}
