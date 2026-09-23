import type { Browser, Locator } from "playwright";
import { signInIfAsked } from "./signin";
import { keepEvidence } from "./evidence";
import { openSession, type SessionOptions } from "./session";
import {
  ApprovalError, beginRecording, failRun, finishRecording, runHash, recordAction,
  type OutlineStep, type Run,
} from "./run";

/**
 * Executing an approved outline.
 *
 * Everything dangerous about an agent is in this file, so it is deliberately
 * dull: it walks a fixed list of approved steps, and it cannot do anything
 * that is not on that list. There is no loop that asks a model what to do
 * next, because a plan a person approved and a plan a model is improvising
 * are different products, and only one of them can be put in front of a
 * security review.
 *
 * Three refusals are unconditional:
 *
 *  - **An unapproved run does not start.** Checked in `beginRecording`
 *    against the approval hash, not the status flag.
 *  - **An origin off the list is never reached**, and the attempt is logged.
 *  - **A credential is only ever typed into the origin it was stored for**,
 *    read from the page's *current* origin rather than the one the plan
 *    expected. Those differ exactly when it matters.
 */

export interface DriveOptions {
  browser: Browser;
  /** Where screenshots land. Absent in a dry run. */
  onScreenshot?: (step: OutlineStep, png: Buffer) => Promise<void>;
  /** Record the session to a video in this directory. Absent in a dry run. */
  recordVideo?: { dir: string };
  resolve?: (hostname: string) => Promise<string[]>;
  viewport?: SessionOptions["viewport"];
  /** Per step. A step that has not settled in this long is not going to. */
  stepTimeoutMs?: number;
  /**
   * How long a step stays on screen after its action, so the footage has
   * room for its narration. The retimer holds still footage as needed; this
   * only keeps a step from being a flash.
   */
  dwellMs?: number;
  /**
   * Called when the browser work is done and the video is written, before
   * the run is marked recorded. What it returns is stored on the run.
   */
  finalize?: (produced: {
    run: Run;
    videoPath: string | null;
    steps: StepTiming[];
  }) => Promise<{ recordingId: string | null; projectId?: string | null } | null>;
}

/** When a step was on screen, in milliseconds from the start of the recording. */
export interface StepTiming {
  ordinal: number;
  startMs: number;
  endMs: number;
}

export interface DriveResult {
  runId: string;
  status: Run["status"];
  completedSteps: number;
  refusals: number;
  /** Where each step sat in the video. Empty when the run failed early. */
  steps: StepTiming[];
  videoPath: string | null;
  projectId?: string | null;
  error?: string;
}

