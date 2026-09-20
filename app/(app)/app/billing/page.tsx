import type { Metadata } from "next";
import { getProjects } from "@/lib/data";
import { PageHeader, Panel, StatTile } from "@/components/app/Shared";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { workspace } from "@/lib/app-data";
import { plans } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing" };

const invoices = [
  { id: "INV-2026-0912", date: "Sep 1, 2026", amount: "$129.00", status: "Paid" },
  { id: "INV-2026-0811", date: "Aug 1, 2026", amount: "$129.00", status: "Paid" },
  { id: "INV-2026-0710", date: "Jul 1, 2026", amount: "$129.00", status: "Paid" },
  { id: "INV-2026-0609", date: "Jun 1, 2026", amount: "$97.00", status: "Paid" },
];

const usageBreakdown = [
  { label: "Rendered video", value: 164, unit: "min", billed: true },
  { label: "Written guides", value: 312, unit: "guides", billed: false },
  { label: "Interactive demos", value: 18, unit: "tours", billed: false },
  { label: "Localized versions", value: 96, unit: "renders", billed: false },
  { label: "Social clips", value: 214, unit: "clips", billed: false },
];

export default async function BillingPage() {
  // From the data access layer, so the ids on this page are the ids the
  // pages it links to will look up. When the list read fixtures and the
  // detail pages read Postgres — or the other way round — every link on the
  // screen was a 404 waiting for somebody to click it.
  const projects = await getProjects();

  const pct = (workspace.minutes.used / workspace.minutes.total) * 100;
  const current = plans.find((p) => p.name === workspace.plan)!;

  return (
    <>
      <PageHeader
        title="Billing"
        description="Usage, plan and invoices. Change plan or add seats without talking to anyone."
        actions={
          <>
            <Button variant="outline" size="sm">
              <Icon name="download" className="size-4" strokeWidth={1.8} />
              Download invoices
            </Button>
            <Button size="sm">Change plan</Button>
          </>
        }
      />

      <div className="space-y-4 px-4 py-6 md:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Current plan" value={workspace.plan} icon="creditCard" sub={`$${current.monthly}/mo · billed monthly`} />
          <StatTile label="Video minutes" value={`${workspace.minutes.used}`} icon="clock" sub={`of ${workspace.minutes.total} · resets in 10 days`} />
          <StatTile label="Seats" value={`${workspace.seats.used} / ${workspace.seats.total}`} icon="users" sub="+$29 per extra seat" />
          <StatTile label="Unmetered output" value="640" icon="layers" sub="guides, tours, clips, locales" />
        </div>

        <Panel title="This billing period" description="September 1 – 30, 2026">
          <div className="p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[0.875rem] text-fg">Rendered video minutes</span>
              <span className="font-mono text-[0.875rem] text-fg-muted tabular-nums">
                {workspace.minutes.used} / {workspace.minutes.total}
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

            <ul className="mt-6 divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)]">
              {usageBreakdown.map((u) => (
                <li key={u.label} className="flex items-center gap-4 bg-ink-950 px-4 py-3">
                  <span className="min-w-0 flex-1 text-[0.8125rem] text-fg">{u.label}</span>
                  <span className="font-mono text-[0.8125rem] text-fg-muted tabular-nums">
                    {u.value} {u.unit}
                  </span>
                  <span
                    className={cn(
                      "w-20 shrink-0 rounded-md px-2 py-0.5 text-center text-2xs",
                      u.billed ? "bg-iris-500/15 text-iris-300" : "bg-mint-500/15 text-mint-400",
                    )}
                  >
                    {u.billed ? "billed" : "free"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Panel title="Invoices">
            <ul className="divide-y divide-[var(--line)]">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex items-center gap-4 px-5 py-3">
                  <Icon name="doc" className="size-4 shrink-0 text-fg-faint" strokeWidth={1.8} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[0.8125rem] text-fg">{inv.id}</span>
                    <span className="block text-2xs text-fg-faint">{inv.date}</span>
                  </span>
                  <span className="font-mono text-[0.8125rem] text-fg-muted tabular-nums">{inv.amount}</span>
                  <span className="rounded-md bg-mint-500/15 px-2 py-0.5 text-2xs text-mint-400">
                    {inv.status}
                  </span>
                  <button
                    aria-label={`Download ${inv.id}`}
                    className="inline-flex size-7 items-center justify-center rounded-lg text-fg-faint transition-colors hover:bg-ink-850 hover:text-fg"
                  >
                    <Icon name="download" className="size-3.5" strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="space-y-4">
            <Panel title="Payment method">
              <div className="p-5">
                <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-ink-900 p-3.5">
                  <Icon name="creditCard" className="size-5 shrink-0 text-fg-muted" strokeWidth={1.7} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[0.8125rem] text-fg">•••• 4242</span>
                    <span className="block text-2xs text-fg-faint">Expires 04 / 2029</span>
                  </span>
                </div>
                <Button variant="outline" size="sm" className="mt-3 w-full">Update card</Button>
              </div>
            </Panel>

            <Panel title="Need more?">
              <div className="space-y-3 p-5">
                <p className="text-[0.8125rem] leading-relaxed text-fg-subtle">
                  Scale includes 900 minutes, Riff Agent, unlimited voice clones, the API and
                  regional processing.
                </p>
                <Button size="sm" className="w-full">Upgrade to Scale</Button>
                <Button href="/contact" variant="ghost" size="sm" className="w-full">
                  Talk to sales about Enterprise
                </Button>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
