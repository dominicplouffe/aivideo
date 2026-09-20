import type { Snapshot } from "@/lib/capture/snapshot";
import type { CaptureEvent } from "@/lib/capture/types";
import { buildTour, type Tour } from "./tour";

/**
 * A sample captured session.
 *
 * Every other surface in this repository runs on fixtures so the product is
 * explorable from a fresh clone, and the interactive demo is no different.
 * These are real snapshots in the real format — self-contained markup, no
 * scripts, no field values — fed through the same `buildTour` the extension's
 * output goes through. What is fabricated is the recording, not the pipeline.
 */

const SHELL = (main: string, active: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Meridian — ${active}</title>
<style>
  :root { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; display: grid; grid-template-columns: 216px 1fr; height: 100vh; color: #101322; background: #f7f8fc; }
  nav { background: #fff; border-right: 1px solid #e6e8f0; padding: 20px 14px; }
  .logo { display: flex; align-items: center; gap: 8px; font-weight: 650; font-size: 14px; margin-bottom: 22px; }
  .logo i { width: 18px; height: 18px; border-radius: 5px; background: linear-gradient(135deg,#6e56f8,#22d3ee); display: block; }
  nav a { display: block; padding: 7px 10px; border-radius: 7px; color: #5b627a; text-decoration: none; font-size: 13px; margin-bottom: 2px; }
  nav a.on { background: #f0eeff; color: #4b34e0; font-weight: 600; }
  main { padding: 26px 30px; overflow: hidden; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  h1 { font-size: 19px; margin: 0; letter-spacing: -0.01em; }
  .btn { font: inherit; font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 8px; border: 0; cursor: pointer; color: #fff; background: linear-gradient(135deg,#6e56f8,#8b74ff); }
  .btn.ghost { background: #fff; color: #333a52; border: 1px solid #dfe2ee; }
  .card { background: #fff; border: 1px solid #e6e8f0; border-radius: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; }
  th, td { padding: 11px 14px; border-bottom: 1px solid #eef0f6; }
  th { color: #79809a; font-weight: 550; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  tr:last-child td { border-bottom: 0; }
  .pill { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; }
  .pill.live { background: #e7f8ef; color: #12764a; }
  .pill.draft { background: #fdf3e3; color: #8a5a0b; }
  label { display: block; font-size: 12px; font-weight: 600; color: #4a5170; margin: 14px 0 6px; }
  input, select { width: 100%; font: inherit; font-size: 13px; padding: 9px 11px; border-radius: 8px; border: 1px solid #dfe2ee; background: #fff; }
  .row { display: flex; gap: 14px; }
  .row > * { flex: 1; }
  .toast { margin-top: 16px; padding: 11px 14px; border-radius: 9px; background: #e7f8ef; color: #12764a; font-size: 13px; font-weight: 600; }
</style></head>
<body>
  <nav>
    <div class="logo"><i></i>Meridian</div>
    <a href="#" class="${active === "Projects" ? "on" : ""}">Projects</a>
    <a href="#" class="${active === "New project" ? "on" : ""}">New project</a>
    <a href="#">Analytics</a>
    <a href="#">Team</a>
    <a href="#">Settings</a>
  </nav>
  <main>${main}</main>
</body></html>`;

const LIST = SHELL(
  `<header><h1>Projects</h1>
     <button class="btn" data-testid="new-project">New project</button></header>
   <div class="card"><table>
     <tr><th>Name</th><th>Owner</th><th>Status</th></tr>
     <tr><td>Onboarding walkthrough</td><td>Renata Lima</td><td><span class="pill live">Live</span></td></tr>
     <tr><td>Billing tour</td><td>Daniel Okafor</td><td><span class="pill draft">Draft</span></td></tr>
     <tr><td>Admin console</td><td>Priya Raman</td><td><span class="pill live">Live</span></td></tr>
   </table></div>`,
  "Projects",
);

const FORM = SHELL(
  `<header><h1>New project</h1></header>
   <div class="card" style="padding:18px 20px;max-width:520px">
     <label for="name">Project name</label>
     <input id="name" name="name" placeholder="Onboarding walkthrough" />
     <div class="row">
       <div><label for="kit">Brand kit</label>
         <select id="kit"><option>Meridian — Primary</option></select></div>
       <div><label for="voice">Voice</label>
         <select id="voice"><option>Avery — Warm, US</option></select></div>
     </div>
     <div style="margin-top:20px;display:flex;gap:8px">
       <button class="btn" data-testid="create">Create project</button>
       <button class="btn ghost">Cancel</button>
     </div>
   </div>`,
  "New project",
);

const DONE = SHELL(
  `<header><h1>Projects</h1>
     <button class="btn" data-testid="new-project">New project</button></header>
   <div class="card"><table>
     <tr><th>Name</th><th>Owner</th><th>Status</th></tr>
     <tr><td>Q3 launch demo</td><td>Renata Lima</td><td><span class="pill draft">Draft</span></td></tr>
     <tr><td>Onboarding walkthrough</td><td>Renata Lima</td><td><span class="pill live">Live</span></td></tr>
     <tr><td>Billing tour</td><td>Daniel Okafor</td><td><span class="pill draft">Draft</span></td></tr>
   </table></div>
   <div class="toast">Project created. Recording starts when you are ready.</div>`,
  "Projects",
);

function snapshot(html: string, title: string, targetSelector?: string): Snapshot {
  return {
    html,
    url: `https://app.meridian.example/${title.toLowerCase().replace(/\s+/g, "-")}`,
    title: `Meridian — ${title}`,
    viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
    targetSelector,
    bytes: html.length,
    skipped: [],
  };
}

const EVENTS: CaptureEvent[] = [
  {
    at: 2.4,
    kind: "click",
    selector: '[data-testid="new-project"]',
    role: "button",
    accessibleName: "New project",
    // Measured against the fixture's own markup at its captured viewport,
    // not estimated — a hotspot ring beside the control it names is the
    // fastest way to make a demo look broken.
    bounds: { x: 0.8859, y: 0.0325, w: 0.0907, h: 0.0387 },
  },
  {
    at: 6.1,
    kind: "input",
    selector: "#name",
    role: "textbox",
    accessibleName: "Project name",
    redacted: true,
    bounds: { x: 0.2086, y: 0.1512, w: 0.3734, h: 0.0437 },
  },
  {
    at: 11.8,
    kind: "click",
    selector: '[data-testid="create"]',
    role: "button",
    accessibleName: "Create project",
    bounds: { x: 0.2086, y: 0.3088, w: 0.1039, h: 0.0413 },
  },
];

/** The sample tour shown wherever a workspace has not captured one yet. */
export function sampleTour(): Tour {
  return buildTour({
    // Each snapshot is the screen *at the moment of the click*, so the
    // control the viewer is asked to press is still on it. The last one is
    // the outcome, which has nothing to click and is the point of the demo.
    snapshots: [
      { snapshot: snapshot(LIST, "Projects", '[data-testid="new-project"]'), at: 2.5 },
      { snapshot: snapshot(FORM, "New project", "#name"), at: 6.2 },
      { snapshot: snapshot(FORM, "New project", '[data-testid="create"]'), at: 11.9 },
      { snapshot: snapshot(DONE, "Projects"), at: 13.4 },
    ],
    events: EVENTS,
    captions: [
      { from: 0, until: 4, text: "Start from the projects list and create a new one." },
      { from: 4, until: 9, text: "Give it a name — the brand kit and voice are already set." },
      { from: 9, until: 12.5, text: "Create it, and the project is ready to record against." },
      { from: 12.5, until: 16, text: "It appears at the top of the list, ready to record." },
    ],
  });
}
