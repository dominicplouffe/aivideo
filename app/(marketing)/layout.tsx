import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";

/**
 * The marketing site is pinned to the dark rendering whatever the reader's
 * appearance preference: its artwork — the hero canvas, the product mock-ups,
 * the previews — is drawn for it.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="dark" className="flex min-h-dvh flex-col bg-ink-1000 text-fg">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
