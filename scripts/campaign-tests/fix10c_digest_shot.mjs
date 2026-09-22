// FIX-10C F15 — the digest dialog's clock, and the one thing it never said.
import { chromium } from "playwright";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1100, height: 950 } });
const p = await ctx.newPage();
await p.goto("http://127.0.0.1:3005/?demo=dashboard", { waitUntil: "networkidle", timeout: 90000 });
await p.waitForTimeout(2500);
await p.getByRole("button", { name: "Send on a schedule" }).first().click();
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/fix10c-digest-schedule.png`, fullPage: true });
const text = (await p.locator("body").innerText()).replace(/\s+/g, " ");
console.log("offers the clock:", /every week|every day|every hour/.test(text));
console.log("says what silence means:", text.includes("sends nothing at all"));
console.log("says quiet hours move a send:", text.includes("Quiet hours move a send to when they end"));
console.log("the rule element is on the page:", await p.locator("[data-matrx-digest-empty-rule]").count());
await ctx.close();
await b.close();
