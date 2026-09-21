import type { Metadata } from "next";
import { AuthForm } from "@/components/app/AuthForm";
import { safeNext } from "@/lib/auth/identity";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your DemoRiff workspace.",
  robots: { index: false, follow: true },
};

/**
 * The single sign-on flow redirects back here on every refusal, carrying a
 * short reason. Read on the server and handed to the form, so the message is
 * in the first response rather than appearing after hydration.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  // Sanitised here rather than where it is used. A post-login redirect is
  // exactly what phishing wants, and the client hands this straight to
  // `router.push`, which will happily leave the site for an absolute URL.
  return <AuthForm mode="signin" error={error} next={safeNext(next)} />;
}
