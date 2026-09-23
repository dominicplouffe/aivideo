import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { recordQuietly } from "@/lib/audit/log";
import {
  VENDORS,
  listVendorKeys,
  removeVendorKey,
  saveVendorKey,
  verifyVendorKey,
  type Vendor,
} from "@/lib/billing/vendor-keys";
import { forgetWorkspaceProviders } from "@/lib/providers/for-workspace";

/**
 * The workspace's own vendor keys. Read as last-four summaries; written
 * one at a time, checked with the vendor first. Never returned in full.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "workspace.settings.edit");
  if ("response" in guard) return guard.response;
  return NextResponse.json({ object: "list", data: await listVendorKeys(guard.actor.workspaceId), has_more: false });
}

export async function PUT(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "workspace.settings.edit");
  if ("response" in guard) return guard.response;

  let body: { vendor?: unknown; key?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  const vendor = body.vendor as Vendor;
  if (!(VENDORS as readonly string[]).includes(vendor)) {
    return NextResponse.json({ error: `vendor must be one of ${VENDORS.join(", ")}.` }, { status: 422 });
  }
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (key.length < 8 || key.length > 512 || /\s/.test(key)) {
    return NextResponse.json({ error: "That does not look like an API key." }, { status: 422 });
  }

  const verdict = await verifyVendorKey(vendor, key);
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason }, { status: 422 });

  const saved = await saveVendorKey({ workspaceId: guard.actor.workspaceId, vendor, key, verified: true, createdBy: guard.actor.memberId });
  forgetWorkspaceProviders(guard.actor.workspaceId);
  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "workspace.vendor_key.set",
    resourceType: "workspace",
    resourceId: guard.actor.workspaceId,
    metadata: { vendor, last4: saved.last4 },
  });
  return NextResponse.json({ key: saved });
}

export async function DELETE(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "workspace.settings.edit");
  if ("response" in guard) return guard.response;
  const vendor = new URL(request.url).searchParams.get("vendor") as Vendor | null;
  if (!vendor || !(VENDORS as readonly string[]).includes(vendor)) {
    return NextResponse.json({ error: `vendor must be one of ${VENDORS.join(", ")}.` }, { status: 422 });
  }
  const removed = await removeVendorKey(guard.actor.workspaceId, vendor);
  forgetWorkspaceProviders(guard.actor.workspaceId);
  if (removed) {
    await recordQuietly({
      workspaceId: guard.actor.workspaceId,
      actor: guard.actor,
      action: "workspace.vendor_key.removed",
      resourceType: "workspace",
      resourceId: guard.actor.workspaceId,
      metadata: { vendor },
    });
  }
  return NextResponse.json({ removed });
}
