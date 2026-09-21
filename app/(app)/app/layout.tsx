import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { authRequired, getCurrentActor } from "@/lib/auth/current";
import { getUsage, getViewer } from "@/lib/data";

export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s · DemoRiff" },
  robots: { index: false, follow: false },
};

/**
 * The workspace shell, and the gate in front of it.
 *
 * A layout is the wrong place to *rely* on for authorization — it renders
 * once and does not re-run for every data read beneath it, and the
 * framework's own guidance is that the real checks belong next to the data.
 * They are there, in `lib/data.ts`, and every read performs its own.
 *
 * What this adds is the thing a data-layer check cannot: sending somebody
 * who is not signed in to the sign-in page, rather than rendering a
 * workspace full of empty states and leaving them to work out why.
 *
 * Without a database there is nobody to be signed in as and the app runs on
 * seeded fixtures, so the gate stands down — which is what keeps the product
 * explorable from a fresh clone.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (await authRequired()) {
    const actor = await getCurrentActor();
    if (!actor) redirect("/signin?next=/app");
  }

  // Read here rather than fetched by the shell: both are server reads the
  // layout is already awaiting, and a usage meter that arrives a beat after
  // the page is a number people watch change.
  const [usage, viewer] = await Promise.all([getUsage(), getViewer()]);

  return (
    <AppShell usage={usage} viewer={viewer}>
      {children}
    </AppShell>
  );
}
