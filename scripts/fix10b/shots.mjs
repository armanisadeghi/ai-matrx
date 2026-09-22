// FIX-10B — the headless proof pictures for VERIFIER-10 F2, F3, F5 and F6.
//
// Signed in as admin@admin.com through the login form (never a token in a URL), on this lane's
// own hostname so no other agent's session is evicted, against the shared dev server. Headless
// only: no window is ever opened on the owner's screen.
//
//   node scripts/fix10b/shots.mjs <tableId>
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, setOrganization, until, sleep } from "../lib/seat-browser.mjs";

const TABLE = process.argv[2];
const ORIGIN = "http://fix10b.localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
mkdirSync(OUT, { recursive: true });

function env(file) {
  const out = {};
  for (const line of readFileSync(resolve("/Users/armanisadeghi/code/matrx-frontend", file), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}
const E = env(".env.local");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

const who = await signIn(page, ORIGIN, E.AI_ADMIN_USERNAME || "admin@admin.com", E.AI_ADMIN_PASSWORD);
console.log(`signed in as ${who}`);
await setOrganization(page, "Rincon Plumbing Co");
console.log("organization set");

await page.goto(`${ORIGIN}/data-v2/${TABLE}?ps=100`, { waitUntil: "domcontentloaded", timeout: 120000 });
// A SKELETON SATISFIES `tbody tr`. Wait for a real dispatch ticket to be on screen.
const { v } = await until("real rows", async () =>
  page.evaluate(() => document.body.innerText.includes("RPC-T2-")), 90000);
if (!v) console.log("WARNING: no RPC-T2 row on screen — the picture may be of a loading state");
await sleep(2500);
await page.screenshot({ path: `${OUT}/fix10b-f2-f5-import-landed-and-worked-out-column.png`, fullPage: false });
console.log("shot 1: the grid after the import");

// THE WORKED-OUT COLUMN IS TO THE RIGHT. Scroll the grid itself, not the window.
await page.evaluate(() => {
  const scroller = Array.from(document.querySelectorAll("div")).find(
    (el) => el.scrollWidth > el.clientWidth + 200 && el.querySelector("table"),
  );
  if (scroller) scroller.scrollLeft = scroller.scrollWidth;
});
await sleep(1500);
const seesLabel = await page.evaluate(() => document.body.innerText.includes("TICKET LABEL"));
console.log(`shot 2: the worked-out column is ${seesLabel ? "on screen" : "NOT on screen"}`);
await page.screenshot({ path: `${OUT}/fix10b-f5-worked-out-column-shows-its-value.png` });

const text = await page.evaluate(() => document.body.innerText.slice(0, 1500));
console.log("---- what the screen says ----");
console.log(text);

await browser.close();
