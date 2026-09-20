import type { Browser } from "playwright";
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
  /** Where screenshots and the capture land. Absent in a dry run. */
  onScreenshot?: (step: OutlineStep, png: Buffer) => Promise<void>;
  resolve?: (hostname: string) => Promise<string[]>;
  viewport?: SessionOptions["viewport"];
  /** Per step. A step that has not settled in this long is not going to. */
  stepTimeoutMs?: number;
}

export interface DriveResult {
  runId: string;
  status: Run["status"];
  completedSteps: number;
  refusals: number;
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

  const session = await openSession(options.browser, {
    allowedOrigins: current.allowedOrigins,
    viewport: options.viewport,
    resolve: options.resolve,
    onRefusal: (event) => {
      refusals += 1;
      // Fire and forget: a refused subresource must not be able to stall the
      // run, and the write is ordered by the ordinal rather than by arrival.
      void recordAction(current.id, {
        kind: "refused",
        url: event.url,
        refusedReason: `${event.resourceType}: ${event.reason}`,
        atMs: Date.now() - startedAt,
      });
    },
  });

  try {
    for (const step of outline) {
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

      await session.page.waitForTimeout(Math.min(2000, options.stepTimeoutMs ?? 2000));

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
    }

    current = await finishRecording(current, null);
    return { runId: current.id, status: current.status, completedSteps: completed, refusals };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    current = await failRun(current, message);
    return {
      runId: current.id,
      status: current.status,
      completedSteps: completed,
      refusals,
      error: message,
    };
  } finally {
    // Always. A context left open holds a browser process, and a browser
    // process holds whatever the run was signed into.
    await session.close();
  }
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
