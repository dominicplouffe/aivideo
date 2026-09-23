import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "subtle";
type Size = "xs" | "sm" | "md" | "lg";

const base =
  "relative inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap " +
  "transition-[background,border-color,color,box-shadow,transform] duration-200 " +
  "disabled:pointer-events-none disabled:opacity-45 active:translate-y-px select-none";

const variants: Record<Variant, string> = {
  primary:
    "text-white shadow-[0_1px_0_0_rgba(255,255,255,0.18)_inset,0_10px_30px_-12px_rgba(110,86,248,0.9)] " +
    "bg-[linear-gradient(135deg,var(--color-iris-500),var(--color-violet-500)_58%,var(--color-iris-600))] " +
    "hover:shadow-[0_1px_0_0_rgba(255,255,255,0.22)_inset,0_14px_36px_-12px_rgba(110,86,248,1)] " +
    "hover:brightness-[1.07]",
  secondary:
    "bg-ink-750 text-fg border border-[var(--line-strong)] hover:bg-ink-700 hover:border-[color-mix(in_oklab,var(--color-fg)_24%,transparent)]",
  outline:
    "border border-[var(--line-strong)] text-fg bg-transparent hover:bg-[color-mix(in_oklab,var(--color-fg)_6%,transparent)]",
  ghost:
    "text-fg-muted hover:text-fg hover:bg-[color-mix(in_oklab,var(--color-fg)_7%,transparent)]",
  subtle:
    "bg-[color-mix(in_oklab,var(--color-iris-500)_16%,transparent)] text-iris-300 border border-[color-mix(in_oklab,var(--color-iris-500)_28%,transparent)] hover:bg-[color-mix(in_oklab,var(--color-iris-500)_24%,transparent)]",
  danger:
    "bg-[color-mix(in_oklab,var(--color-rose-500)_18%,transparent)] text-rose-400 border border-[color-mix(in_oklab,var(--color-rose-500)_32%,transparent)] hover:bg-[color-mix(in_oklab,var(--color-rose-500)_28%,transparent)]",
};

const sizes: Record<Size, string> = {
  xs: "h-7 rounded-lg px-2.5 text-2xs",
  sm: "h-9 rounded-[10px] px-3.5 text-[0.8125rem]",
  md: "h-11 rounded-xl px-5 text-sm",
  lg: "h-[3.25rem] rounded-[14px] px-7 text-[0.9375rem]",
};

export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: Variant;
  size?: Size;
  href?: string;
  iconOnly?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  href,
  iconOnly,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = cn(
    base,
    variants[variant],
    sizes[size],
    iconOnly && {
      "w-7 px-0": size === "xs",
      "w-9 px-0": size === "sm",
      "w-11 px-0": size === "md",
      "w-[3.25rem] px-0": size === "lg",
    },
    className,
  );

  if (href) {
    const external = href.startsWith("http") || href.startsWith("mailto:");
    if (external) {
      return (
        <a href={href} className={classes} target="_blank" rel="noreferrer noopener">
          {children}
        </a>
      );
    }
    // A link carries the same title and aria-label a button would: an
    // icon-only link in the folded sidebar has nothing else to say its name.
    const { title, "aria-label": ariaLabel } = rest as { title?: string; "aria-label"?: string };
    return (
      <Link href={href} className={classes} title={title} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
