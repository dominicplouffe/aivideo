import type { Page } from "playwright";
import { credentialForOrigin } from "./credentials";
import { recordAction, type Run } from "./run";
import { keepEvidence } from "./evidence";

/**
 * Signing in, the way a person would, wherever the app asks.
 *
 * A modern app often loads its page and only then decides the visitor is
 * signed out and sends them to /login, so a check made the moment the
 * document arrives sees no sign-in form and moves on. This waits for the
 * page to settle, then looks. It handles the two usual shapes: email and
 * password on one screen, and email first with the password on the next.
 *
 * What it will not do is guess. A login page with no stored sign-in for its
 * exact origin stops the run with a sentence saying what to add; a page
 * that only offers "Sign in with Google" stops it with a sentence saying
 * why the agent cannot use it. Recording a demo of a login screen is worse
 * than recording nothing.
 */

export class SignInNeeded extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignInNeeded";
  }
}

const PASSWORD = 'input[type="password"]';
const IDENTIFIER =
  'input[type="email"], input[autocomplete="username"], input[autocomplete="email"], input[name*="email" i], input[name*="user" i], input[id*="email" i], input[id*="user" i]';
const LOGIN_PATH = /\/(log-?in|sign-?in|auth|session|account\/login|users\/sign_in)(\/|\?|#|$)/i;

async function visible(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).first().isVisible().catch(() => false);
}

/**
 * Waits for the page to stop moving.
 *
 * Network quiet is not enough: an app that loads, checks the session and
 * only then sends a signed-out visitor to /login goes quiet first and moves
 * afterwards. So the address has to stay the same for a second and a half
 * too, within a ceiling of about ten seconds.
 */
async function settle(page: Page, ceilingMs = 10_000): Promise<void> {
  const deadline = Date.now() + ceilingMs;
  let url = page.url();
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    await page.waitForLoadState("networkidle", { timeout: Math.max(500, Math.min(3000, deadline - Date.now())) }).catch(() => {});
    await page.waitForTimeout(250);
    if (page.url() !== url) {
      url = page.url();
      stableSince = Date.now();
      continue;
    }
    if (Date.now() - stableSince >= 1500) return;
  }
}

/** Whether the page in front of the agent is asking it to sign in. */
export async function looksLikeSignIn(page: Page): Promise<boolean> {
  await settle(page);
  if (await visible(page, PASSWORD)) return true;
  const onLoginPath = LOGIN_PATH.test(new URL(page.url()).pathname);
  if (onLoginPath) return true;
  // Email-first sign-in: an identifier field and a single continue button,
  // and nothing else of substance on the page.
  return (await visible(page, IDENTIFIER)) && (await page.locator("input:visible").count()) <= 2;
}

/** A button that signs in through somebody else, which the agent must never press. */
const THIRD_PARTY = /google|microsoft|apple|github|facebook|linkedin|okta|saml|sso|single sign/i;

/**
 * Submits the form the password (or email) field belongs to.
 *
 * Only a button inside that same form, and never one that signs in through
 * another provider: a page with "Sign in with Google" beside the form has
 * two buttons that both say "sign in", and the wrong one leaves the site.
 * With no such button, Enter in the field — which is what a form's own
 * submit does.
 */
async function submitForm(page: Page, fieldSelector: string, words: RegExp): Promise<void> {
  const field = page.locator(fieldSelector).first();
  const form = field.locator("xpath=ancestor::form[1]");
  const scope = (await form.count()) > 0 ? form : page.locator("body");
  const buttons = scope.locator('button, input[type="submit"], [role="button"]');
  const count = await buttons.count();
  let fallback: ReturnType<typeof buttons.nth> | null = null;
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    if (!(await button.isVisible().catch(() => false))) continue;
    const label = ((await button.innerText().catch(() => "")) || (await button.getAttribute("value")) || (await button.getAttribute("aria-label")) || "").trim();
    if (THIRD_PARTY.test(label)) continue;
    const type = await button.getAttribute("type");
    if (type === "submit") {
      await button.click({ timeout: 5000 }).catch(() => {});
      return;
    }
    if (!fallback && words.test(label)) fallback = button;
  }
  if (fallback) {
    await fallback.click({ timeout: 5000 }).catch(() => {});
    return;
  }
  await field.press("Enter").catch(() => {});
}

