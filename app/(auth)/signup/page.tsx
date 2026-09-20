import type { Metadata } from "next";
import { AuthForm } from "@/components/app/AuthForm";

export const metadata: Metadata = {
  title: "Start free",
  description:
    "Create your DemoRiff workspace. Ten free video minutes, unlimited guides, every AI feature unlocked, no credit card.",
  alternates: { canonical: "/signup" },
};

export default function SignUpPage() {
  return <AuthForm mode="signup" />;
}
