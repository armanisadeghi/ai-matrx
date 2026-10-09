// scripts/scopes-tree-paged-walk.mjs — lane SCOPES-TREE-PAGED (2026-10-01).
//
// The chat lens tree on the CLONE preview, headless, one seat: how long the store's tree doors take
// as the browser sees them (request start → response end), what the lens draws first, an expand, a
// search, and screenshots. Read-only: it opens the lens and types a search, never writes.
//
//   SEAT=admin|member ORIGIN=http://<you>.localhost:3001 SEAT_PASSWORD=… node scripts/scopes-tree-paged-walk.mjs
//
// Output: /tmp/matrx-evidence/2026-09-30/scopes-tree-paged/<seat>-*.{png,json}
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { signIn, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN;
const SEAT = process.env.SEAT ?? "admin";
const LEASE = join(
  process.env.MATRX_PREVIEW_STATE_DIR ?? join(process.env.TMPDIR ?? "/tmp", `matrx-frontend-preview-${process.getuid()}`),
  "shared-next-dev.meta",
);
const MODE = existsSync(LEASE) ? (/^MODE=(\w+)$/m.exec(readFileSync(LEASE, "utf8"))?.[1] ?? "") : "";
if (!ORIGIN || !/:3001\b/.test(ORIGIN)) throw new Error("ORIGIN must be the one dev server, http://<you>.localhost:3001");
if (MODE !== "clone") throw new Error(`the dev server is in '${MODE || "no"}' mode, not clone — never walk against live`);
const SHOTS = "/tmp/matrx-evidence/2026-09-30/scopes-tree-paged";
mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const who = SEAT === "admin"
  ? { email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD }
  : { email: "test@test.com", password: process.env.SEAT_PASSWORD };
if (!who.email || !who.password) throw new Error(`no credential for seat ${SEAT}`);

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const doors = [];
page.on("requestfinished", async (req) => {
  const m = /\/rpc\/(context_tree\w*)/.exec(req.url());
  if (!m) return;
  const t = req.timing();
  const body = req.postData() ?? "";
  doors.push({ door: m[1], ms: Math.round(t.responseEnd - t.requestStart), args: body.slice(0, 120), at: Date.now() });
});
await signIn(page, ORIGIN, who.email, who.password, SEAT);
// A cold boot: no saved tree (the warm cache would skip every door).
await page.evaluate(async () => {
  for (const db of (await indexedDB.databases?.()) ?? []) if (db.name) indexedDB.deleteDatabase(db.name);
  for (const k of Object.keys(localStorage)) if (k.includes("scopesTree")) localStorage.removeItem(k);
});
doors.length = 0;
const t0 = Date.now();
await page.goto(`${ORIGIN}/chat`, { waitUntil: "domcontentloaded", timeout: 300000 });
await page.waitForLoadState("load", { timeout: 300000 }).catch(() => {});
const lens = page.locator("[data-lens-chip], button[title*='context' i], button[aria-label*='context' i]").first();
await lens.waitFor({ state: "visible", timeout: 120000 }).catch(() => {});
await lens.click().catch(() => {});
// First paint of the lens tree: the first type row (a row whose meta is a count or a dash).
const firstRows = Date.now();
let typesDrawn = null;
for (let i = 0; i < 600; i++) {
  const n = await page.locator('[role="treeitem"]').count().catch(() => 0);
  if (n > 1) { typesDrawn = Date.now() - firstRows; break; }
  await sleep(100);
}
await sleep(1500);
await page.screenshot({ path: join(SHOTS, `${SEAT}-1600-lens-first-paint.png`) });
const lensText = await page.evaluate(() => [...document.querySelectorAll('[role="treeitem"]')].slice(0, 30).map((e) => e.innerText.replace(/\s+/g, " ")).join("\n"));
// Expand the first type row of the first organization.
const typeRow = page.locator('[role="treeitem"]').nth(1);
await typeRow.click().catch(() => {});
await sleep(2500);
await page.screenshot({ path: join(SHOTS, `${SEAT}-1600-lens-expand.png`) });
const expandText = await page.evaluate(() => [...document.querySelectorAll('[role="treeitem"]')].slice(0, 40).map((e) => e.innerText.replace(/\s+/g, " ")).join("\n"));
// Search.
const input = page.locator('[role="dialog"] input, [data-radix-popper-content-wrapper] input').first();
await input.fill("clinic").catch(() => {});
await sleep(3000);
await page.screenshot({ path: join(SHOTS, `${SEAT}-1600-lens-search.png`) });
const searchText = await page.evaluate(() => [...document.querySelectorAll('[role="treeitem"]')].slice(0, 20).map((e) => e.innerText.replace(/\s+/g, " ")).join("\n"));
await sleep(8000); // let the idle whole-tree fill land
const out = { seat: SEAT, origin: ORIGIN, nav_to_lens_ms: firstRows - t0, lens_types_drawn_ms_after_open: typesDrawn,
  doors: doors.map((d) => ({ ...d, at: d.at - t0 })), lensText, expandText, searchText, finished: new Date().toISOString() };
writeFileSync(join(SHOTS, `${SEAT}-1600-walk.json`), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ seat: SEAT, typesDrawn, doors: out.doors.map((d) => `${d.door} ${d.ms}ms @${d.at}`) }, null, 1));
await browser.close();
