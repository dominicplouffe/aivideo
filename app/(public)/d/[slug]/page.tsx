import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolvePreview, resolveShare } from "@/lib/share/resolve";
import { getCurrentActor } from "@/lib/auth/current";
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
  if (!share) return { title: "Preview", robots: { index: false, follow: false } };

  return {
    title: share.project.title,
    description: share.project.description,
    openGraph: {
      type: "video.other",
      title: share.project.title,
      description: share.project.description,
    },
    // A shared video is for the people it was sent to, not for search results.
    robots: { index: false, follow: false },
  };
}

export default async function PublicSharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const share = await resolveShare(slug);
  if (share) return <SharePage project={share.project} videoUrl={share.videoUrl} brand={share.brand} />;

  // Not public. Its own workspace still sees it — that is what the Studio's
  // Preview button is for. Everybody else gets the same answer for "never
  // existed" and "not published": a different one tells a stranger which
  // slugs a company is sitting on.
  const actor = await getCurrentActor();
  const preview = actor ? await resolvePreview(slug, actor.workspaceId) : null;
  if (!preview) notFound();

  if (!preview.videoUrl) {
    return (
      <main className="container-page flex min-h-dvh flex-col items-center justify-center py-16 text-center">
        <h1 className="text-[1.5rem] tracking-[-0.025em]">Nothing rendered yet</h1>
        <p className="mt-3 max-w-md text-[0.875rem] leading-relaxed text-fg-subtle">
          This is where &ldquo;{preview.project.title}&rdquo; will be shared. Export the video from the Studio, then
          come back to preview the page, and publish it when it is ready to share.
        </p>
        <Link
          href={`/app/studio/${preview.project.id}`}
          className="mt-6 text-[0.875rem] font-medium text-iris-300 hover:text-iris-400"
        >
          Open in the Studio
        </Link>
      </main>
    );
  }

  return (
    <SharePage
      project={preview.project}
      videoUrl={preview.videoUrl}
      brand={preview.brand}
      preview={{ published: preview.publishedAt !== null }}
    />
  );
}
