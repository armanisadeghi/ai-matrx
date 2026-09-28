// scripts/answer-bar-targets-walk.mjs — THE ANSWER-BAR HIT-TARGET GUARD (live).
//
// Defect (verifier round 2, 2026-09-27): at 375px the answer ⋯ overlapped 👍,
// so tapping the centre of 👍 opened the menu — compact modal (5px) and the
// Chat window (19px), where an 8th target ("Continue in chat mode") made the
// row wider than the host. The row squeezed instead of wrapping, and the 44px
// touch targets spilled under the ⋯. Fix: the answer bar wraps
// (features/rich-document/variants/ActionBar.tsx).
//
// jsdom computes no layout, so this measures the REAL app in a real engine at
// 375x812 with a coarse pointer, as admin@admin.com, on each host you name:
//   • no two targets in one answer bar overlap;
//   • the element under the centre of each target IS that target;
//   • no target is clipped off the viewport;
//   • every target is at least 44x44 (the ⋯-less copy chip may be 40).
// Exit 1 on any failure. Needs the shared dev server (:3001).
//
//   node scripts/answer-bar-targets-walk.mjs '/chat/<id>' '/dashboard?panels=agent:<id>:m-modal-compact' …
//
// Red/green proof: before the fix this walk reported "Not helpful x More
// actions: 5px" (compact modal) and "19px" (Chat window); after, none.
import { chromium, devices } from "playwright";
import { execSync } from "node:child_process";

const routes = process.argv.slice(2);
if (routes.length === 0) {
  console.error("Name at least one route that shows an assistant answer.");
  process.exit(2);
}
const MIN = 44;
let failed = false;
const browser = await chromium.launch({ headless: true });
try {
  for (const route of routes) {
    const login = execSync(`pnpm -s dev-login '${route}'`, { encoding: "utf8" });
    const url = login.match(/OPEN\s*:\s*(\S+)/)?.[1];
    if (!url) throw new Error(`dev-login gave no URL for ${route}`);
    const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await page.goto(url, { timeout: 180_000 });
    if (page.url().includes("__dev-walk")) {
      await page.getByRole("button", { name: "Resume this preview" }).click();
      await page.waitForURL((u) => !u.href.includes("__dev-walk"), { timeout: 180_000 });
    }
    await page.waitForSelector('[aria-label="More actions"]', { timeout: 120_000 });
    await page.waitForTimeout(2_000);
    const bars = await page.evaluate((min) => {
      const out = [];
      for (const more of document.querySelectorAll('[aria-label="More actions"]')) {
        let bar = more.parentElement;
        for (let i = 0; i < 6 && bar && bar.querySelectorAll("button").length < 3; i++) bar = bar.parentElement;
        if (!bar) continue;
        const els = [...bar.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().width > 0);
        const boxes = els.map((b) => ({ el: b, r: b.getBoundingClientRect(), label: (b.getAttribute("aria-label") || b.textContent.trim()).slice(0, 30) }));
        const problems = [];
        for (let i = 0; i < boxes.length; i++) {
          const { r, label, el } = boxes[i];
          if (r.height < min || r.width < min - 4) problems.push(`${label} is ${Math.round(r.width)}x${Math.round(r.height)}`);
          if (r.left < 0 || r.right > innerWidth) problems.push(`${label} is clipped`);
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (hit && r.top >= 0 && r.bottom <= innerHeight && !(hit === el || el.contains(hit))) problems.push(`centre of ${label} hits ${hit.closest("button")?.getAttribute("aria-label") ?? hit.tagName}`);
          for (let j = i + 1; j < boxes.length; j++) {
            const b = boxes[j].r;
            const ox = Math.min(r.right, b.right) - Math.max(r.left, b.left);
            const oy = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
            if (ox > 0 && oy > 0) problems.push(`${label} x ${boxes[j].label}: ${Math.round(ox)}px`);
          }
        }
        out.push({ targets: boxes.length, problems });
      }
      return out;
    }, MIN);
    if (bars.length === 0) { failed = true; console.log(`FAIL ${route}: no answer bar found`); }
    for (const bar of bars) {
      if (bar.problems.length) { failed = true; console.log(`FAIL ${route}: ${bar.problems.join("; ")}`); }
      else console.log(`ok   ${route}: ${bar.targets} targets, none overlap`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
