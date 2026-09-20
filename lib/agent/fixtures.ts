import type { OutlineStep } from "./run";

/**
 * Seeded agent runs.
 *
 * The app runs on fixtures with nobody signed in, which is what keeps it
 * explorable from a fresh clone. These are written to show the feature
 * honestly rather than flatteringly: one run waiting on an approval with a
 * step the planner removed, one finished run whose trail contains refusals,
 * and one that failed because a redirect left the allowlist. A demo where
 * everything succeeded teaches nobody what the gate is for.
 */

export type FixtureStatus =
  | "awaiting_approval" | "approved" | "recording" | "recorded" | "failed" | "cancelled";

export interface FixtureAction {
  ordinal: number;
  kind: "navigate" | "click" | "type" | "wait" | "screenshot" | "refused" | "scroll" | "assert" | "select";
  outlineOrdinal?: number | null;
  url?: string | null;
  target?: string | null;
  detail?: Record<string, unknown> | null;
  refusedReason?: string | null;
  atMs: number;
}

export interface FixtureRun {
  id: string;
  brief: string;
  status: FixtureStatus;
  outline: OutlineStep[];
  removed: { intent: string; url?: string; reason: string }[];
  allowedOrigins: string[];
  requestedByEmail: string;
  approvedByEmail: string | null;
  approvedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
  actions: FixtureAction[];
}

