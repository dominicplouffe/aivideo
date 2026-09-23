import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/app/Shared";
import { Icon } from "@/components/ui/Icon";
import { ApprovalPanel } from "@/components/app/agent/ApprovalPanel";
import { RunStatusPill } from "@/components/app/agent/RunStatusPill";
import { RunTrail } from "@/components/app/agent/RunTrail";
import { RunProgress } from "@/components/app/agent/RunProgress";
import { Button } from "@/components/ui/Button";
import { getCurrentActor } from "@/lib/auth/current";
import { allowed } from "@/lib/auth/authorize";
import { getAgentRunDetail } from "@/lib/data";
import { hasOtherApprover } from "@/lib/agent/run";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Agent run" };

export default async function AgentRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getAgentRunDetail(id);
  if (!detail) notFound();

  const { run, actions } = detail;

  // Read here to shape the screen, never to decide anything. The server
  // refuses an approval this actor may not give whatever this page renders.
  const actor = await getCurrentActor();
  const canApprove = actor
    ? allowed(actor, "agent.approve", { workspaceId: actor.workspaceId })
    : true;
  const isRequester = actor ? actor.email === run.requestedByEmail : false;
  // Alone in the workspace with approval rights: the requester may approve.
  const soleApprover =
    isRequester && actor ? !(await hasOtherApprover(actor.workspaceId, actor.memberId)) : false;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Riff Agent", href: "/app/agent" }, { label: "Run" }]}
        title={headline(run.brief)}
        description={`Requested by ${run.requestedByEmail} ${relativeTime(run.createdAt)}.`}
        actions={<RunStatusPill status={run.status} />}
      />

      <div className="grid gap-5 px-4 py-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* `min-w-0` on both columns: a grid item defaults to
            `min-width: auto`, so the long URLs in the trail below widen the
            whole track instead of truncating inside it. */}
        <div className="min-w-0 space-y-5">
          {run.status === "awaiting_approval" ? (
            <ApprovalPanel
              runId={run.id}
              requestedBy={run.requestedByEmail}
              canApprove={canApprove}
              isRequester={isRequester && !soleApprover}
              soleApprover={soleApprover}
            />
          ) : null}

          {run.status === "approved" || run.status === "recording" ? (
            <RunProgress runId={run.id} status={run.status} />
          ) : null}

          {run.status === "recorded" ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-mint-500/30 bg-mint-500/[0.07] px-4 py-3.5">
              <Icon name="check" className="size-4 shrink-0 text-mint-400" strokeWidth={2.4} />
              <p className="min-w-0 flex-1 text-[0.8125rem] leading-relaxed text-fg">
                <span className="font-medium text-fg-strong">Recorded. </span>
                {run.projectId
                  ? "The footage is a project now, with each step's narration as its script. Open it to hear it narrated, tighten it, and export."
                  : "The run finished, but no video was produced, so there is no project. The trail below says what happened."}
              </p>
              {run.projectId ? (
                <Button href={`/app/studio/${run.projectId}`} size="sm">
                  <Icon name="scissors" className="size-4" strokeWidth={2} />
                  Open in Studio
                </Button>
              ) : null}
            </div>
          ) : null}

          {run.error ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 px-4 py-3.5">
              <p className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-fg">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-rose-400" strokeWidth={1.9} />
                <span>
                  <span className="font-medium text-rose-400">The run stopped. </span>
                  {run.error}
                </span>
              </p>
            </div>
          ) : null}

          <Panel title="The plan" className="overflow-hidden">
            <ol className="divide-y divide-[var(--line)]">
              {run.outline.map((step) => (
                <li key={step.ordinal} className="flex gap-3.5 px-5 py-3.5">
                  <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-ink-900 font-mono text-2xs text-fg-subtle">
                    {step.ordinal + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.875rem] leading-relaxed text-fg">{step.intent}</p>
                    {step.url ? (
                      <p className="mt-0.5 truncate font-mono text-2xs text-fg-faint">{step.url}</p>
                    ) : null}
                    {step.action ? (
                      <p className="mt-1 flex items-center gap-1.5 text-2xs text-fg-subtle">
                        <Icon name={step.action.kind === "click" ? "cursor" : "caption"} className="size-3 shrink-0 text-fg-faint" strokeWidth={2} />
                        {step.action.kind === "click" ? (
                          <>Click <span className="font-medium text-fg">“{step.action.target}”</span></>
                        ) : (
                          <>
                            Type <span className="font-mono text-fg">“{step.action.value}”</span> into{" "}
                            <span className="font-medium text-fg">{step.action.target}</span>
                          </>
                        )}
                      </p>
                    ) : null}
                    {step.narration ? (
                      <p className="mt-1.5 border-l-2 border-[var(--line-strong)] pl-2.5 text-[0.8125rem] leading-relaxed text-fg-subtle italic">
                        {step.narration}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>

            {run.removed.length > 0 ? (
              <div className="border-t border-[var(--line)] bg-ink-900/60 px-5 py-4">
                <p className="text-2xs font-medium uppercase tracking-wide text-fg-faint">
                  Removed from the plan
                </p>
                <ul className="mt-2 space-y-2">
                  {run.removed.map((step) => (
                    <li key={step.intent} className="text-2xs leading-relaxed text-fg-subtle">
                      <span className="text-fg">{step.intent}</span>
                      {step.url ? <span className="font-mono text-fg-faint"> · {step.url}</span> : null}
                      <span className="text-amber-400/90"> — {step.reason}</span>
                    </li>
                  ))}
                </ul>
                {/* Shown rather than trimmed, because a plan that reads as
                    approvable while hiding a step nobody would approve is
                    the failure this whole gate exists to prevent. */}
                <p className="mt-3 text-2xs leading-relaxed text-fg-faint">
                  These were proposed and dropped before you saw the plan. They are
                  listed so the plan you approve is the whole plan.
                </p>
              </div>
            ) : null}
          </Panel>

          <Panel title="What it did" className="overflow-hidden">
            <RunTrail actions={actions} />
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="Boundary">
            <div className="space-y-4 px-5 py-5">
              <div>
                <p className="text-2xs font-medium uppercase tracking-wide text-fg-faint">
                  Allowed origins
                </p>
                <ul className="mt-2 space-y-1.5">
                  {run.allowedOrigins.map((origin) => (
                    <li
                      key={origin}
                      className="flex items-center gap-2 font-mono text-2xs text-fg-subtle"
                    >
                      <Icon name="lock" className="size-3 shrink-0 text-fg-faint" strokeWidth={1.9} />
                      {origin}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-2xs leading-relaxed text-fg-faint">
                  Frozen when the plan was approved. Changing the workspace list
                  afterwards does not change what this run may reach.
                </p>
              </div>
            </div>
          </Panel>

          <Panel title="Approval">
            <dl className="space-y-3 px-5 py-5 text-[0.8125rem]">
              <Row label="Requested by" value={run.requestedByEmail} />
              <Row label="Approved by" value={run.approvedByEmail ?? "—"} />
              <Row
                label="Approved"
                value={run.approvedAt ? relativeTime(run.approvedAt) : "—"}
              />
              <Row label="Started" value={run.startedAt ? relativeTime(run.startedAt) : "—"} />
              <Row label="Finished" value={run.finishedAt ? relativeTime(run.finishedAt) : "—"} />
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}

/**
 * A brief, shortened to a headline.
 *
 * Cut at a word boundary rather than a character count: "create a shipment
 * fo…" reads like a rendering bug, and the first thing somebody sees on a
 * page about trusting an agent should not look broken.
 */
function headline(brief: string, limit = 78): string {
  const flat = brief.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[,:;.]$/, "")}…`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-fg-faint">{label}</dt>
      <dd className="min-w-0 truncate text-right text-fg">{value}</dd>
    </div>
  );
}
