import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/Shared";
import { AdminWorkspaces } from "@/components/app/AdminWorkspaces";
import { isStaff } from "@/lib/admin/staff";
import { listWorkspaces } from "@/lib/admin/workspaces";
import { getCurrentActor } from "@/lib/auth/current";
import { includedSeconds, PLANS, planFor } from "@/lib/billing/plans";

export const metadata: Metadata = { title: "Admin" };

/**
 * Every workspace, for DemoRiff staff: what each is on, and granting a plan
 * or minutes without a payment. Everybody else gets a 404, as they do from
 * the route behind it.
 */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (!(await isStaff(await getCurrentActor()))) notFound();

  const { q = "" } = await searchParams;
  const workspaces = await listWorkspaces(q);
  const plans = PLANS.map((id) => {
    const plan = planFor(id);
    return {
      id,
      name: plan.name,
      seats: plan.seats,
      minutes: Math.round(includedSeconds(id, 0) / 60),
      pack: plan.projectPack ? { size: plan.projectPack.size, minutes: Math.round(plan.projectPack.extraSeconds / 60) } : null,
    };
  });

  return (
    <>
      <PageHeader
        title="Admin"
        description="Every workspace on DemoRiff. Grant a plan, seats or minutes without a payment; each grant is written to that workspace's audit log."
      />
      <AdminWorkspaces query={q} workspaces={workspaces} plans={plans} />
    </>
  );
}
