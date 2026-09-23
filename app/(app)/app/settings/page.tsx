import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/app/Shared";
import { SettingsView } from "@/components/app/SettingsView";
import { getUsage } from "@/lib/data";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const usage = await getUsage();
  return (
    <>
      <PageHeader
        title="Workspace settings"
        description="Identity, glossary, your own vendor keys, security and integrations."
      />
      <SettingsView ownKeysPlan={usage?.ownKeys ?? false} />
    </>
  );
}
