import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/data";
import { sampleTour } from "@/lib/demo/fixtures";
import { SnapshotPlayer } from "@/components/app/SnapshotPlayer";
import { Icon } from "@/components/ui/Icon";

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
  const project = await getProject(id);
  return { title: project ? `${project.title} — Preview` : "Demo preview" };
}

export default async function DemoPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  // Until this workspace has a captured session, the sample tour stands in.
  // It is a real tour in the real format, built by the same `buildTour` the
  // extension's output goes through — what is fabricated is the recording,
  // not the pipeline.
  const tour = sampleTour();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/app/demos/${project.id}`}
            className="inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-fg"
          >
            <Icon name="chevronLeft" className="size-3.5" />
            Back to builder
          </Link>
          <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-fg">
            {project.title}
          </h1>
        </div>
        <p className="text-xs text-fg-muted">
          {tour.steps.length} steps · arrow keys to navigate
        </p>
      </div>

      <SnapshotPlayer tour={tour} />

      <p className="mt-4 max-w-2xl text-xs leading-relaxed text-fg-muted">
        Each screen is the product&rsquo;s own markup, captured at the moment of the click.
        It renders in a sandboxed frame with no scripts, no field values and no network
        access — which is why an interactive demo keeps working long after the page it was
        recorded from has been redesigned.
      </p>
    </div>
  );
}
