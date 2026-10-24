import { FirstTouchLinks } from "@/components/marketing/FirstTouchLinks";

/**
 * Paid-search landing pages. No site header or footer: those link to pages
 * the ads must not send traffic to. First touch still rides every link to
 * the page's own sign-up screen.
 */
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="dark" className="flex min-h-dvh flex-col bg-ink-1000 text-fg">
      <FirstTouchLinks />
      {children}
    </div>
  );
}
