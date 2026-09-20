/**
 * The page-world helper.
 *
 * A content script runs in an isolated world: same DOM, different JavaScript
 * objects. That is a good default — it keeps the recorder from colliding
 * with the customer's own code — but it makes one thing impossible. Patching
 * `history.pushState` in the isolated world produces a patched copy that
 * nothing calls, and every single-page route change goes unrecorded. The
 * video then shows a click, and then, with no explanation, a different
 * screen, and the generated guide loses its chapter boundaries.
 *
 * So this runs in the page's own world, and does the least it possibly can:
 * patch two functions, announce route changes as a DOM event — which *does*
 * cross the boundary — and put everything back when asked.
 *
 * It is injected on demand rather than declared in the manifest, so a tab
 * that is not being recorded is never touched.
 */

const ROUTE_EVENT = "demoriff:route";
const DISARM_EVENT = "demoriff:disarm";
const FLAG = "__demoriffRouteHook";

type Hooked = typeof globalThis & { [FLAG]?: boolean };

(function install() {
  const scope = globalThis as Hooked;
  // Re-arming the same tab must not stack a second patch on the first.
  if (scope[FLAG]) return;
  scope[FLAG] = true;

  const announce = () =>
    document.dispatchEvent(
      new CustomEvent(ROUTE_EVENT, { detail: { url: location.href } }),
    );

  const originalPush = history.pushState;
  const originalReplace = history.replaceState;

  history.pushState = function (this: History, ...args: Parameters<History["pushState"]>) {
    const result = originalPush.apply(this, args);
    announce();
    return result;
  };
  history.replaceState = function (this: History, ...args: Parameters<History["replaceState"]>) {
    const result = originalReplace.apply(this, args);
    announce();
    return result;
  };

  const popstate = () => announce();
  window.addEventListener("popstate", popstate);

  document.addEventListener(
    DISARM_EVENT,
    () => {
      history.pushState = originalPush;
      history.replaceState = originalReplace;
      window.removeEventListener("popstate", popstate);
      delete scope[FLAG];
    },
    { once: true },
  );
})();
