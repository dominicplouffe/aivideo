import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveShare } from "@/lib/share/resolve";
import { sampleTour } from "@/lib/demo/fixtures";
import { SnapshotPlayer } from "@/components/app/SnapshotPlayer";

/**
 * The embedded player.
 *
 * Served in an iframe on somebody else's page, which changes three things
 * about how it is built:
 *
 *  1. **The text is server-rendered.** A demo embedded on a product page is
 *     content, and content that only exists after JavaScript runs is content
 *     a search engine may never see. The step titles and narration are in
 *     the initial HTML.
 *  2. **It carries no chrome.** No navigation, no footer, no sign-in prompt.
 *     It is a component on a customer's page, not a page of ours wearing a
 *     costume.
 *  3. **It sets no cookies.** Nothing here reads or writes storage, so the
 *     embed needs no consent banner and a marketing team can paste it
 *     without asking legal.
 *
 * It resolves through the same published-asset check as the share page. An
 * embed that kept serving after somebody took a demo down would be the worst
 * possible place for that bug to live — on a page we do not control and
 * cannot reach.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const share = await resolveShare(id);
  return {
    title: share ? `${share.project.title} — demo` : "Demo",
    // An embed is not a page anyone should reach from search directly; the
    // host page is. Indexing the frame would compete with the customer's own
    // page for the same query.
    robots: { index: false, follow: false },
  };
}

export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const share = await resolveShare(id);
  if (!share) notFound();

  const { project, videoUrl } = share;

  return (
    <div data-theme="dark" className="min-h-dvh bg-ink-950 text-fg">
      {videoUrl ? (
        <video
          src={videoUrl}
          controls
          playsInline
          preload="metadata"
          className="h-dvh w-full bg-black object-contain"
        />
      ) : (
        <SnapshotPlayer tour={sampleTour()} className="h-dvh p-3" />
      )}

      {/*
        Server-rendered for indexing and for anyone using a screen reader
        who reaches the frame: the chapters are readable without running a
        line of JavaScript. Visually hidden rather than display:none,
        because display:none is hidden from assistive technology too.
      */}
      <div className="sr-only">
        <h1>{project.title} — demo</h1>
        <p>{project.description}</p>
        <ol>
          {project.segments.map((segment) => (
            <li key={segment.id}>{segment.title}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
