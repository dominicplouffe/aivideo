"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { nav } from "@/lib/site";
import { Wordmark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";

type MenuKey = "product" | "solutions" | "resources";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState<MenuKey | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const hover = (key: MenuKey | null) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (key === null) {
      closeTimer.current = setTimeout(() => setOpen(null), 120);
    } else {
      setOpen(key);
    }
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-[background,border-color,backdrop-filter] duration-300",
        scrolled || open || mobileOpen
          ? "border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--color-ink-1000)_82%,transparent)] backdrop-blur-xl"
          : "border-b border-transparent",
      )}
      onMouseLeave={() => hover(null)}
    >
      <div className="container-wide">
        <div className="flex h-16 items-center justify-between gap-6">
          <div className="flex items-center gap-8">
            <Link href="/" className="shrink-0" aria-label={`${"DemoRiff"} home`}>
              <Wordmark />
            </Link>

            <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
              <MenuTrigger label="Product" active={open === "product"} onEnter={() => hover("product")} onClick={() => setOpen(open === "product" ? null : "product")} />
              <MenuTrigger label="Solutions" active={open === "solutions"} onEnter={() => hover("solutions")} onClick={() => setOpen(open === "solutions" ? null : "solutions")} />
              <MenuTrigger label="Resources" active={open === "resources"} onEnter={() => hover("resources")} onClick={() => setOpen(open === "resources" ? null : "resources")} />
              <TopLink href="/customers" onEnter={() => hover(null)}>Customers</TopLink>
              <TopLink href="/pricing" onEnter={() => hover(null)}>Pricing</TopLink>
            </nav>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <Button href="/contact" variant="ghost" size="sm">
              Talk to sales
            </Button>
            <Button href="/signin" variant="outline" size="sm">
              Sign in
            </Button>
            <Button href="/signup" size="sm">
              Start free
              <Icon name="arrowRight" className="size-4" strokeWidth={1.9} />
            </Button>
          </div>

          <button
            type="button"
            className="-mr-2 inline-flex size-10 items-center justify-center rounded-xl text-fg-muted hover:bg-[color-mix(in_oklab,var(--color-fg)_7%,transparent)] hover:text-fg lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation"
          >
            <Icon name={mobileOpen ? "x" : "menu"} />
          </button>
        </div>
      </div>

      {/* ---------------- Desktop mega menu ---------------- */}
      <div
        className={cn(
          "absolute inset-x-0 top-full hidden origin-top lg:block",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
        onMouseEnter={() => open && hover(open)}
        onMouseLeave={() => hover(null)}
      >
        <div
          className={cn(
            "border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--color-ink-950)_96%,transparent)] backdrop-blur-xl transition-[opacity,transform] duration-200",
            open ? "opacity-100 translate-y-0" : "-translate-y-2 opacity-0",
          )}
        >
          {open === "product" ? <ProductMenu /> : null}
          {open === "solutions" ? <SolutionsMenu /> : null}
          {open === "resources" ? <ResourcesMenu /> : null}
        </div>
      </div>

      {/* ---------------- Mobile drawer ---------------- */}
      {mobileOpen ? (
        <div className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto bg-ink-1000 lg:hidden">
          <div className="container-page flex flex-col gap-2 py-6">
            <MobileGroup title="Product">
              {nav.product.flatMap((g) => g.items).map((item) => (
                <MobileLink key={item.href} {...item} />
              ))}
            </MobileGroup>
            <MobileGroup title="Solutions">
              {nav.solutions.map((item) => (
                <MobileLink key={item.href} {...item} />
              ))}
            </MobileGroup>
            <MobileGroup title="Resources">
              {nav.resources.map((item) => (
                <MobileLink key={item.href} {...item} />
              ))}
            </MobileGroup>
            <Link href="/customers" className="rounded-xl px-3 py-3 text-[0.9375rem] font-medium hover:bg-ink-850">
              Customers
            </Link>
            <Link href="/pricing" className="rounded-xl px-3 py-3 text-[0.9375rem] font-medium hover:bg-ink-850">
              Pricing
            </Link>
            <div className="mt-4 flex flex-col gap-2.5">
              <Button href="/signup" size="lg">Start free — no card</Button>
              <Button href="/signin" variant="outline" size="lg">Sign in</Button>
              <Button href="/contact" variant="ghost" size="lg">Talk to sales</Button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

/* ---------------------------------------------- pieces */

function MenuTrigger({
  label,
  active,
  onEnter,
  onClick,
}: {
  label: string;
  active: boolean;
  onEnter: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onEnter}
      onClick={onClick}
      aria-expanded={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[0.875rem] font-medium transition-colors",
        active ? "text-fg-strong" : "text-fg-muted hover:text-fg",
      )}
    >
      {label}
      <Icon
        name="chevronDown"
        className={cn("size-3.5 transition-transform duration-200", active && "rotate-180")}
        strokeWidth={2}
      />
    </button>
  );
}

function TopLink({
  href,
  children,
  onEnter,
}: {
  href: string;
  children: React.ReactNode;
  onEnter: () => void;
}) {
  return (
    <Link
      href={href}
      onMouseEnter={onEnter}
      className="rounded-lg px-3 py-2 text-[0.875rem] font-medium text-fg-muted transition-colors hover:text-fg"
    >
      {children}
    </Link>
  );
}

function MenuItem({
  title,
  href,
  desc,
  icon,
}: {
  title: string;
  href: string;
  desc: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="group flex gap-3 rounded-xl p-3 transition-colors hover:bg-[color-mix(in_oklab,var(--color-fg)_5%,transparent)]"
    >
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-ink-850 text-iris-400 transition-colors group-hover:border-[color-mix(in_oklab,var(--color-iris-500)_40%,transparent)]">
        <Icon name={icon as IconName} className="size-4" strokeWidth={1.7} />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.875rem] font-medium text-fg-strong">{title}</span>
        <span className="mt-0.5 block text-[0.8125rem] leading-snug text-fg-subtle">{desc}</span>
      </span>
    </Link>
  );
}

function ProductMenu() {
  return (
    <div className="container-wide grid gap-8 py-8 lg:grid-cols-[1fr_1fr_1fr_18rem]">
      {nav.product.map((group) => (
        <div key={group.group}>
          <p className="mb-2 px-3 font-mono text-2xs tracking-[0.16em] text-fg-faint uppercase">
            {group.group}
          </p>
          <div className="flex flex-col">
            {group.items.map((item) => (
              <MenuItem key={item.href} {...item} />
            ))}
          </div>
        </div>
      ))}
      <div className="surface-card rounded-2xl p-5">
        <p className="font-mono text-2xs tracking-[0.16em] text-iris-300 uppercase">New</p>
        <p className="mt-2 text-[0.9375rem] font-medium text-fg-strong">
          Brand kits on every export
        </p>
        <p className="mt-1.5 text-[0.8125rem] leading-snug text-fg-subtle">
          Your fonts, colours and logo on the captions, with an intro and outro card on every
          video.
        </p>
        <Link
          href="/product/brand"
          className="mt-4 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-iris-300 hover:text-iris-400"
        >
          See how it works
          <Icon name="arrowRight" className="size-3.5" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}

function SolutionsMenu() {
  return (
    <div className="container-wide grid gap-8 py-8 lg:grid-cols-[2fr_1fr]">
      <div className="grid gap-1 sm:grid-cols-2">
        {nav.solutions.map((item) => (
          <MenuItem key={item.href} {...item} />
        ))}
      </div>
      <div className="surface-card flex flex-col justify-between rounded-2xl p-5">
        <div>
          <p className="font-mono text-2xs tracking-[0.16em] text-fg-faint uppercase">
            Customer story
          </p>
          <p className="mt-2 text-[0.9375rem] leading-snug font-medium text-fg-strong">
            “We replaced a two-week agency cycle with a Tuesday afternoon.”
          </p>
          <p className="mt-2 text-[0.8125rem] text-fg-subtle">
            Priya Raman, VP Product Marketing at Northwind
          </p>
        </div>
        <Link
          href="/customers/northwind"
          className="mt-5 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-iris-300 hover:text-iris-400"
        >
          Read the story
          <Icon name="arrowRight" className="size-3.5" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}

function ResourcesMenu() {
  return (
    <div className="container-wide grid gap-1 py-8 sm:grid-cols-2 lg:grid-cols-4">
      {nav.resources.map((item) => (
        <MenuItem key={item.href} {...item} />
      ))}
    </div>
  );
}

function MobileGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[var(--line)] pb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-[0.9375rem] font-medium"
        aria-expanded={open}
      >
        {title}
        <Icon name="chevronDown" className={cn("size-4 text-fg-subtle transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="flex flex-col gap-0.5 pb-2">{children}</div> : null}
    </div>
  );
}

function MobileLink({ title, href, desc, icon }: { title: string; href: string; desc: string; icon: string }) {
  return (
    <Link href={href} className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-ink-850">
      <Icon name={icon as IconName} className="mt-0.5 size-4 text-iris-400" strokeWidth={1.7} />
      <span>
        <span className="block text-[0.875rem] font-medium">{title}</span>
        <span className="block text-[0.8125rem] leading-snug text-fg-subtle">{desc}</span>
      </span>
    </Link>
  );
}
