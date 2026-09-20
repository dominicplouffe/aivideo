import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { projects, getProject } from "@/lib/app-data";
import { SharePage } from "@/components/app/SharePage";

export function generateStaticParams() {
  return projects.filter((p) => p.status === "published").map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = getProject(slug);
  if (!p) return {};
  return {
    title: p.title,
    description: p.description,
    openGraph: { type: "video.other", title: p.title, description: p.description },
    robots: { index: true, follow: true },
  };
}

export default async function PublicSharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();
  return <SharePage project={project} />;
}
