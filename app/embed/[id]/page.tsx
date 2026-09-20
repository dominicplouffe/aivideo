import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProject, projects } from "@/lib/app-data";
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
 */

export function generateStaticParams() {
  return projects.filter((p) => p.outputs.includes("interactive")).map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const project = getProject(id);
  return {
    title: project ? `${project.title} — interactive demo` : "Interactive demo",
    // An embed is not a page anyone should reach from search directly; the
    // host page is. Indexing the frame would compete with the customer's own
    // page for the same query.
    robots: { index: false, follow: false },
  };
}

export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  const tour = sampleTour();

  return (
    <div className="min-h-dvh bg-ink-950 text-fg">
      <SnapshotPlayer tour={tour} className="h-dvh p-3" />

      {/*
        Server-rendered for indexing and for anyone using a screen reader
        who reaches the frame: the steps are readable without running a line
        of JavaScript. Visually hidden rather than display:none, because
        display:none is hidden from assistive technology too.
      */}
      <div className="sr-only">
        <h1>{project.title} — interactive demo</h1>
        <p>{project.description}</p>
        <ol>
          {tour.steps.map((step) => (
            <li key={step.id}>
              {step.title}
              {step.caption ? ` — ${step.caption}` : ""}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
