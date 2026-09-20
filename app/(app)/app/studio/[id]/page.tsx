import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { projects, getProject } from "@/lib/app-data";
import { Studio } from "@/components/app/studio/Studio";

export function generateStaticParams() {
  return projects.map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = getProject(id);
  return { title: p ? `${p.title} — Studio` : "Studio" };
}

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();
  return <Studio project={project} />;
}
