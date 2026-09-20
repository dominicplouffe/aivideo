import Link from "next/link";
import { docSections } from "@/lib/docs-content";
import { Icon } from "@/components/ui/Icon";
import { DocsNav } from "@/components/marketing/DocsNav";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container-wide py-10 md:py-14">
      <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-2xs text-fg-faint">
        <Link href="/" className="transition-colors hover:text-fg-muted">Home</Link>
        <Icon name="chevronRight" className="size-3" strokeWidth={2.4} />
        <Link href="/docs" className="transition-colors hover:text-fg-muted">Help center</Link>
      </nav>
      <div className="grid gap-12 lg:grid-cols-[15rem_1fr] lg:gap-14">
        <DocsNav sections={docSections.map((s) => ({
          title: s.title,
          icon: s.icon,
          pages: s.pages.map((p) => ({ slug: p.slug, title: p.title })),
        }))} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
