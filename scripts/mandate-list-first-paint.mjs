// scripts/mandate-list-first-paint.mjs — headless timing of the admin mandate list's first load.
//
// Signs in as admin@admin.com, opens /administration/mandates/list-preview cold, and prints:
//   * when the first real row painted (a tbody row with a mandate name),
//   * when the Grade cells stopped reading "Grading",
//   * every aidream report request and every mnd_admin_list / console read, start → end.
//
//   ORIGIN=http://localhost:3001 node scripts/mandate-list-first-paint.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { signIn } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://localhost:3001";
const ROUTE = process.env.ROUTE ?? "/administration/mandates/list-preview";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
if (who !== "admin@admin.com") throw new Error(`wrong seat: ${who}`);

// Warm the route's compile once (a dev-server compile is not data time) and pick
// the admin's own organization when the session has none.
await page.goto(`${ORIGIN}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
const chooser = page.getByText("Choose an organization");
await Promise.race([
  chooser.waitFor({ timeout: 240000 }),
  page.waitForSelector("tbody tr", { timeout: 240000 }),
]).catch(() => {});
if (await chooser.count()) {
  await page.getByText(process.env.ORG_NAME ?? "admin's Workspace", { exact: true }).first().click();
  await page.waitForTimeout(3000);
}
await page.waitForSelector("tbody tr", { timeout: 240000 }).catch(() => {});

let t0 = 0;
const at = () => ((performance.now() - t0) / 1000).toFixed(2);
const reqs = new Map();
const interesting = (url) =>
  /matrxserver\.com\/(mandates|api)\/|\/rpc\/|\/rest\/v1\/(mandate|mnd_)/.test(url) && !/auth\/v1/.test(url);
page.on("request", (r) => {
  if (interesting(r.url())) reqs.set(r, { url: r.url().replace(/\?.*/, ""), method: r.method(), start: at(), body: (r.postData() ?? "").slice(0, 60) });
});
page.on("requestfinished", (r) => {
  const hit = reqs.get(r);
  if (hit) hit.end = at();
});

t0 = performance.now();
await page.goto(`${ORIGIN}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
const navDone = at();
await page.waitForFunction(
  () => [...document.querySelectorAll("tbody tr")].some((tr) => tr.querySelectorAll("td").length > 3 && tr.innerText.trim().length > 10),
  null,
  { timeout: 240000, polling: 50 },
);
const firstRow = at();
const gradingAtFirstRow = await page.locator("tbody", { hasText: "Grading" }).count();
await page.waitForFunction(() => !document.querySelector("tbody")?.innerText.includes("Grading"), null, {
  timeout: 240000,
  polling: 100,
});
const gradesIn = at();
await page.waitForTimeout(1500);

console.log(`domcontentloaded ${navDone}s · first real row ${firstRow}s (grade cells still loading: ${gradingAtFirstRow > 0}) · grades filled ${gradesIn}s`);
for (const r of [...reqs.values()].sort((a, b) => a.start - b.start)) {
  console.log(`  ${r.start}→${r.end ?? "…"}s  ${r.method} ${r.url.replace(/^https?:\/\/[^/]+/, "")} ${r.body}`);
}
await browser.close();