/**
 * Signs in on the page in front of it, if the page asks. Returns whether it
 * signed in. Throws SignInNeeded when the page asks and it cannot.
 */
export async function signInIfAsked(
  run: Run,
  page: Page,
  options: { startedAt: number; outlineOrdinal?: number | null; blockedCalls?: () => string[] },
): Promise<boolean> {
  if (!(await looksLikeSignIn(page))) return false;

  const origin = new URL(page.url()).origin;
  const chosen = ((run.signIns ?? {}) as Record<string, string>)[origin] ?? null;
  const credential = await credentialForOrigin(run.workspaceId, origin, chosen);
  const at = () => Date.now() - options.startedAt;
  // Every stop below carries what the page looked like and what it said.
  const stop = async (what: string, message: string): Promise<never> => {
    const seen = await keepEvidence(run, page, { outlineOrdinal: options.outlineOrdinal, startedAt: options.startedAt, what });
    throw new SignInNeeded(seen.pageText ? `${message} The page said: “${seen.pageText}”.` : message);
  };

  if (!credential) {
    await recordAction(run.id, {
      kind: "type",
      outlineOrdinal: options.outlineOrdinal ?? null,
      url: page.url(),
      target: "sign-in form",
      refusedReason: chosen ? `the chosen sign-in "${chosen}" is no longer stored` : "no sign-in chosen for this site",
      atMs: at(),
    });
    return stop(
      "sign-in",
      chosen
        ? `The app asked to sign in at ${origin}, and the sign-in this run uses ("${chosen}") has been removed. Choose another under Edit and retry.`
        : `The app asked to sign in at ${origin} and this run has no sign-in for that site. Add one under Edit and retry.`,
    );
  }

  // Email first, when the password is not on screen yet.
  if (!(await visible(page, PASSWORD))) {
    if (!(await visible(page, IDENTIFIER))) {
      return stop("sign-in", `The sign-in page at ${origin} has no email and password form the agent can use — it may only offer signing in with Google or another provider. The agent needs an account that signs in with an email and password.`);
    }
    if (credential.username) await page.locator(IDENTIFIER).first().fill(credential.username);
    await submitForm(page, IDENTIFIER, /continue|next|sign in|log in/i);
    await page.locator(PASSWORD).first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    if (!(await visible(page, PASSWORD))) {
      return stop("sign-in", `After entering the email, the sign-in page at ${origin} did not ask for a password. It may send a code or a link instead, which the agent cannot receive.`);
    }
  } else if (credential.username && (await visible(page, IDENTIFIER))) {
    await page.locator(IDENTIFIER).first().fill(credential.username);
  }

  await page.locator(PASSWORD).first().fill(credential.secret);
  await recordAction(run.id, {
    kind: "type",
    outlineOrdinal: options.outlineOrdinal ?? null,
    url: origin,
    target: "sign-in form",
    // The label and the account, never the secret.
    detail: { credential: credential.label, username: credential.username },
    atMs: at(),
  });
  await submitForm(page, PASSWORD, /sign in|log in|continue|submit/i);

  // Signed in once the password field is gone.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline && (await visible(page, PASSWORD))) await page.waitForTimeout(300);
  await settle(page);
  if (await visible(page, PASSWORD)) {
    await recordAction(run.id, {
      kind: "click",
      outlineOrdinal: options.outlineOrdinal ?? null,
      url: page.url(),
      target: "sign in",
      refusedReason: "the site did not accept the sign-in",
      atMs: at(),
    });
    // A login that posts to a service this run does not allow never reaches
    // the site at all. Said first, because it is not the password.
    const blocked = (options.blockedCalls?.() ?? []).filter((o) => o !== origin);
    if (blocked.length > 0) {
      return stop(
        "sign-in",
        `The sign-in did not go through because the page's requests to ${blocked.join(", ")} were blocked — this run does not allow them. If that is your app's own service, add it under "Also allow requests to" in Edit and retry.`,
      );
    }
    return stop("sign-in", `The site at ${origin} did not accept the stored sign-in "${credential.label}". Check the email and password under Edit and retry. If the account uses two-factor codes, the agent cannot enter them.`);
  }
  await recordAction(run.id, { kind: "click", outlineOrdinal: options.outlineOrdinal ?? null, url: page.url(), target: "sign in", atMs: at() });
  return true;
}
