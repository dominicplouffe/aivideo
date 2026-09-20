import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { projects, getProject } from "@/lib/app-data";
import { DemoBuilder } from "@/components/app/DemoBuilder";

export function generateStaticParams() {
  return projects.filter((p) => p.outputs.includes("interactive")).map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = getProject(id);
  return { title: p ? `${p.title} — Demo builder` : "Demo builder" };
}

export default async function DemoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();
  return <DemoBuilder project={project} />;
}
