import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/data";
import { DemoBuilder } from "@/components/app/DemoBuilder";

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
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await getProject(id);
  return { title: p ? `${p.title} — Demo builder` : "Demo builder" };
}

export default async function DemoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  return <DemoBuilder project={project} />;
}