export async function driveRun(run: Run, options: DriveOptions): Promise<DriveResult> {
  const outline = (run.outline ?? []) as OutlineStep[];

  // Not a formality. The status says a transition happened; the hash says
  // that what was approved is what is about to run.
  if (run.approvedOutlineHash !== runHash(run)) {
    throw new ApprovalError("The outline has changed since it was approved.");
  }

  let current = await beginRecording(run);
  const startedAt = Date.now();
  let refusals = 0;
  let completed = 0;
  const timings: StepTiming[] = [];

  // Hosts the pages tried to call and could not, most recent last, so a
  // failed sign-in can say which one it was rather than blame the password.
  const blockedCalls: string[] = [];
  const onRefusal = (event: { url: string; reason: string; resourceType: string }) => {
    refusals += 1;
    if (["xhr", "fetch", "document"].includes(event.resourceType)) {
      try {
        const origin = new URL(event.url).origin;
        if (!blockedCalls.includes(origin)) blockedCalls.push(origin);
      } catch {
        // Not a URL worth naming.
      }
    }
    // Not awaited: a refused subresource must not be able to stall the
    // run. recordAction queues the writes per run, so they keep their order.
    recordAction(current.id, {
      kind: "refused",
      url: event.url,
      refusedReason: `${event.resourceType}: ${event.reason}`,
      atMs: Date.now() - startedAt,
    }).catch((error) => {
      // A trail line that could not be written must not take the whole
      // worker down with it; the refusal itself already happened.
      console.error(`[agent] could not record a refusal for ${current.id}:`, error);
    });
  };

  // Signed in first, off camera: a demo that opens on a login screen, with
  // the account's email being typed, is not the demo anybody asked for.
  let storageState: SessionOptions["storageState"];
  try {
    storageState = await signInOffCamera(current, options, startedAt, onRefusal, () => blockedCalls);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    current = await failRun(current, message);
    return { runId: current.id, status: current.status, completedSteps: 0, refusals, steps: [], videoPath: null, error: message };
  }

  const session = await openSession(options.browser, {
    allowedOrigins: current.allowedOrigins,
    requestOrigins: current.requestOrigins ?? [],
    viewport: options.viewport,
    recordVideo: options.recordVideo,
    storageState,
    resolve: options.resolve,
    onRefusal,
  });

  let closed: { videoPath: string | null } | null = null;
  try {
    for (const step of outline) {
      const stepStart = Date.now() - startedAt;
      if (step.url) {
        const verdict = await session.goto(step.url);
        if (!verdict.ok) {
          // A step that cannot be reached ends the run. Carrying on would
          // produce a recording that does not match the approved plan, which
          // is worse than no recording.
          await recordAction(current.id, {
            kind: "navigate",
            outlineOrdinal: step.ordinal,
            url: step.url,
            refusedReason: verdict.message,
            atMs: Date.now() - startedAt,
          });
          current = await failRun(current, verdict.message);
          return {
            runId: current.id,
            status: current.status,
            completedSteps: completed,
            refusals,
            steps: timings,
            videoPath: null,
            error: verdict.message,
          };
        }

        await recordAction(current.id, {
          kind: "navigate",
          outlineOrdinal: step.ordinal,
          url: session.page.url(),
          atMs: Date.now() - startedAt,
        });

        // The app may still ask, on camera: a session that expired, or a
        // page behind a second login. Signed in there too, or stopped.
        if (await signInIfAsked(current, session.page, { startedAt, outlineOrdinal: step.ordinal, blockedCalls: () => blockedCalls })) {
          await session.goto(step.url);
        }
      }

      if (step.action) {
        await performAction(current, session, step, startedAt, options.stepTimeoutMs ?? 5000);
        await signInIfAsked(current, session.page, { startedAt, outlineOrdinal: step.ordinal, blockedCalls: () => blockedCalls });
      }

      // Long enough on screen for the step's narration to be read at a
      // speaking pace, so the footage rarely needs holding. A step with no
      // narration still gets a beat.
      await session.page.waitForTimeout(options.dwellMs ?? dwellFor(step));

      if (options.onScreenshot) {
        const png = await session.page.screenshot({ type: "png" });
        await options.onScreenshot(step, png);
        await recordAction(current.id, {
          kind: "screenshot",
          outlineOrdinal: step.ordinal,
          url: session.page.url(),
          detail: { bytes: png.byteLength },
          atMs: Date.now() - startedAt,
        });
      }

      completed += 1;
      timings.push({ ordinal: step.ordinal, startMs: stepStart, endMs: Date.now() - startedAt });
    }

    // The browser closes before the video is read: Playwright finishes the
    // file when the context goes.
    closed = await session.close();
    const produced = options.finalize
      ? await options.finalize({ run: current, videoPath: closed.videoPath, steps: timings })
      : null;

    current = await finishRecording(current, produced);
    return {
      runId: current.id,
      status: current.status,
      completedSteps: completed,
      refusals,
      steps: timings,
      videoPath: closed.videoPath,
      projectId: produced?.projectId ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    current = await failRun(current, message);
    return {
      runId: current.id,
      status: current.status,
      completedSteps: completed,
      refusals,
      steps: timings,
      videoPath: closed?.videoPath ?? null,
      error: message,
    };
  } finally {
    // Always. A context left open holds a browser process, and a browser
    // process holds whatever the run was signed into.
    if (!closed) await session.close().catch(() => {});
  }
}

/** Screen time for a step: its narration at about 2.6 words a second, plus a beat, at least 2.5 s. */
export function dwellFor(step: OutlineStep): number {
  const words = (step.narration ?? "").split(/\s+/).filter(Boolean).length;
  return Math.max(2500, Math.round((words / 2.6) * 1000) + 800);
}

/**
 * The one action a step carries, done the way the approver read it.
 *
 * A control is found by what a person sees: a button, link or tab by its
 * text, a field by its label or placeholder. Nothing is guessed from the
 * page's structure. A control that is not there is written to the trail
 * and the run goes on: a missing button is a stale plan, not a breach, and
 * the footage still shows the page the step was about.
 */
async function performAction(
  run: Run,
  session: Awaited<ReturnType<typeof openSession>>,
  step: OutlineStep,
  startedAt: number,
  timeoutMs: number,
): Promise<void> {
  const action = step.action!;
  const page = session.page;
  const base = { outlineOrdinal: step.ordinal, url: page.url(), target: action.target };
  try {
    if (action.kind === "click") {
      const candidates = [
        page.getByRole("button", { name: action.target, exact: false }),
        page.getByRole("link", { name: action.target, exact: false }),
        page.getByRole("tab", { name: action.target, exact: false }),
        page.getByRole("menuitem", { name: action.target, exact: false }),
        page.getByText(action.target, { exact: false }),
      ];
      const found = await firstVisible(candidates, timeoutMs);
      if (!found) {
        await recordAction(run.id, { kind: "click", ...base, refusedReason: "not found on the page", atMs: Date.now() - startedAt });
        await keepEvidence(run, page, { outlineOrdinal: step.ordinal, startedAt, what: `looking for “${action.target}”` });
        return;
      }
      await found.click({ timeout: timeoutMs });
      await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => {});
      await recordAction(run.id, { kind: "click", ...base, url: page.url(), atMs: Date.now() - startedAt });
    } else {
      const candidates = [
        page.getByLabel(action.target, { exact: false }),
        page.getByPlaceholder(action.target, { exact: false }),
        page.getByRole("textbox", { name: action.target, exact: false }),
      ];
      const found = await firstVisible(candidates, timeoutMs);
      if (!found) {
        await recordAction(run.id, { kind: "type", ...base, refusedReason: "not found on the page", atMs: Date.now() - startedAt });
        await keepEvidence(run, page, { outlineOrdinal: step.ordinal, startedAt, what: `looking for “${action.target}”` });
        return;
      }
      // Typed at a human pace, so the footage shows the field filling in.
      await found.click({ timeout: timeoutMs });
      await found.pressSequentially(action.value, { delay: 45, timeout: timeoutMs + action.value.length * 60 });
      await recordAction(run.id, { kind: "type", ...base, detail: { value: action.value }, atMs: Date.now() - startedAt });
    }
  } catch (error) {
    await recordAction(run.id, {
      kind: action.kind === "click" ? "click" : "type",
      ...base,
      refusedReason: `did not complete: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      atMs: Date.now() - startedAt,
    });
  }
}

/** The first of several ways of naming a control that is actually on the page. */
async function firstVisible(candidates: Locator[], timeoutMs: number): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;
  do {
    for (const candidate of candidates) {
      const first = candidate.first();
      if (await first.isVisible().catch(() => false)) return first;
    }
    await new Promise((r) => setTimeout(r, 200));
  } while (Date.now() < deadline);
  return null;
}

/**
 * Opens a browser that is not recorded, goes where the run starts, and
 * signs in if the app asks. Returns the resulting cookies and storage for
 * the recording session, or nothing when no sign-in was needed.
 */
async function signInOffCamera(
  run: Run,
  options: DriveOptions,
  startedAt: number,
  onRefusal: SessionOptions["onRefusal"],
  blockedCalls: () => string[],
): Promise<SessionOptions["storageState"]> {
  const outline = (run.outline ?? []) as OutlineStep[];
  const entry = outline.find((step) => step.url)?.url ?? run.allowedOrigins[0];
  if (!entry || entry.includes("*")) return undefined;
  const preflight = await openSession(options.browser, {
    allowedOrigins: run.allowedOrigins,
    requestOrigins: run.requestOrigins ?? [],
    viewport: options.viewport,
    resolve: options.resolve,
    onRefusal,
  });
  try {
    const verdict = await preflight.goto(entry);
    if (!verdict.ok) return undefined;
    const signedIn = await signInIfAsked(run, preflight.page, { startedAt, blockedCalls });
    return signedIn ? await preflight.context.storageState() : undefined;
  } finally {
    await preflight.close().catch(() => {});
  }
}
