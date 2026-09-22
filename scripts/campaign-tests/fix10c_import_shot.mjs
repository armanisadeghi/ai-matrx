// FIX-10C F9 — the CSV mapping panel, in the narrow rail that clipped it.
//
// USE CASE: Rincon Plumbing Co's office manager imports Truck 1's dispatch
// backlog — job number, customer, Ventura-county service address, service type,
// scheduled date, status, crew, notes — out of the old scheduling spreadsheet.
import { chromium } from "playwright";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
const CSV =
  "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/rincon-truck1-dispatch-backlog.csv";
const b = await chromium.launch({ headless: true });
// The verifier measured this at a 1600px WINDOW, where the wizard lives in the
// right rail. 520px is that rail.
const ctx = await b.newContext({ viewport: { width: 520, height: 1100 } });
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:3005/?demo=import", { waitUntil: "networkidle", timeout: 90000 });
await p.waitForSelector('input[type=file]', { timeout: 60000 });
await p.setInputFiles('input[type=file]', CSV);
await p.waitForTimeout(4000);
await p.screenshot({ path: `${OUT}/fix10c-csv-mapping-panel.png`, fullPage: true });
const text = (await p.locator("body").innerText()).replace(/\s+/g, " ");
console.log("chose the file (named back):", text.includes("rincon-truck1-dispatch-backlog.csv"));
console.log("mapping table drawn:", await p.locator("select[aria-label^='Where ']").count());
// The defect was a select clipped to "— (": measure what the person can see.
const widths = await p.locator("select[aria-label^='Where ']").evaluateAll((els) =>
  els.map((e) => Math.round(e.getBoundingClientRect().width)),
);
console.log("goes-to select widths (px):", widths.join(", ") || "none");
console.log("narrowest:", widths.length ? Math.min(...widths) : "n/a");
console.log("page scrolls sideways rather than clipping:", await p.evaluate(() => {
  const d = document.querySelector(".overflow-x-auto");
  return d ? d.scrollWidth > d.clientWidth : false;
}));
await ctx.close();
await b.close();
