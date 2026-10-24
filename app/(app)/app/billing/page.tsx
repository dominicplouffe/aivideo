import type { Metadata } from "next";
import { PageHeader } from "@/components/app/Shared";
import { BillingView } from "@/components/app/BillingView";
import { viewerMay } from "@/lib/data";

export const metadata: Metadata = { title: "Billing" };

/**
 * Billing: the plan, the period's usage, and the ways to change either.
 *
 * Reading needs `billing.view`, which an admin has; changing anything needs
 * `billing.manage`, which only the owner has. The person who runs the
 * workspace can see what it costs without being able to change what the
 * company pays.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ purchased?: string; checkout?: string }>;
}) {
  const [{ purchased, checkout }, canManage] = await Promise.all([searchParams, viewerMay("billing.manage")]);
  // Set by sign-up from a paid plan's button: open that plan's checkout.
  const startCheckout = checkout === "studio" || checkout === "byok" ? checkout : null;
  return (
    <>
      <PageHeader title="Billing" description="What this workspace is on, what it has used this period, and how to change it." />
      <BillingView purchased={purchased ?? null} canManage={canManage} startCheckout={startCheckout} />
    </>
  );
}
