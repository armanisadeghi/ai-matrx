import { chromium } from "playwright";
import { CASES, ORIGIN, signIn, shot } from "./walk.mjs";
const T = CASES.portal;
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 1680, height: 1020 } })).newPage();
await signIn(p, "/data-v2");
await p.goto(`${ORIGIN}/data-v2/${T.table}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await p.waitForTimeout(9000);
const info = await p.evaluate(() => ({
  searchBoxes: Array.from(document.querySelectorAll('input[type=text],input[type=search],input:not([type])'))
    .map((i) => i.getAttribute("placeholder") || i.getAttribute("aria-label") || "(none)"),
  rincon: Array.from(document.querySelectorAll("button[role=option]"))
    .filter((b) => /rincon/i.test(b.textContent || ""))
    .filter((b) => !/Branch/.test(b.textContent || "")).slice(0, 4)
    .map((b) => ({
      visible: b.getClientRects().length > 0,
      spans: Array.from(b.querySelectorAll("span")).map((s) => (s.textContent || "").trim()),
    })),
  totalOrgButtons: Array.from(document.querySelectorAll('button[role=option]')).length,
}));
console.log(JSON.stringify(info, null, 2));
await shot(p, "probe-booking-org");
await b.close();
