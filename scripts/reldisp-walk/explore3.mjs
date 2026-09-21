import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
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

const live = await page.evaluate(async () => {
  const srcs = Array.from(document.querySelectorAll("script[src]")).map((s) => s.src);
  let hits = [], scanned = 0;
  for (const s of srcs) {
    try { const t = await (await fetch(s)).text(); scanned += 1;
      if (t.includes("recordNameIn")) hits.push("recordNameIn");
      if (t.includes("relation_words_many")) hits.push("relation_words_many");
      if (t.includes("Show different columns, or more than one")) hits.push("builderCopy");
    } catch {}
  }
  return { scanned, hits: [...new Set(hits)] };
});
console.log("BUNDLE LIVENESS:", JSON.stringify(live));

// Click the table toolbar's Settings (not the nav link).
const opened = await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button")).find((x) => (x.textContent ?? "").trim() === "Settings");
  if (!b) return false; b.scrollIntoView({block:"center"}); b.click(); return true;
});
console.log("clicked table Settings:", opened);
await sleep(3500);
await page.screenshot({ path: resolve(OUT, "explore3-settings.png") });
console.log("---- SETTINGS PANEL TEXT ----");
console.log((await page.evaluate(() => document.body.innerText)).split("All records")[1]?.slice(0, 1200) ?? "(none)");
console.log("---- CONTROLS AFTER SETTINGS ----");
console.table(await page.evaluate(() => Array.from(document.querySelectorAll('button,[role="button"]'))
  .map((b)=>({text:(b.textContent??"").trim().slice(0,40), label:b.getAttribute("aria-label")}))
  .filter((c)=>/customer|field|edit|Customer/i.test(c.text+" "+(c.label??""))).slice(0,30)));
await browser.close();