export const agentRuns: FixtureRun[] = [
  {
    id: "run_3f7a21c4",
    brief:
      "Record the shipments flow for the Q4 launch: open the shipments list, create a shipment for the Berlin warehouse, add two line items, and show the tracking page.",
    status: "awaiting_approval",
    outline: [
      { ordinal: 0, intent: "Sign in to the demo workspace", url: "https://app.meridian.com/signin" },
      { ordinal: 1, intent: "Open the shipments list", url: "https://app.meridian.com/shipments" },
      { ordinal: 2, intent: "Start a new shipment" },
      { ordinal: 3, intent: "Choose the Berlin warehouse as the origin" },
      { ordinal: 4, intent: "Add two line items with fictional SKUs" },
      { ordinal: 5, intent: "Save the shipment" },
      { ordinal: 6, intent: "Open the tracking page for the new shipment" },
      { ordinal: 7, intent: "Show the delivery estimate panel" },
    ],
    removed: [
      {
        intent: "Check the public status page for any incidents",
        url: "https://status.meridian-cloud.io",
        reason: "outside the run's allowlist",
      },
    ],
    allowedOrigins: ["https://app.meridian.com"],
    requestedByEmail: "priya@meridian.com",
    approvedByEmail: null,
    approvedAt: null,
    startedAt: null,
    finishedAt: null,
    error: null,
    createdAt: "2026-09-19T14:04:00.000Z",
    actions: [],
  },
  {
    id: "run_9c2e55b1",
    brief: "Show how a support agent resolves a duplicate-charge ticket end to end.",
    status: "recorded",
    outline: [
      { ordinal: 0, intent: "Open the support inbox", url: "https://app.meridian.com/support" },
      { ordinal: 1, intent: "Open the duplicate-charge ticket" },
      { ordinal: 2, intent: "Look up the customer's recent payments" },
      { ordinal: 3, intent: "Issue the refund" },
      { ordinal: 4, intent: "Reply to the customer and close the ticket" },
    ],
    removed: [],
    allowedOrigins: ["https://app.meridian.com"],
    requestedByEmail: "priya@meridian.com",
    approvedByEmail: "dana@meridian.com",
    approvedAt: "2026-09-18T09:12:00.000Z",
    startedAt: "2026-09-18T09:13:04.000Z",
    finishedAt: "2026-09-18T09:15:41.000Z",
    error: null,
    createdAt: "2026-09-18T09:02:00.000Z",
    actions: [
      { ordinal: 0, kind: "navigate", outlineOrdinal: 0, url: "https://app.meridian.com/support", atMs: 0 },
      {
        ordinal: 1, kind: "type", url: "https://app.meridian.com", target: "sign-in form",
        detail: { credential: "meridian-demo", username: "demo@meridian.com" }, atMs: 1_240,
      },
      { ordinal: 2, kind: "click", url: "https://app.meridian.com/support", target: "sign in", atMs: 1_910 },
      {
        ordinal: 3, kind: "refused", url: "https://cdn.analytics-vendor.net/collect",
        refusedReason: "xhr: not-allowed", atMs: 2_050,
      },
      { ordinal: 4, kind: "screenshot", outlineOrdinal: 0, url: "https://app.meridian.com/support", detail: { bytes: 184_221 }, atMs: 3_400 },
      { ordinal: 5, kind: "navigate", outlineOrdinal: 1, url: "https://app.meridian.com/support/t/4821", atMs: 5_100 },
      {
        ordinal: 6, kind: "refused", url: "https://fonts.googleapis.com/css2?family=Inter",
        refusedReason: "stylesheet: not-allowed", atMs: 5_260,
      },
      { ordinal: 7, kind: "screenshot", outlineOrdinal: 1, url: "https://app.meridian.com/support/t/4821", detail: { bytes: 201_884 }, atMs: 7_600 },
      { ordinal: 8, kind: "navigate", outlineOrdinal: 2, url: "https://app.meridian.com/customers/8812/payments", atMs: 9_900 },
      { ordinal: 9, kind: "screenshot", outlineOrdinal: 2, url: "https://app.meridian.com/customers/8812/payments", detail: { bytes: 196_310 }, atMs: 12_400 },
      { ordinal: 10, kind: "click", outlineOrdinal: 3, target: "Issue refund", url: "https://app.meridian.com/customers/8812/payments", atMs: 14_800 },
      { ordinal: 11, kind: "screenshot", outlineOrdinal: 3, url: "https://app.meridian.com/customers/8812/payments", detail: { bytes: 188_002 }, atMs: 17_100 },
      { ordinal: 12, kind: "type", outlineOrdinal: 4, target: "reply body", url: "https://app.meridian.com/support/t/4821", atMs: 20_300 },
      { ordinal: 13, kind: "screenshot", outlineOrdinal: 4, url: "https://app.meridian.com/support/t/4821", detail: { bytes: 179_640 }, atMs: 23_950 },
    ],
  },
  {
    id: "run_5b81dd07",
    brief: "Demonstrate the single sign-on setup screen for the security page.",
    status: "failed",
    outline: [
      { ordinal: 0, intent: "Open workspace settings", url: "https://app.meridian.com/settings" },
      { ordinal: 1, intent: "Open the single sign-on tab" },
      { ordinal: 2, intent: "Show the metadata upload step" },
    ],
    removed: [],
    allowedOrigins: ["https://app.meridian.com"],
    requestedByEmail: "dana@meridian.com",
    approvedByEmail: "priya@meridian.com",
    approvedAt: "2026-09-17T16:40:00.000Z",
    startedAt: "2026-09-17T16:41:12.000Z",
    finishedAt: "2026-09-17T16:41:29.000Z",
    error:
      "That address redirected to https://login.identity-vendor.com, which is not on this run's allowlist.",
    createdAt: "2026-09-17T16:33:00.000Z",
    actions: [
      { ordinal: 0, kind: "navigate", outlineOrdinal: 0, url: "https://app.meridian.com/settings", atMs: 0 },
      {
        ordinal: 1, kind: "navigate", outlineOrdinal: 0, url: "https://app.meridian.com/settings",
        refusedReason:
          "That address redirected to https://login.identity-vendor.com, which is not on this run's allowlist.",
        atMs: 980,
      },
    ],
  },
];

export function getAgentRun(id: string): FixtureRun | null {
  return agentRuns.find((run) => run.id === id) ?? null;
}
