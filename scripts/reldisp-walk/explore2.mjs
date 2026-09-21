import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { signIn, setOrganization, sleep } from "../lib/seat-browser.mjs";
const ORIGIN = "http://reldisp2.localhost:3001";
const OUT = "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/walk";
mkdirSync(OUT, { recursive: true });
const JOBS = "af3bfff6-a255-41e5-9ac2-879d53816163";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
await signIn(page, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD, "admin");
await setOrganization(page, "Rincon Plumbing Co");
await page.goto(`${ORIGIN}/data-v2/${JOBS}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(9000);
console.log("---- TOP OF PAGE ----");
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 700));
console.log("---- BUTTONS / CONTROLS ----");
const controls = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button,[role="button"],[role="tab"],a')).map((b) => ({
    tag: b.tagName, text: (b.textContent ?? "").trim().slice(0, 45),
    label: b.getAttribute("aria-label"), testid: b.getAttribute("data-testid"),
  })).filter((c) => c.text || c.label || c.testid).slice(0, 70));
console.table(controls);
console.log("---- IS 0.63.0 LIVE IN THE BUNDLE? ----");
// recordNameIn is a 0.63.0-only export name; look for it in the loaded chunks.
const live = await page.evaluate(async () => {
  const srcs = Array.from(document.querySelectorAll("script[src]")).map((s) => s.src);
  let hits = 0, scanned = 0;
  for (const s of srcs) {
    try { const t = await (await fetch(s)).text(); scanned += 1; if (t.includes("recordNameIn")) hits += 1; } catch {}
  }
  return { scanned, hits };
});
console.log(live);
await page.screenshot({ path: resolve(OUT, "explore2-grid.png") });
await browser.close();
