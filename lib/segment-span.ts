import type { Segment } from "@/lib/app-data";

/**
 * How long a chapter with no words plays for.
 *
 * The editor works in words: a chapter's running time is the sum of the
 * words it keeps, and the gaps between them are the dead air it removes. A
 * chapter with no words at all — footage recorded without a microphone, or
 * audio that turned out to be music or room noise rather than speech — has
 * nothing to trim by, so it plays as recorded, start to end.
 *
 * Every place that adds up a chapter's duration takes this branch for a
 * wordless chapter: the Studio's timeline, the timeline strip, the EDL the
 * renderer consumes, and the finished duration shown in the project list.
 * Before it did, a silent take produced a zero-length edit — a Studio whose
 * play button did nothing, and an export with "nothing to render".
 */
export function silentSpanSec(seg: Pick<Segment, "start" | "end">): number {
  return Math.max(0, seg.end - seg.start);
}
