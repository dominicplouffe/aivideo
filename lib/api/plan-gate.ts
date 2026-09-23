import { NextResponse } from "next/server";
import { aiAllowance, projectCapacity, recordAiAction, usage, type AiAction } from "@/lib/billing/metering";
import { planFor } from "@/lib/billing/plans";

/**
 * Where the plan is felt.
 *
 * Every refusal here is a 402 with a sentence a person can act on and a
 * link to the billing page, because a limit met is a decision for them to
 * make, not an error for us to report. Nothing is refused after work was
 * done; these run before it.
 */

const UPGRADE = "/app/billing";

export function planRefusal(message: string): NextResponse {
  return NextResponse.json({ error: message, upgrade: UPGRADE }, { status: 402 });
}

/** One more project, or the reason not. */
export async function assertProjectRoom(workspaceId: string): Promise<NextResponse | null> {
  const capacity = await projectCapacity(workspaceId);
  if (capacity.ok) return null;
  const plan = planFor(capacity.plan);
  const more =
    plan.projectPack
      ? ` Add ${plan.projectPack.size} more for $${plan.projectPack.priceCents / 100} a month, or delete one you no longer need.`
      : capacity.plan === "free"
        ? " Move to a paid plan for more, or delete one you no longer need."
        : " Delete one you no longer need.";
  return planRefusal(`This workspace has ${capacity.used} of its ${capacity.limit} projects.${more}`);
}

/** One more AI action of this kind, or the reason not. */
export async function assertAiRoom(workspaceId: string, action: AiAction): Promise<NextResponse | null> {
  const allowance = await aiAllowance(workspaceId, action);
  if (allowance.ok) return null;
  const what = action === "suggestion" ? "suggested cuts" : "Riff messages";
  return planRefusal(
    `This workspace has used its ${allowance.limit} ${what} for the period. They come back when the period does, or move to a plan with more.`,
  );
}

/** Counts an AI action that went through. Never throws: the work is done either way. */
export async function noteAiAction(input: { workspaceId: string; action: AiAction; resourceId: string; key: string }): Promise<void> {
  await recordAiAction({
    workspaceId: input.workspaceId,
    action: input.action,
    resourceId: input.resourceId,
    idempotencyKey: `ai:${input.action}:${input.key}`,
  }).catch((error) => console.error("[billing] could not record an AI action:", error));
}

/** A plan feature, or the reason not. */
export async function assertFeature(
  workspaceId: string,
  feature: "agent" | "aiVoiceExport",
  name: string,
): Promise<NextResponse | null> {
  const snapshot = await usage(workspaceId);
  if (planFor(snapshot.plan).features[feature]) return null;
  return planRefusal(`${name} is not part of the ${planFor(snapshot.plan).name} plan.`);
}

/** Room for one more brand kit, or the reason not. */
export async function assertBrandKitRoom(workspaceId: string, existing: number): Promise<NextResponse | null> {
  const snapshot = await usage(workspaceId);
  const limit = planFor(snapshot.plan).features.brandKits;
  if (limit === null || existing < limit) return null;
  return planRefusal(`The ${planFor(snapshot.plan).name} plan includes ${limit} brand kit${limit === 1 ? "" : "s"}. Edit the one you have, or move to a paid plan for more.`);
}

/** Whether a render may start now: the allowance, and the hard stop. */
export async function assertRenderRoom(workspaceId: string): Promise<NextResponse | null> {
  const snapshot = await usage(workspaceId);
  if (!snapshot.blocked) return null;
  const minutes = Math.round((snapshot.limitSeconds + snapshot.topupSeconds) / 60);
  return planRefusal(
    snapshot.hardStopAtLimit && planFor(snapshot.plan).overageCentsPerSecond !== null
      ? `This workspace has used its ${minutes} minutes and has a hard stop on. Turn the stop off to keep rendering with overage, or wait for the period to reset.`
      : `This workspace has used its ${minutes} minutes for the period. Re-rendering a project you already rendered this period is free; a new one needs more minutes, so move to a paid plan or wait for the period to reset.`,
  );
}
