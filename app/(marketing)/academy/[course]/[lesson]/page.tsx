import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { courses, getLesson } from "@/lib/academy-content";
import { Prose } from "@/components/marketing/Prose";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Section, Card, Badge } from "@/components/ui/Primitives";
import { cn } from "@/lib/utils";

export function generateStaticParams() {
  return courses.flatMap((c) => c.lessons.map((l) => ({ course: c.slug, lesson: l.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ course: string; lesson: string }>;
}): Promise<Metadata> {
  const { course, lesson } = await params;
  const found = getLesson(course, lesson);
  if (!found) return {};
  return {
    title: `${found.lesson.title} — ${found.course.title}`,
    description: found.lesson.summary,
    alternates: { canonical: `/academy/${course}/${lesson}` },
  };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ course: string; lesson: string }>;
}) {
  const { course: courseSlug, lesson: lessonSlug } = await params;
  const found = getLesson(courseSlug, lessonSlug);
  if (!found) notFound();
  const { course, lesson, prev, next, index } = found;

  return (
    <Section className="py-10 md:py-14">
      <div className="container-page">
        <nav aria-label="Breadcrumb" className="mb-8 flex flex-wrap items-center gap-2 text-2xs text-fg-faint">
          <Link href="/academy" className="transition-colors hover:text-fg-muted">Demo Academy</Link>
          <Icon name="chevronRight" className="size-3" strokeWidth={2.4} />
          <span className="text-fg-subtle">{course.title}</span>
        </nav>

        <div className="grid gap-12 lg:grid-cols-[16rem_1fr] lg:gap-16">
          {/* course rail */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Badge tone="neutral">{course.level}</Badge>
            <p className="mt-3 text-[0.9375rem] font-medium text-fg-strong">{course.title}</p>
            <ol className="mt-4 flex flex-col gap-0.5 border-l border-[var(--line)]">
              {course.lessons.map((l, n) => (
                <li key={l.slug}>
                  <Link
                    href={`/academy/${course.slug}/${l.slug}`}
                    className={cn(
                      "-ml-px flex items-start gap-2.5 border-l-2 py-2 pl-4 text-[0.8125rem] leading-snug transition-colors",
                      l.slug === lesson.slug
                        ? "border-iris-500 text-fg-strong"
                        : "border-transparent text-fg-subtle hover:border-[var(--line-strong)] hover:text-fg",
                    )}
                  >
                    <span className="font-mono text-2xs text-fg-faint">{n + 1}</span>
                    {l.title}
                  </Link>
                </li>
              ))}
            </ol>

            <Card className="mt-8 p-5">
              <p className="text-[0.875rem] font-medium text-fg-strong">Practise on your own product</p>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-fg-subtle">
                Ten free video minutes. Record the demo this lesson describes.
              </p>
              <Button href="/signup" size="sm" className="mt-4 w-full">Start free</Button>
            </Card>
          </aside>

          {/* lesson */}
          <article>
            <p className="font-mono text-2xs tracking-[0.16em] text-iris-300 uppercase">
              Lesson {index + 1} of {course.lessons.length} · {lesson.minutes} min
            </p>
            <h1 className="mt-3 text-[1.875rem] leading-[1.12] tracking-[-0.03em] md:text-[2.25rem]">
              {lesson.title}
            </h1>
            <p className="mt-4 text-[1rem] leading-relaxed text-fg-muted">{lesson.summary}</p>

            <div className="mt-10 border-t border-[var(--line)] pt-10">
              <Prose blocks={lesson.body} />
            </div>

            <nav className="mt-14 grid gap-3 border-t border-[var(--line)] pt-8 sm:grid-cols-2">
              {prev ? (
                <Link
                  href={`/academy/${course.slug}/${prev.slug}`}
                  className="group flex flex-col gap-1 rounded-2xl border border-[var(--line)] p-4 transition-colors hover:border-[var(--line-strong)]"
                >
                  <span className="flex items-center gap-1.5 text-2xs text-fg-faint">
                    <Icon name="chevronLeft" className="size-3" strokeWidth={2.4} />
                    Previous
                  </span>
                  <span className="text-[0.875rem] font-medium text-fg group-hover:text-iris-300">
                    {prev.title}
                  </span>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link
                  href={`/academy/${course.slug}/${next.slug}`}
                  className="group flex flex-col items-end gap-1 rounded-2xl border border-[var(--line)] p-4 text-right transition-colors hover:border-[var(--line-strong)] sm:col-start-2"
                >
                  <span className="flex items-center gap-1.5 text-2xs text-fg-faint">
                    Next
                    <Icon name="chevronRight" className="size-3" strokeWidth={2.4} />
                  </span>
                  <span className="text-[0.875rem] font-medium text-fg group-hover:text-iris-300">
                    {next.title}
                  </span>
                </Link>
              ) : (
                <Link
                  href="/academy"
                  className="group flex flex-col items-end gap-1 rounded-2xl border border-mint-500/30 bg-mint-500/[0.06] p-4 text-right sm:col-start-2"
                >
                  <span className="flex items-center gap-1.5 text-2xs text-mint-400">
                    Course complete
                    <Icon name="check" className="size-3" strokeWidth={2.8} />
                  </span>
                  <span className="text-[0.875rem] font-medium text-fg">Back to the academy</span>
                </Link>
              )}
            </nav>
          </article>
        </div>
      </div>
    </Section>
  );
}
