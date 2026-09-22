/**
 * Shared types for a project and the people around it.
 *
 * This module used to carry a seeded workspace as well — Meridian, its seven
 * members, eight projects with invented view counts, and two functions that
 * generated retention curves and view series from a PRNG. Sixteen files
 * imported those values, and the application fell back to them whenever the
 * database was absent *or returned nothing*, so somebody who had just
 * created an account was shown another company's numbers beside their own
 * zeros with no way to tell which were which.
 *
 * The data now lives in `lib/db/scripts/fixtures.ts` and is reachable only
 * from the seed script and the tests. Nothing that renders for a signed-in
 * person can import it. What is left here is types, which never invented
 * anything.
 */
export type ProjectStatus = "draft" | "processing" | "ready" | "published" | "stale" | "failed";
export type OutputKind = "video" | "guide" | "interactive" | "clips";

export interface Member {
  id: string;
  name: string;
  email: string;
  role: "Owner" | "Admin" | "Creator" | "Reviewer" | "Viewer";
  lastActive: string;
  hue: number;
}

export interface TranscriptWord {
  w: string;
  /** seconds */
  t: number;
  d: number;
  /** flagged as a filler / dead-air candidate */
  cut?: boolean;
  /** emphasised term */
  em?: boolean;
}

export interface Segment {
  id: string;
  title: string;
  start: number;
  end: number;
  words: TranscriptWord[];
  /** element the user interacted with during this segment */
  action?: string;
  zoom?: { scale: number; x: number; y: number };
}

export interface Project {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: ProjectStatus;
  durationSec: number;
  sourceDurationSec: number;
  updatedAt: string;
  createdAt: string;
  owner: string;
  brandKit: string;
  voice: string;
  locales: string[];
  outputs: OutputKind[];
  views: number;
  completion: number;
  ctaClicks: number;
  collection: string;
  segments: Segment[];
  /**
   * The take this project was cut from, when there is one. Fixture projects
   * have none, which is why the Studio has to keep a fallback for a canvas
   * with no footage behind it.
   */
  recordingId?: string | null;
  /**
   * Whether that take's bytes actually arrived.
   *
   * Separate from `recordingId` because a recording row exists from the
   * moment somebody presses record, and a `<video>` pointed at one that
   * never finished uploading is a 404 per thumbnail.
   */
  hasMedia?: boolean;
  /**
   * The voice that narrates renders of this project, or null for the voice
   * on the recording. `voice` above is that voice's display label; this is
   * the id the picker and the renderer work with.
   */
  voiceId?: string | null;
  /** The brand kit applied to renders and the share page, or null for none. `brandKit` above is its name. */
  brandKitId?: string | null;
  /** The Studio's saved decisions. Absent means "nobody has edited this yet". */
  editState?: Record<string, unknown> | null;
}
