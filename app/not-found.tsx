import Link from "next/link";
import { Wordmark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

const links = [
  { label: "Product overview", href: "/product" },
  { label: "Pricing", href: "/pricing" },
  { label: "Help center", href: "/docs" },
  { label: "The Riff", href: "/blog" },
  { label: "Contact sales", href: "/contact" },
];

export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-16 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg opacity-35" />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-14rem] left-1/2 size-[34rem] -translate-x-1/2 rounded-full opacity-35"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-iris-500) 38%, transparent), transparent 64%)",
          filter: "blur(70px)",
        }}
      />
      <div className="relative">
        <Link href="/" className="inline-flex">
          <Wordmark />
        </Link>
        <p className="mt-12 font-mono text-2xs tracking-[0.18em] text-iris-300 uppercase">404</p>
        <h1 className="mt-4 text-[2rem] leading-tight tracking-[-0.03em] md:text-[2.75rem]">
          That take does not exist
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[0.9375rem] leading-relaxed text-fg-muted">
          The page you were looking for has moved, been renamed, or never got recorded. Here is
          where most people were heading.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button href="/" size="md">
            Back to home
            <Icon name="arrowRight" className="size-4" strokeWidth={2} />
          </Button>
          <Button href="/docs" variant="outline" size="md">Search the help center</Button>
        </div>

        <ul className="mx-auto mt-12 flex max-w-lg flex-wrap justify-center gap-x-5 gap-y-2.5">
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="text-[0.8125rem] text-fg-subtle transition-colors hover:text-fg"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
