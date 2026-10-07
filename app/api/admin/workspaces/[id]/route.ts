import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireStaff } from "@/lib/api/guard";
import { grantAccess, type Grant } from "@/lib/admin/workspaces";
import { PLANS, type Plan } from "@/lib/billing/plans";

/** Staff only: give a workspace a plan and allowance without a payment. */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const MINUTE = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Past any real allowance, and far enough inside the integer columns that repeated grants cannot overflow them. */
const MAX_MINUTES = 1_000_000;

export async function PATCH(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireStaff(request);
  if ("response" in guard) return guard.response;

  let body: {
    plan?: unknown;
    project_packs?: unknown;
    seats?: unknown;
    monthly_minutes?: unknown;
    add_minutes?: unknown;
    reset_usage?: unknown;
    note?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  if (typeof body.plan !== "string" || !(PLANS as readonly string[]).includes(body.plan)) {
    return NextResponse.json({ error: `Plan must be one of ${PLANS.join(", ")}.` }, { status: 422 });
  }

  const counts: { key: keyof typeof body; label: string; max: number }[] = [
    { key: "project_packs", label: "Project packs", max: 1_000 },
    { key: "seats", label: "Seats", max: 100_000 },
    { key: "monthly_minutes", label: "Monthly minutes", max: MAX_MINUTES },
    { key: "add_minutes", label: "Added minutes", max: MAX_MINUTES },
  ];
  for (const { key, label, max } of counts) {
    const value = body[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) {
      return NextResponse.json({ error: `${label} must be a whole number from 0 to ${max}.` }, { status: 422 });
    }
  }

  const number = (value: unknown) => (typeof value === "number" ? value : undefined);
  const monthlyMinutes = number(body.monthly_minutes);
  const grant: Grant = {
    plan: body.plan as Plan,
    projectPacks: number(body.project_packs),
    seatsTotal: number(body.seats),
    videoSecondsLimit: monthlyMinutes === undefined ? undefined : monthlyMinutes * MINUTE,
    addTopupSeconds: (number(body.add_minutes) ?? 0) * MINUTE,
    resetUsage: body.reset_usage === true,
    note: typeof body.note === "string" ? body.note.slice(0, 500) : undefined,
  };

  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No such workspace." }, { status: 404 });
  const outcome = await grantAccess(id, grant, { email: guard.actor.email });
  if (!outcome.ok) return NextResponse.json({ error: "No such workspace." }, { status: 404 });
  return NextResponse.json({ workspace: outcome.workspace });
}
