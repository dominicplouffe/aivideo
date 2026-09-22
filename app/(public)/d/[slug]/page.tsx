import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveShare } from "@/lib/share/resolve";
import { SharePage } from "@/components/app/SharePage";

/**
 * A public share page.
 *
 * Dynamic rather than statically generated. It used to pre-render from the
 * fixtures at build time, which meant a project somebody published after the
 * deploy had no page at all — and a project they *un*published still did.
 * The published flag has to be read when the page is served, because that is
 * the only moment at which it is current.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const share = await resolveShare(slug);
  if (!share) return {};

  return {
    title: share.project.title,
    description: share.project.description,
    openGraph: {
      type: "video.other",
      title: share.project.title,
      description: share.project.description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function PublicSharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const share = await resolveShare(slug);
  // The same answer for "never existed" and "not published": a different one
  // tells a stranger which slugs a company is sitting on.
  if (!share) notFound();

  return <SharePage project={share.project} videoUrl={share.videoUrl} brand={share.brand} />;
}
