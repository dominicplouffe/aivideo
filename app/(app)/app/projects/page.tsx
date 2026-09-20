import type { Metadata } from "next";
import { PageHeader } from "@/components/app/Shared";
import { ProjectLibrary } from "@/components/app/ProjectLibrary";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Every recording in the workspace, with full-text search across transcripts. Open one to edit it as a script."
        actions={
          <>
            <Button href="/app/new?mode=import" variant="outline" size="sm">
              <Icon name="upload" className="size-4" strokeWidth={1.8} />
              Import
            </Button>
            <Button href="/app/new" size="sm">
              <Icon name="plus" className="size-4" strokeWidth={2.2} />
              New recording
            </Button>
          </>
        }
      />
      <ProjectLibrary />
    </>
  );
}
