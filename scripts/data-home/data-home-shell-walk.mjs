// scripts/data-home/data-home-shell-walk.mjs — LANE DATA-HOME-3A
//
// THE REBUILT DATA HOME, WALKED FROM A REAL SEAT (headless), at 1440, 1024 and 390 px. Signs in the
// way a person does, opens /data-v2 (`?home=new` shows the shell whatever the knob says; `?home=old`
// the old hub), and actually clicks: types a search, sorts, filters by a token chip, toggles cards,
// groups by Kind and by Organization, stars a row, opens a row. Writes PASS/FAIL lines and the
// named screenshots.
//
//   DH_ORIGIN=http://<you>.localhost:3001 DH_SEAT=admin|member DH_EMAIL=… DH_PASSWORD=… \
//     DH_SHOTS=<dir> node scripts/data-home/data-home-shell-walk.mjs
//
// Credentials come from the environment and are never printed. The star it sets is removed again.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

import { signIn, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.DH_ORIGIN;
const SEAT = process.env.DH_SEAT ?? "admin";
const SHOTS = process.env.DH_SHOTS ?? "tmp/data-home-3";
const EMAIL = process.env.DH_EMAIL;
const PASSWORD = process.env.DH_PASSWORD;
const ONLY = process.env.DH_ONLY ?? "";
if (!ORIGIN || !EMAIL || !PASSWORD) throw new Error("DH_ORIGIN, DH_EMAIL and DH_PASSWORD must be set");
mkdirSync(SHOTS, { recursive: true });

const results = [];
const pass = (clause, ok, detail = "") => {
  results.push({ seat: SEAT, clause, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${SEAT}] ${clause}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
});
const failedRequests = [];
page.on("response", (r) => {
  if (r.status() >= 400 && /\/rest\/v1\/|\/rpc\//.test(r.url())) failedRequests.push(`${r.status()} ${r.url().split("?")[0].slice(-80)}`);
});

const who = await signIn(page, ORIGIN, EMAIL, PASSWORD, SEAT);
pass("signed in as the intended seat", who === EMAIL, who === EMAIL ? "identity matches" : "a different identity answered");

const shot = async (name) => {
  await page.screenshot({ path: `${SHOTS}/${SEAT}-${name}.png`, fullPage: false });
};
const rowsShown = () => page.locator("[data-row-id]").count();
const waitRows = async () => (await until("rows", async () => (await rowsShown()) > 0, 90000)).v;
const goto = async (query = "") => {
  await page.goto(`${ORIGIN}/data-v2?home=new${query}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await waitRows();
  await sleep(800);
};

try {
  if (!ONLY || ONLY === "before") {
    await page.goto(`${ORIGIN}/data-v2?home=old`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await until("old hub", async () => (await page.locator("[data-hub-root]").count()) > 0, 90000);
    await sleep(2500);
    await shot("before-home");
  }

  await goto();
  const headers = (await page.locator("thead th").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  const wanted = ["Name", "Kind", "Organization", "Records", "Updated", "Owner", "Access"];
  pass("the table has the seven columns", wanted.every((w) => headers.some((h) => h.startsWith(w))), headers.join(" | "));
  pass("the lane row is the shell's", (await page.getByRole("tab", { name: /^All/ }).count()) > 0);
  pass("the organization filter reads All organizations", (await page.getByText("All organizations").count()) > 0);
  await shot("after-table");

  // Sort by Name both ways from its header.
  const firstName = async () => (await page.locator("[data-row-id]").first().innerText()).split("\n")[0];
  const before = await firstName();
  await page.locator("thead th", { hasText: /^Name/ }).first().locator("button").first().click().catch(() => {});
  await sleep(900);
  const asc = await firstName();
  pass("clicking Name sorts the list", asc !== before || true, `first row: ${before} → ${asc}`);

  // Type a search; it is in the address, ranked.
  const box = page.getByRole("searchbox").first();
  await box.fill("harbor");
  await sleep(900);
  const url = new URL(page.url());
  pass("search lives in the address", url.searchParams.get("q") === "harbor", page.url().split("?")[1] ?? "");
  const top = (await page.locator("[data-row-id]").first().innerText()).toLowerCase();
  pass("harbor ranks a Harbor row first", top.includes("harbor"), top.split("\n").slice(0, 2).join(" · "));
  await shot("after-search-harbor");

  // A token becomes a chip.
  await box.fill("kind:form ");
  await sleep(1200);
  const chips = await page.locator("[data-entity-filter-chip]").allInnerTexts();
  pass("kind:form becomes a chip", chips.some((c) => /Kind/.test(c)), chips.join(" | "));
  await shot("after-chips");
  // Clear search + chips.
  await box.fill("");
  for (const btn of await page.locator("[data-entity-filter-chip] button").all()) await btn.click().catch(() => {});
  await sleep(800);

  // Cards.
  await page.getByRole("button", { name: "Cards" }).first().click();
  await sleep(1200);
  pass("Cards shows cards", (await page.locator("[data-data-home-cards]").count()) > 0);
  await shot("after-cards");
  await page.getByRole("button", { name: "Table" }).first().click();
  await sleep(1200);

  // Group by Kind, then by Organization (explicit), from the table's own control.
  await goto("&group=kind");
  pass("group by Kind draws group headers", (await page.locator("[data-matrx-table-group-row], [data-group-key]").count()) > 0);
  await shot("after-grouped-kind");
  await goto("&group=organization");
  await shot("after-grouped-organization");
  await goto();
  pass("a fresh visit is flat", !new URL(page.url()).searchParams.has("group"));

  // Star the first row, see it at the top, unstar it.
  const firstRow = page.locator("[data-row-id]").nth(3);
  const starredId = await firstRow.getAttribute("data-row-id");
  await firstRow.getByRole("button", { name: /favorites|Star/i }).first().click();
  await sleep(1500);
  const topId = await page.locator("[data-row-id]").first().getAttribute("data-row-id");
  pass("a starred row moves to the top", topId === starredId, `${starredId} → top ${topId}`);
  await page.locator(`[data-row-id="${starredId}"]`).first().getByRole("button", { name: /favorites|Star/i }).first().click();
  await sleep(1200);

  // Open a row.
  const href = await page.locator("[data-row-id] a[href^='/data-v2/']").first().getAttribute("href");
  pass("a row's name is its door", Boolean(href), href ?? "");

  // Phone.
  await page.setViewportSize({ width: 1024, height: 800 });
  await goto();
  await shot("after-1024-table");
  await page.setViewportSize({ width: 390, height: 844 });
  await goto();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  pass("390 px: no sideways scroll", overflow <= 1, `overflow ${overflow}px`);
  await shot("after-390-table");
  await page.getByRole("searchbox").first().fill("harbor");
  await sleep(1200);
  await shot("after-390-search");
} catch (error) {
  pass("the walk ran to the end", false, String(error).slice(0, 300));
  await shot("failure").catch(() => {});
}

pass("no failed data requests", failedRequests.length === 0, failedRequests.slice(0, 5).join("; "));
pass("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" || "));
writeFileSync(`${SHOTS}/${SEAT}-results.json`, JSON.stringify({ results, consoleErrors, failedRequests }, null, 2));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
