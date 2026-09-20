import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { projects, getProject } from "@/lib/app-data";
import { GuideEditor } from "@/components/app/GuideEditor";

export function generateStaticParams() {
  return projects.filter((p) => p.outputs.includes("guide")).map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = getProject(id);
  return { title: p ? `${p.title} — Guide` : "Guide" };
}

export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();
  return <GuideEditor project={project} />;
}
