import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { AuthForm } from "@/components/app/AuthForm";

export const metadata: Metadata = pageMetadata({
  title: "Start free",
  description:
    "Create your DemoRiff workspace. Ten free video minutes, unlimited guides, every AI feature unlocked, no credit card.",
  path: "/signup",
});

/**
 * "Start Studio" and "Start on your own keys" link here with `?plan=`. The
 * plan rides through sign-in as the return path, so the new workspace lands
 * on the billing page that opens Stripe Checkout for it, not on Free.
 */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const next = plan === "studio" || plan === "byok" ? `/app/billing?checkout=${plan}` : undefined;
  return <AuthForm mode="signup" next={next} />;
}
