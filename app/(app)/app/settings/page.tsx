import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/app/Shared";
import { SettingsView } from "@/components/app/SettingsView";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Workspace settings"
        description="Identity, security, masking policies, integrations and API keys."
      />
      <SettingsView />
    </>
  );
}
