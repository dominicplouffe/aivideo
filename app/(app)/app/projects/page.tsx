import type { Metadata } from "next";
import { PageHeader } from "@/components/app/Shared";
import { ProjectLibrary } from "@/components/app/ProjectLibrary";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { getProjects, dataSource } from "@/lib/data";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const projects = await getProjects();
  const source = dataSource();

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
      {source === "postgres" ? (
        <p className="border-b border-[var(--line)] px-4 py-2 font-mono text-2xs text-mint-400 md:px-8">
          {projects.length} projects served from Postgres
        </p>
      ) : null}
      <ProjectLibrary projects={projects} />
    </>
  );
}
