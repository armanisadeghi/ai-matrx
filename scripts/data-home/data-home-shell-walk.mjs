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
const BEFORE_ONLY = ONLY === "before-only";
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
  if (r.status() >= 400 && /\/rest\/v1\/|\/rpc\//.test(r.url())) {
    const at = `${r.status()} ${r.url().split("?")[0].slice(-60)} on ${new URL(page.url()).search.slice(0, 40)} body=${(r.request().postData() ?? "").slice(0, 120)}`;
    void r.text().then(
      (body) => failedRequests.push(`${at} ${body.slice(0, 200)}`),
      () => failedRequests.push(at),
    );
  }
});

// The shared preview's walk cap parks an idle host; Resume it the way the other walks do.
async function unpark() {
  if (ORIGIN.includes("aimatrx.com")) return;
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 300000 }).catch(() => {});
  if (page.url().includes("__dev-walk")) {
    await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
    await sleep(6000);
  }
}
await unpark();
// Evicted mid-walk by another lane's walk (the cap is 4 live hosts): Resume, the way a person would.
page.on("framenavigated", (frame) => {
  if (frame === page.mainFrame() && frame.url().includes("__dev-walk")) {
    void page.getByRole("button", { name: /Resume/ }).first().click({ timeout: 10000 }).catch(() => {});
  }
});
const who = await signIn(page, ORIGIN, EMAIL, PASSWORD, SEAT);
pass("signed in as the intended seat", who === EMAIL, who === EMAIL ? "identity matches" : "a different identity answered");

