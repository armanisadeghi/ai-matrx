// scripts/mandate-list-first-paint.mjs — headless timing of the admin mandate list's first load.
//
// Signs in as admin@admin.com, opens /administration/intelligence/mandates cold, and prints:
//   * when the first real row painted (a mandate key shows under the grid header),
//   * when the Grade cells stopped reading "Grading",
//   * every aidream report request and every mnd_admin_list / console read, start → end.
//
//   ORIGIN=http://localhost:3001 node scripts/mandate-list-first-paint.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { signIn } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://localhost:3001";
const ROUTE = process.env.ROUTE ?? "/administration/intelligence/mandates";
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
  page.waitForFunction(() => /\tACTIONS[\s\S]*?\n[a-z0-9_]+\.[a-z0-9_.]+\n/.test(document.body.innerText), null, { timeout: 240000 }),
]).catch(() => {});
const dismiss = page.getByRole("button", { name: "Dismiss for today" });
if (await dismiss.count()) await dismiss.first().click().catch(() => {});
if (await chooser.count()) {
  await page
    .getByText(process.env.ORG_NAME ?? "admin's Workspace", { exact: true })
    .locator("visible=true")
    .first()
    .click();
  await page.waitForTimeout(3000);
}
await page.waitForFunction(() => /\tACTIONS[\s\S]*?\n[a-z0-9_]+\.[a-z0-9_.]+\n/.test(document.body.innerText), null, { timeout: 240000 }).catch(() => {});
// Let the warm-up's own report reads finish so none of them is timed below.
await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 10000));

let t0 = 0;
const at = () => ((performance.now() - t0) / 1000).toFixed(2);
const reqs = new Map();
const interesting = (url) =>
  (/matrxserver\.com\/(mandates|api)\/|\/rpc\/mnd_|\/rest\/v1\/(definition|binding|definition_version)\b/.test(url) ||
    /\/rest\/v1\/rpc\/(mnd_|agx_)/.test(url)) && !/auth\/v1/.test(url);
page.on("request", (r) => {
  if (interesting(r.url())) reqs.set(r, { url: r.url().replace(/\?.*/, ""), method: r.method(), start: at(), body: (r.postData() ?? "").slice(0, 60) });
});
page.on("requestfinished", (r) => {
  const hit = reqs.get(r);
  if (hit) hit.end = at();
});

const printRequests = () => {
  for (const r of [...reqs.values()].sort((a, b) => a.start - b.start)) {
    console.log(`  ${r.start}→${r.end ?? "…"}s  ${r.method} ${r.url.replace(/^https?:\/\/[^/]+/, "")} ${r.body}`);
  }
};
const report = (line) => console.log(line);
try {
t0 = performance.now();
await page.goto(`${ORIGIN}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
const navDone = at();
await page.waitForFunction(
  // Rows are on screen: the pager counts them and a real mandate key is visible.
  () => /\tACTIONS[\s\S]*?\n[a-z0-9_]+\.[a-z0-9_.]+\n/.test(document.body.innerText),
  null,
  { timeout: 120000, polling: 50 },
);
const firstRow = at();
console.log(`first real row at ${firstRow}s`);
// Cells whose report has not landed say so: "Grading" (impact) and "Checking" (code truth, coverage).
const pendingText = () =>
  page.evaluate(() =>
    document.body.innerText.split("\tACTIONS")[1] ?? "",
  );
const atFirstRow = await pendingText();
const pendingAtFirstRow = ["Grading", "Checking…"].filter((word) =>
  atFirstRow.split("\n").some((line) => line.trim() === word),
);
await page.waitForFunction(
  () => {
    const text = document.body.innerText.split("\tACTIONS")[1] ?? "";
    return text.length > 0 && !/(^|\n)\s*(Grading|Checking…)\s*(\n|$)/.test(text);
  },
  null,
  {
  timeout: 240000,
  polling: 100,
});
const gradesIn = at();
await page.waitForTimeout(1500);

report(`domcontentloaded ${navDone}s · first real row ${firstRow}s (cells still reading at that moment: ${pendingAtFirstRow.join(", ") || "none"}) · every report cell filled ${gradesIn}s`);
  printRequests();
} catch (error) {
  console.log(`FAILED at ${at()}s: ${String(error).split("\n")[0]}`);
  const tail = await page.evaluate(() => document.body.innerText.split("\tACTIONS")[1] ?? "");
  const stuck = tail.split("\n").map((l) => l.trim()).filter((l) => l === "Grading" || l === "Checking…");
  console.log(`still-reading cells: ${stuck.length} ${JSON.stringify(stuck.slice(0, 5))}`);
  await page.screenshot({ path: process.env.SHOT ?? "/tmp/mandate-list-first-paint-failure.png" }).catch(() => {});
  printRequests();
  if (process.env.DEBUG_TEXT) {
    console.log(await page.evaluate(() => JSON.stringify(document.body.innerText.slice(0, 1500))));
  }
}
await browser.close();
