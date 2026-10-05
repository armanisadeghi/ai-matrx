// scripts/assists/assists-dock-slot-walk.mjs — LANE ASSISTS-DOCK-SLOT (2026-10-01)
//
// THE ASSISTS CONTROL NEVER SITS HALF-VISIBLE OVER A LIST'S CONTROLS, walked from a real seat
// (headless) at 1440 and 390 on the data home and /agents/all. For each: the control is at full
// opacity, takes clicks, nothing interactive lies under any of its points, and where it docked
// (floating / footer / header). PASS/FAIL lines + named screenshots.
//
//   WALK_ORIGIN=http://<you>.localhost:3001 WALK_EMAIL=… WALK_PASSWORD=… WALK_SHOTS=<dir> \
//     node scripts/assists/assists-dock-slot-walk.mjs
//
// Credentials come from the environment and are never printed. Read-only: it clicks nothing.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { signIn, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN;
const EMAIL = process.env.WALK_EMAIL;
const PASSWORD = process.env.WALK_PASSWORD;
const SHOTS = process.env.WALK_SHOTS ?? "tmp/assists-dock-slot";
if (!ORIGIN || !EMAIL || !PASSWORD) throw new Error("WALK_ORIGIN, WALK_EMAIL and WALK_PASSWORD must be set");
mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const pass = (clause, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${clause}${detail ? ` — ${detail}` : ""}`);
};

const PAGES = [
  { name: "data-home", path: "/data?home=new", ready: "[data-row-id]" },
  { name: "agents-all", path: "/agents/all", ready: "[data-row-id], [data-agent-card], main a[href^='/agents/']" },
];
const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 844 },
];

const browser = await chromium.launch({ headless: true });
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    const who = await signIn(page, ORIGIN, EMAIL, PASSWORD, "admin");
    pass(`[${vp.name}] signed in as the intended seat`, who === EMAIL, who === EMAIL ? "identity matches" : "a different identity answered");
    for (const p of PAGES) {
      await page.goto(`${ORIGIN}${p.path}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      await page.waitForSelector(p.ready, { timeout: 180000 }).catch(() => {});
      await page.waitForSelector("[data-assists-dock]", { state: "attached", timeout: 60000 }).catch(() => {});
      await sleep(2500);
      const m = await page.evaluate(() => {
        const INTERACTIVE =
          'button, a[href], input, select, textarea, label, summary, [role="switch"], [role="checkbox"], [role="radio"], [role="button"], [role="tab"], [role="menuitem"], [role="link"]';
        const el = [...document.querySelectorAll("[data-assists-dock]")].find((d) => {
          const r = d.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const under = [];
        for (const x of [r.left + 2, (r.left + r.right) / 2, r.right - 2])
          for (const y of [r.top + 2, (r.top + r.bottom) / 2, r.bottom - 2]) {
            const hit = document.elementsFromPoint(x, y).find((h) => !h.closest("[data-assists-dock]"));
            const ctl = hit?.closest(INTERACTIVE);
            if (ctl) under.push((ctl.getAttribute("aria-label") || ctl.textContent || ctl.tagName).trim().slice(0, 40));
          }
        let o = 1;
        for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
        const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
        return {
          rect: [r.left, r.top, r.right, r.bottom].map(Math.round),
          slot: document.documentElement.getAttribute("data-assist-dock-slot") ?? "floating",
          yielding: el.hasAttribute("data-assist-dock-yield"),
          opacity: Math.round(o * 100) / 100,
          takesClicks: Boolean(top && el.contains(top)),
          under: [...new Set(under)],
          footer: (() => {
            const f = [...document.querySelectorAll("[data-matrx-table-footer]")].find((x) => x.getBoundingClientRect().height > 0);
            return f ? [f.getBoundingClientRect().top, f.getBoundingClientRect().bottom].map(Math.round) : null;
          })(),
          sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      const tag = `[${vp.name} ${p.name}]`;
      await page.screenshot({ path: `${SHOTS}/after-${p.name}-${vp.name}.png`, fullPage: false });
      if (!m) {
        pass(`${tag} assists control present`, false, "no visible control (no pending assists for this seat?)");
        continue;
      }
      pass(`${tag} measured`, true, JSON.stringify(m));
      pass(`${tag} full opacity, never yielding`, !m.yielding && m.opacity === 1);
      pass(`${tag} takes its own clicks`, m.takesClicks);
      pass(`${tag} nothing interactive under it`, m.under.length === 0, m.under.join(" | "));
      pass(`${tag} no sideways scroll`, m.sideways <= 0);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
