import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { AuthForm } from "@/components/app/AuthForm";

export const metadata: Metadata = pageMetadata({
  title: "Start free",
  description:
    "Create your DemoRiff workspace. Ten free video minutes, unlimited guides, every AI feature unlocked, no credit card.",
  path: "/signup",
});

export default function SignUpPage() {
  return <AuthForm mode="signup" />;
}
