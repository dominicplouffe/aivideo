/**
 * Appearance preference: light, dark, or follow the operating system.
 *
 * The choice is a property of the device, not the account — the same person
 * wants a dark editor on a dark desktop and a light one on a light laptop —
 * so it lives in localStorage rather than on the workspace row. It is applied
 * as `data-theme` on <html>, always as the *resolved* rendering ("light" or
 * "dark"), so the stylesheet never has to reason about "system" itself.
 */

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "demoriff:theme";
const LIGHT_QUERY = "(prefers-color-scheme: light)";

export const themeOptions: { value: ThemePreference; label: string; hint: string }[] = [
  { value: "system", label: "System", hint: "Follow this device" },
  { value: "light", label: "Light", hint: "Always light" },
  { value: "dark", label: "Dark", hint: "Always dark" },
];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return window.matchMedia(LIGHT_QUERY).matches ? "light" : "dark";
}

/** Persist the choice and repaint. Storage failures (private mode) still repaint. */
export function setThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Nothing to do: the choice holds for this page view only.
  }
  document.documentElement.dataset.theme = resolveTheme(preference);
}

/**
 * Runs inline in <head> before anything paints, so a light-mode reader never
 * sees a dark flash. Kept as a string because it must not wait for React.
 * It re-reads the preference when the system setting flips (a "system"
 * user at sunset) and when another tab changes it.
 */
export const themeBootstrapScript = `(function(){
  var KEY=${JSON.stringify(THEME_STORAGE_KEY)};
  var media=window.matchMedia(${JSON.stringify(LIGHT_QUERY)});
  function preference(){
    try{var v=localStorage.getItem(KEY);return v==="light"||v==="dark"?v:"system";}catch(e){return "system";}
  }
  function apply(){
    var p=preference();
    document.documentElement.dataset.theme=p==="system"?(media.matches?"light":"dark"):p;
  }
  apply();
  media.addEventListener("change",apply);
  window.addEventListener("storage",function(e){if(e.key===KEY)apply();});
})();`;
