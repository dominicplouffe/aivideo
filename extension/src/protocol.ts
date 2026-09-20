import type { CaptureEvent, CaptureManifest, MaskRule } from "@/lib/capture/types";
import type { Snapshot } from "@/lib/capture/snapshot";

/**
 * Messages between the three halves of the extension.
 *
 * MV3 splits a recorder across a service worker that can be killed at any
 * moment, a content script that lives and dies with the page, and an
 * offscreen document that exists only because service workers cannot hold a
 * MediaRecorder. Naming every message in one place is what keeps that from
 * becoming three drifting conventions.
 */

export const RECORDER = { name: "demoriff-capture", version: "0.1.0" } as const;

export type ExtensionMessage =
  | { type: "capture/start"; tabId?: number; masks: MaskRule[]; withMicrophone: boolean }
  | { type: "capture/stop" }
  | { type: "capture/state" }
  | { type: "capture/arm-tab"; tabId: number; masks: MaskRule[] }
  | { type: "capture/disarm-tab"; tabId: number }
  | { type: "content/arm"; masks: MaskRule[] }
  | { type: "content/disarm" }
  | { type: "content/events"; events: CaptureEvent[] }
  | { type: "content/snapshot"; snapshot: Snapshot }
  | { type: "content/ready"; url: string; title: string }
  | { type: "offscreen/record"; streamId: string; withMicrophone: boolean }
  | { type: "offscreen/stop" }
  | { type: "offscreen/chunk"; bytes: number }
  | { type: "offscreen/snapshot"; snapshot: Snapshot }
  | {
      type: "offscreen/done";
      videoUrl: string;
      /** A JSON blob of the step snapshots, for the interactive demo. */
      stepsUrl: string | null;
      durationSec: number;
      bytes: number;
    }
  | { type: "offscreen/error"; message: string };

export interface CaptureState {
  recording: boolean;
  tabId: number | null;
  startedAt: number | null;
  eventCount: number;
  snapshotCount: number;
  bytes: number;
  lastError: string | null;
  manifest: CaptureManifest | null;
}