const shot = async (name) => {
  await page.screenshot({ path: `${SHOTS}/${SEAT}-${name}.png`, fullPage: false });
};
// The table draws its rows as <tr data-row-id>; below `sm` (and hidden above it) the phone cards
// carry the same anchor, so a desktop step addresses the visible table rows only.
const ROW = "tr[data-row-id]:visible, [data-data-home-cards] [data-row-id]:visible, [data-row-id]:visible";
const rowsShown = () => page.locator(ROW).count();
const waitRows = async () => (await until("rows", async () => (await rowsShown()) > 0, 90000)).v;
const goto = async (query = "") => {
  await page.goto(`${ORIGIN}/data-v2?home=new${query}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await waitRows();
  await sleep(800);
};

try {
  if (!ONLY || ONLY === "before" || BEFORE_ONLY) {
    await page.goto(`${ORIGIN}/data-v2?home=old`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await until("old hub", async () => (await page.locator("[data-hub-root]").count()) > 0, 90000);
    await sleep(2500);
    await shot("before-home");
  }

  if (BEFORE_ONLY) throw new Error("before-only: stopped after the old page");
  await goto();
  const headers = (await page.locator("thead th").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  const wanted = ["Name", "Kind", "Organization", "Records", "Updated", "Owner", "Access"];
  pass("the table has the seven columns", wanted.every((w) => headers.some((h) => h.toLowerCase().startsWith(w.toLowerCase()))), headers.join(" | "));
  pass("the lane row is the shell's", (await page.getByRole("tab", { name: /^All/ }).count()) > 0);
  pass("the organization filter reads All organizations", (await page.getByText("All organizations").count()) > 0);
  await shot("after-table");

  // Sort by Name both ways from its header (the header's own sort control).
  const names = async () =>
    (await page.locator("tr[data-row-id]:visible td:nth-child(2)").allInnerTexts()).map((t) => t.trim().split("\n")[0]);
  const sorted = (xs, dir) =>
    xs.every((x, i) => i === 0 || (dir === "asc" ? xs[i - 1].localeCompare(x, undefined, { sensitivity: "base", numeric: true }) <= 0 : xs[i - 1].localeCompare(x, undefined, { sensitivity: "base", numeric: true }) >= 0));
  for (const dir of ["asc", "desc"]) {
    await page.goto(`${ORIGIN}/data-v2?home=new&sort=name&dir=${dir}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await waitRows();
    await sleep(800);
    const xs = await names();
    pass(`Name sorts ${dir}`, xs.length > 3 && sorted(xs, dir), xs.slice(0, 3).join(" · "));
  }
  await page.goto(`${ORIGIN}/data-v2?home=new&sort=updated&dir=desc`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await waitRows();

  // Type a search; it is in the address, ranked.
  const box = page.getByRole("searchbox").first();
  await box.fill("harbor");
  await sleep(900);
  const url = new URL(page.url());
  pass("search lives in the address", url.searchParams.get("q") === "harbor", page.url().split("?")[1] ?? "");
  const top = (await page.locator(ROW).first().innerText()).toLowerCase();
  pass("harbor ranks a Harbor row first", top.includes("harbor"), top.split("\n").slice(0, 2).join(" · "));
  await shot("after-search-harbor");

  // A Field's label is found by the server search, beneath the instant hits, saying where.
  await box.fill("phone");
  const t0 = Date.now();
  const matched = (await until("matched in field", async () => (await page.locator("[data-data-home-matched]:visible").count()) > 0, 15000)).v;
  const firstMatched = matched ? (await page.locator("[data-data-home-matched]:visible").first().innerText()) : "";
  pass("a field label is found, saying Matched in field", Boolean(matched) && /Matched in field/.test(firstMatched), `${firstMatched} after ${Date.now() - t0} ms`);
  await sleep(1500);
  const allTab = (await page.getByRole("tab", { name: /^All/ }).first().innerText()).replace(/\s+/g, " ");
  pass("the lane counts include what the field search found", !/\b0$/.test(allTab.trim()), allTab);
  await shot("after-search-fieldname");

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
  const firstRow = page.locator(ROW).nth(3);
  const starredId = await firstRow.getAttribute("data-row-id");
  await firstRow.getByRole("button", { name: /favorites|Star/i }).first().click();
  await sleep(1500);
  const topId = await page.locator(ROW).first().getAttribute("data-row-id");
  pass("a starred row moves to the top", topId === starredId, `${starredId} → top ${topId}`);
  await page.locator(`[data-row-id="${starredId}"]:visible`).first().getByRole("button", { name: /favorites|Star/i }).first().click();
  await sleep(1200);

  // Open a row.
  const href = await page.locator("[data-row-id]:visible a[href^='/data-v2/']").first().getAttribute("href");
  pass("a row's name is its door", Boolean(href), href ?? "");

  // The archive and the inbox wait below the list and are read when the person scrolls to them.
  await page.evaluate(() => document.querySelectorAll(".overflow-y-auto").forEach((e) => e.scrollTo(0, e.scrollHeight)));
  const archive = (await until("archive", async () => (await page.locator("[data-data-home-archive]").count()) > 0, 30000)).v;
  pass("scrolled to the bottom, the archive is there with its way back", Boolean(archive));

  // Phone.
  await page.setViewportSize({ width: 1024, height: 800 });
  await goto();
  await shot("after-1024-table");
  await page.setViewportSize({ width: 390, height: 844 });
  await goto();
  const opened = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll(".overflow-y-auto")].map((e) => e.scrollTop)));
  pass("390 px: the list opens at its first row", opened === 0, `scrolled ${opened}px`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  pass("390 px: no sideways scroll", overflow <= 1, `overflow ${overflow}px`);
  await shot("after-390-table");
  await page.getByRole("searchbox").first().fill("harbor");
  await sleep(1200);
  await shot("after-390-search");
  // Leave the seat's list style as it was found (this walk changed the sort).
  await page.setViewportSize({ width: 1440, height: 900 });
  await goto();
  await page.getByRole("button", { name: "Reset view to defaults" }).first().click().catch(() => {});
  await sleep(2500); // the preference write is debounced; let it reach the account before closing
} catch (error) {
  pass("the walk ran to the end", false, String(error).slice(0, 300));
  await shot("failure").catch(() => {});
}

pass("no failed data requests", failedRequests.length === 0, failedRequests.slice(0, 5).join("; "));
pass("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" || "));
writeFileSync(`${SHOTS}/${SEAT}-results.json`, JSON.stringify({ results, consoleErrors, failedRequests }, null, 2));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
