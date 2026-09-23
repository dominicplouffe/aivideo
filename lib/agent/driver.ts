import type { Browser, Locator } from "playwright";
import { credentialForOrigin } from "./credentials";
import { openSession, type SessionOptions } from "./session";
import {
  ApprovalError, beginRecording, failRun, finishRecording, outlineHash, recordAction,
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
  if (run.approvedOutlineHash !== outlineHash(outline)) {
    throw new ApprovalError("The outline has changed since it was approved.");
  }

  let current = await beginRecording(run);
  const startedAt = Date.now();
  let refusals = 0;
  let completed = 0;
  const timings: StepTiming[] = [];

  const session = await openSession(options.browser, {
    allowedOrigins: current.allowedOrigins,
    viewport: options.viewport,
    recordVideo: options.recordVideo,
    resolve: options.resolve,
    onRefusal: (event) => {
      refusals += 1;
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
    },
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

        await maybeSignIn(current, session, startedAt);
      }

      if (step.action) await performAction(current, session, step, startedAt, options.stepTimeoutMs ?? 5000);

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
 * Signs in, if there is a credential for wherever the browser actually is.
 *
 * The origin comes from `page.url()`, not from the outline. A step planned
 * for `https://app.acme.com` that redirected to an identity provider is
 * exactly the case where typing the stored password would be wrong, and it
 * is also exactly the case a plan-based check would get wrong.
 *
 * The typed value never reaches the audit trail. "Signed in as sam@acme.com
 * at app.acme.com" is the useful record; the password is not part of it.
 */
async function maybeSignIn(
  run: Run,
  session: Awaited<ReturnType<typeof openSession>>,
  startedAt: number,
): Promise<void> {
  const origin = new URL(session.page.url()).origin;
  const credential = await credentialForOrigin(run.workspaceId, origin);
  if (!credential) return;

  const password = session.page.locator('input[type="password"]').first();
  if ((await password.count()) === 0) return;

  const username = session.page
    .locator('input[type="email"], input[name="username"], input[name="email"]')
    .first();

  if (credential.username && (await username.count()) > 0) {
    await username.fill(credential.username);
  }
  await password.fill(credential.secret);

  await recordAction(run.id, {
    kind: "type",
    url: origin,
    target: "sign-in form",
    // The label and the account, never the secret.
    detail: { credential: credential.label, username: credential.username },
    atMs: Date.now() - startedAt,
  });

  const submit = session.page.locator('button[type="submit"], input[type="submit"]').first();
  if ((await submit.count()) > 0) {
    await submit.click();
    await session.page.waitForLoadState("domcontentloaded").catch(() => {});
    await recordAction(run.id, {
      kind: "click",
      url: session.page.url(),
      target: "sign in",
      atMs: Date.now() - startedAt,
    });
  }
}
