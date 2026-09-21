import type { Metadata } from "next";
import { getProjects, getUsage } from "@/lib/data";
import { PageHeader, Panel, StatTile } from "@/components/app/Shared";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { plans } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing" };

/*
 * Four invoices with ids, dates and amounts, and a five-line usage
 * breakdown, both lived here as literal arrays. Stripe owns invoices and
 * this deployment has not been told about a customer, so there is nothing to
 * list; inventing "INV-2026-0912 · $129.00 · Paid" tells somebody their
 * account has a billing history it does not have.
 */

export default async function BillingPage() {
  // From the data access layer, so the ids on this page are the ids the
  // pages it links to will look up. When the list read fixtures and the
  // detail pages read Postgres — or the other way round — every link on the
  // screen was a 404 waiting for somebody to click it.
  const projects = await getProjects();

  // Metered usage from the workspace row. This page read `workspace` from
  // the fixtures — 164 of 240 minutes, on every account — while the project
  // list on the same screen came from Postgres.
  const usage = await getUsage();
  const usedMinutes = usage ? Math.round(usage.usedSeconds / 60) : 0;
  const totalMinutes = usage ? Math.round(usage.allowanceSeconds / 60) : 0;
  const pct = usage ? Math.min(100, usage.fractionUsed * 100) : 0;
  // The workspace's own plan, or the free plan for an account with no
  // metering yet. This fell back to the fixture's "Team", so a workspace on
  // the free plan was shown a paid one and its price.
  const planName = usage?.plan ?? "free";
  const current =
    plans.find((p) => p.name.toLowerCase() === planName.toLowerCase()) ?? plans[0];

  return (
    <>
      <PageHeader
        title="Billing"
        description="What this workspace has used this period."
      />
      {/* "Download invoices" and "Change plan" had no handlers. Both go
          through Stripe, which needs a customer this deployment has not been
          given. */}

      <div className="space-y-4 px-4 py-6 md:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Current plan"
            value={planName}
            icon="creditCard"
            sub={`$${current.monthly}/mo · billed monthly`}
          />
          <StatTile
            label="Video minutes"
            value={`${usedMinutes}`}
            icon="clock"
            sub={`of ${totalMinutes} this period`}
          />
          {/* "Unmetered output 640" counted guides, tours and clips that had
              not been produced. Projects is a number this page can stand
              behind. */}
          <StatTile label="Projects" value={`${projects.length}`} icon="layers" sub="in this workspace" />
        </div>

        <Panel
          title="This billing period"
          description={
            usage
              ? `Began ${new Date(usage.periodStartsAt).toLocaleDateString()}`
              : "No metered usage yet"
          }
        >
          <div className="p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[0.875rem] text-fg">Rendered video minutes</span>
              <span className="font-mono text-[0.875rem] text-fg-muted tabular-nums">
                {usedMinutes} / {totalMinutes}
              </span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink-800">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  pct > 90
                    ? "bg-rose-500"
                    : pct > 75
                      ? "bg-amber-500"
                      : "bg-[linear-gradient(90deg,var(--color-iris-500),var(--color-cyan-400))]",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-2xs text-fg-faint">
              You will be notified at 80%. There is a hard stop you control — we never bill overage
              without an explicit opt-in.
            </p>

            {/* The per-output breakdown listed 312 guides, 18 tours, 96
                localized renders and 214 clips from a literal array. Only
                rendered video is metered, and it is the bar above. */}
          </div>
        </Panel>

        <Panel title="Invoices and payment">
          <div className="space-y-3 p-5">
            <p className="text-[0.8125rem] leading-relaxed text-fg-subtle">
              {/*
                Four invoices, a card ending 4242 expiring 04/2029, and
                Update card / Upgrade to Scale buttons with no handlers used
                to live here. Stripe holds all of it, and this deployment has
                not been given a customer to ask about.
              */}
              Invoices and payment details come from Stripe. Set{" "}
              <code className="font-mono text-fg-muted">STRIPE_SECRET_KEY</code> and connect this
              workspace to a customer, and they appear here.
            </p>
            <Button href="/contact" variant="outline" size="sm">
              Talk to sales about Enterprise
            </Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
