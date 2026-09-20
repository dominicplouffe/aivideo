import type { Metadata } from "next";
import { AuthForm } from "@/components/app/AuthForm";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your DemoRiff workspace.",
  robots: { index: false, follow: true },
};

export default function SignInPage() {
  return <AuthForm mode="signin" />;
}
