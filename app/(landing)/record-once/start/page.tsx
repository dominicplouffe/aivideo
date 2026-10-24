import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand/Logo";
import { AuthForm } from "@/components/app/AuthForm";

export const metadata: Metadata = {
  title: "Create your workspace",
  description: "Create your DemoRiff workspace. 10 finished video minutes a month, unlimited written guides, no card.",
  robots: { index: false, follow: false },
  keywords: [],
  openGraph: { title: "Create your workspace · DemoRiff", description: "10 finished video minutes a month, unlimited written guides, no card." },
  twitter: { title: "Create your workspace · DemoRiff", description: "10 finished video minutes a month, unlimited written guides, no card." },
};

/**
 * The sign-up screen for /record-once only. Same form and the same plan
 * hand-off to Stripe Checkout as /signup, without the side panel.
 */
export default async function RecordOnceStart({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const next = plan === "studio" || plan === "byok" ? `/app/billing?checkout=${plan}` : undefined;
  return (
    <div className="flex min-h-dvh flex-col px-5 py-8 md:px-10">
      <span className="inline-flex w-fit items-center">
        <Wordmark />
      </span>
      <div className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-sm">
          <AuthForm
            mode="signup"
            next={next}
            subtitle="10 finished video minutes a month, unlimited written guides, no card."
            ticks={["10 finished video minutes a month", "Unlimited step-by-step guides", "No card needed"]}
          />
        </div>
      </div>
      <p className="text-center text-2xs text-fg-faint">
        By continuing you agree to our{" "}
        <Link href="/legal/terms" className="text-fg-subtle hover:text-fg">Terms</Link> and{" "}
        <Link href="/legal/privacy" className="text-fg-subtle hover:text-fg">Privacy Policy</Link>.
      </p>
    </div>
  );
}
