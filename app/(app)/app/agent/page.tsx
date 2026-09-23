import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Panel, StatTile, EmptyState } from "@/components/app/Shared";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { RunStatusPill } from "@/components/app/agent/RunStatusPill";
import { getAgentRuns, viewerMay } from "@/lib/data";
import { SignInsPanel } from "@/components/app/agent/SignInsPanel";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Riff Agent" };

export default async function AgentPage() {
  const [runs, canManageSignIns] = await Promise.all([getAgentRuns(), viewerMay("agent.credentials.manage")]);
  const waiting = runs.filter((run) => run.status === "awaiting_approval");
  const recorded = runs.filter((run) => run.status === "recorded");
  const stopped = runs.filter((run) => run.status === "failed");

  return (
    <>
      <PageHeader
        title="Riff Agent"
        description="Describe a flow and the agent plans it, step by step. Somebody reads the plan and approves it. Only then does anything record — inside the origins you named, with credentials scoped to them, and every action written down."
      />

      <div className="space-y-6 px-4 py-6 md:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Waiting for approval" value={String(waiting.length)} icon="shield" />
          <StatTile label="Recorded" value={String(recorded.length)} icon="record" />
          <StatTile label="Stopped at the boundary" value={String(stopped.length)} icon="lock" sub="plan left the allowlist" />
          <StatTile
            label="Ready to edit"
            value={String(recorded.filter((run) => run.projectId).length)}
            icon="scissors"
            sub="recordings that became projects"
          />
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Panel title="Runs" className="overflow-hidden">
            {runs.length === 0 ? (
              <EmptyState
                icon="rocket"
                title="No runs yet"
                description="Name the origins the agent may reach, say what to demonstrate, and read the plan it comes back with."
              />
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {runs.map((run) => (
                  <li key={run.id}>
                    <Link
                      href={`/app/agent/${run.id}`}
                      className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-[color-mix(in_oklab,var(--color-fg)_4%,transparent)]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[0.875rem] leading-relaxed text-fg">{run.brief}</p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-fg-faint">
                          <span>{run.requestedByEmail}</span>
                          <span>·</span>
                          <span>{relativeTime(run.createdAt)}</span>
                          <span>·</span>
                          <span>{run.outline.length} steps</span>
                          <span>·</span>
                          <span className="font-mono">{run.allowedOrigins.join(" ")}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <RunStatusPill status={run.status} />
                        <Icon name="chevronRight" className="size-4 text-fg-faint" strokeWidth={2} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="space-y-5">
            <Panel title="New run">
              <div className="px-5 py-5">
                <p className="text-[0.8125rem] leading-relaxed text-fg-subtle">
                  Say where the agent may go and what to show. You plan the steps, read and change them, and choose the
                  sign-in for each site before anything waits for approval.
                </p>
                <Button href="/app/agent/new" size="sm" className="mt-3">
                  <Icon name="plus" className="size-4" strokeWidth={2.2} />
                  New run
                </Button>
              </div>
            </Panel>

            <Panel title="Saved sign-ins">
              <SignInsPanel canManage={canManageSignIns} />
            </Panel>

            <Panel title="What the agent cannot do">
              <ul className="space-y-3.5 px-5 py-5">
                {[
                  {
                    icon: "shield" as const,
                    title: "Record without an approval",
                    body: "The approval is the state machine, not a setting. There is no path from a plan to a recording that does not pass through a person — and not the person who asked.",
                  },
                  {
                    icon: "lock" as const,
                    title: "Leave the origins you named",
                    body: "It will not follow a link, a redirect or a script to another site, and a name that resolves onto a private address is refused whatever the list says.",
                  },
                  {
                    icon: "key" as const,
                    title: "Type a password anywhere else",
                    body: "A sign-in is bound to one exact site and checked against where the browser actually is, which is what a redirect changes.",
                  },
                  {
                    icon: "eye" as const,
                    title: "Do anything off the record",
                    body: "Every action is kept, refusals included — an agent that quietly drops a blocked request looks identical to one that never tried.",
                  },
                ].map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-ink-900 text-fg-subtle">
                      <Icon name={item.icon} className="size-3.5" strokeWidth={1.8} />
                    </span>
                    <div>
                      <p className="text-[0.8125rem] font-medium text-fg-strong">{item.title}</p>
                      <p className="mt-0.5 text-2xs leading-relaxed text-fg-subtle">{item.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
