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

const dump = async (tag) => {
  await page.screenshot({ path: resolve(OUT, `x4-${tag}.png`) });
  const t = await page.evaluate(() => document.body.innerText);
  console.log(`---- ${tag} :: does the builder's copy appear on screen? ----`);
  console.log("  'Show different columns':", t.includes("Show different columns"));
  console.log("  'The table it points at':", t.includes("The table it points at"));
  console.log("  'Shown as':", t.includes("Shown as"));
  console.log("  'It will read':", t.includes("It will read"));
  const idx = t.indexOf("Shown as") >= 0 ? t.indexOf("Shown as") : t.indexOf("Show different columns");
  if (idx >= 0) console.log("  CONTEXT:", JSON.stringify(t.slice(Math.max(0,idx-400), idx+500)));
};

// The column header "Customer" — the grid's own per-column entry point.
console.log("clicking the Customer column header…");
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll("button")).find((x) => (x.textContent ?? "").trim() === "Customer");
  b?.scrollIntoView({ block: "center" }); b?.click();
});
await sleep(3000);
await dump("after-header-click");
console.log("CONTROLS NOW:");
console.table(await page.evaluate(() => Array.from(document.querySelectorAll('button,[role="menuitem"],[role="option"]'))
  .map((b)=>({text:(b.textContent??"").trim().slice(0,40), label:b.getAttribute("aria-label")}))
  .filter((c)=>c.text && !/^(who\?|—)$/.test(c.text)).slice(0,40)));
await browser.close();
