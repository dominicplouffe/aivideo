import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/data";
import { Studio } from "@/components/app/studio/Studio";
import { providerReport } from "@/lib/providers";

/**
 * Read through the data access layer, not from the fixtures.
 *
 * The projects list has been served from Postgres since the repository layer
 * landed, and these pages had not moved with it — so with a database
 * configured every "Open in Studio" link from that list 404'd, because the
 * list showed database ids and the lookup only knew fixture ones. The two
 * sources have to be the same source.
 *
 * `generateStaticParams` goes with it: a page whose content depends on who
 * is asking cannot be pre-rendered per id at build time.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = await getProject(id);
  return { title: p ? `${p.title} — Studio` : "Studio" };
}

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  // Whether the words on screen were heard or invented. Read here rather
  // than fetched by the editor: it is a property of the deployment, it never
  // changes while somebody is editing, and a banner that appears a second
  // after the transcript does is a banner people learn to ignore.
  const transcription = providerReport().find((entry) => entry.capability === "transcription");

  return (
    <Studio
      project={project}
      transcriptionLive={transcription?.live ?? true}
      transcriptionMissing={transcription?.missing ?? []}
    />
  );
}
