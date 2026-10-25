import { FirstTouchLinks } from "@/components/marketing/FirstTouchLinks";

/**
 * Public share pages (/d/<slug>). No wrapper and nothing visible: the only
 * job is to carry the visitor's first touch (UTMs, click ids) on the page's
 * existing links to /signup, the same way the marketing pages do.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FirstTouchLinks />
      {children}
    </>
  );
}
