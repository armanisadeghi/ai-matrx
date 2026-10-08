// scripts/org-filter/variables-picker-seat-walk.mjs — LANE ORG-FILTER-CLASS
//
// THE AGENT BUILDER'S "FILL AUTOMATICALLY → FROM MY DATA" TABLE PICKER, WALKED FROM A REAL SEAT
// (headless, on the CLONE preview — the walk writes a draft variable to the seat's own agent).
//
// Proves: the Table list holds as many tables as the data home's door answers for the seat (not
// platform-owned); the organization filter reads "All organizations"; a table from an
// organization OTHER than the one the seat works in can be chosen and its preview reads rows.
//
//   VP_ORIGIN=http://<session>.localhost:3001 VP_EMAIL=… VP_PASSWORD=… VP_AGENT=<agent id>
//   VP_EXPECT=<data home non-kept count> VP_OTHER_TABLE="<table name>" VP_SHOTS=<dir> VP_SEAT=admin
//     node scripts/org-filter/variables-picker-seat-walk.mjs
//
// Credentials come from the environment and are never printed.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

import { signIn, sleep, until } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.VP_ORIGIN;
const EMAIL = process.env.VP_EMAIL;
const PASSWORD = process.env.VP_PASSWORD;
const AGENT = process.env.VP_AGENT;
const EXPECT = Number(process.env.VP_EXPECT ?? "NaN");
const OTHER = process.env.VP_OTHER_TABLE ?? "";
const SHOTS = process.env.VP_SHOTS ?? "shots/org-filter-class";
const SEAT = process.env.VP_SEAT ?? "admin";
if (!ORIGIN || !EMAIL || !PASSWORD || !AGENT) throw new Error("VP_ORIGIN, VP_EMAIL, VP_PASSWORD, VP_AGENT must be set");

mkdirSync(SHOTS, { recursive: true });
const results = [];
const pass = (clause, ok, detail) => {
  results.push({ clause, ok });
  console.log(`${ok ? "PASS" : "FAIL"} [${SEAT}] ${clause} — ${detail}`);
};
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${SEAT}-${name}.png` });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const doorHits = [];
page.on("request", (r) => {
  const m = r.url().match(/\/rpc\/(data_home_tables|read_records|variable-bindings)/) ?? r.url().match(/(variable-bindings\/preview)/);
  if (m) doorHits.push(m[1]);
});

try {
  const who = await signIn(page, ORIGIN, EMAIL, PASSWORD, SEAT);
  pass("seat", who === EMAIL, `/api/whoami answered ${who}`);

  await page.goto(`${ORIGIN}/agents/${AGENT}/build`, { waitUntil: "domcontentloaded", timeout: 180000 });
  const opened = await until("the Variables button", async () => (await page.$('button[title="Variables"]')) !== null, 150000);
  pass("builder", Boolean(opened.v), `Variables button after ${opened.ms} ms`);
  await page.click('button[title="Variables"]');
  await until("Add New Variable", async () => (await page.$('text="Add New Variable"')) !== null, 30000);
  await page.click('text="Add New Variable"');
  await sleep(1200);

  // Fill automatically → From my data. The switch sits in the same row as its label.
  await page
    .getByText("Fill automatically", { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"justify-between")][1]//button[@role="switch"]')
    .click();
  await sleep(1000);
  const sourceTrigger = page
    .getByText("Source", { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"space-y")][1]//button[@role="combobox"]');
  await sourceTrigger.click();
  await page.locator('[role="option"]', { hasText: "From my data" }).click();
  await sleep(2000);
  await shot(page, "picker-open");

  const filter = await until(
    "the organization filter",
    async () => page.evaluate(() => document.querySelector("[data-entity-org-filter]")?.textContent ?? null),
    30000,
  );
  pass("the organization filter starts on All organizations", /All organizations/.test(filter.v ?? ""), `reads "${filter.v}"`);

  // Wait for the list to be read (the trigger stops saying it is loading), then open it.
  await until(
    "the tables read",
    async () => {
      const t = await page.locator('[aria-label="Table"]').first().textContent();
      return t && !/Loading/.test(t) ? t : null;
    },
    90000,
  );
  await page.locator('[aria-label="Table"]').first().click();
  await sleep(1500);
  const count = await until(
    "table options",
    async () => {
      const n = await page.evaluate(() => document.querySelectorAll('[role="option"]').length);
      return n > 0 ? n : null;
    },
    60000,
  );
  await shot(page, "table-list-all-organizations");
  // Only the options of the Table picker's own popover (the one holding "Search your tables…").
  const offered = await page.evaluate(() => {
    const search = document.querySelector('input[placeholder="Search your tables…"]');
    let box = search?.parentElement ?? null;
    while (box && !box.querySelector('[role="option"]')) box = box.parentElement;
    return [...(box?.querySelectorAll('[role="option"]') ?? [])].map((o) => o.textContent ?? "");
  });
  // The package list may add its own rows (create / manage); count only table rows it offered.
  if (process.env.VP_DUMP) (await import("node:fs")).writeFileSync(process.env.VP_DUMP, offered.join("\n"));
  const tableRows = offered.filter((t) => !/^(Create|Open Data|Show \d+|Hide the tables)/.test(t.trim()));
  pass(
    "All organizations lists the data home's count",
    Number.isNaN(EXPECT) ? false : tableRows.length === EXPECT,
    `${tableRows.length} table rows offered; the data home's door answers ${EXPECT} (not platform-owned); ${count.v} options in all`,
  );

  // THE SHELL'S LANES: the tab bar is the shell's, All is selected, and Mine narrows to the seat's own.
  await page.keyboard.press("Escape");
  await sleep(500);
  const tabs = await page.evaluate(() =>
    [...document.querySelectorAll('[role="tab"]')]
      .filter((b) => b.closest('[role="dialog"]'))
      .map((b) => ({ label: (b.textContent ?? "").replace(/\d+$/, ""), selected: b.getAttribute("aria-selected") })),
  );
  const labels = tabs.map((t) => t.label).join(" · ");
  pass(
    "the shell's lanes, All first and selected",
    labels === "All · Mine · My team · My Orgs · Shared · Public · System" && tabs[0]?.selected === "true",
    labels,
  );
  if (process.env.VP_EXPECT_MINE) {
    await page.locator('[role="dialog"] [role="tab"]', { hasText: /^Mine/ }).first().click();
    await sleep(800);
    await page.locator('[aria-label="Table"]').first().click();
    await sleep(1200);
    const mine = await page.evaluate(() => {
      const search = document.querySelector('input[placeholder="Search your tables…"]');
      let box = search?.parentElement ?? null;
      while (box && !box.querySelector('[role="option"]')) box = box.parentElement;
      return (box?.querySelectorAll('[role="option"]') ?? []).length;
    });
    await shot(page, "lane-mine");
    pass("Mine lists the seat's own tables", mine === Number(process.env.VP_EXPECT_MINE), `${mine} offered; the door says ${process.env.VP_EXPECT_MINE}`);
    await page.keyboard.press("Escape");
    await page.locator('[role="dialog"] [role="tab"]', { hasText: /^All/ }).first().click();
    await sleep(800);
    await page.locator('[aria-label="Table"]').first().click();
    await sleep(800);
  } else {
    await page.locator('[aria-label="Table"]').first().click();
    await sleep(800);
  }

  if (OTHER) {
    await page.keyboard.type(OTHER);
    await sleep(800);
    await page.locator('[role="option"]', { hasText: OTHER }).first().click();
    await sleep(1500);
    const preview = await until(
      "the preview",
      async () =>
        page.evaluate(() => {
          const box = [...document.querySelectorAll("div")].find((d) => /^What the agent will see/.test(d.textContent ?? ""));
          const t = box?.textContent ?? "";
          return /Reading your data/.test(t) || !t ? null : t;
        }),
      90000,
    );
    await shot(page, "other-organization-table-preview");
    pass(
      "a table from another organization previews its rows",
      Boolean(preview.v) && !/could not|not available|refused|not a member/i.test(preview.v ?? ""),
      `preview: ${(preview.v ?? "(none)").slice(0, 220).replace(/\s+/g, " ")}`,
    );
  }
} catch (err) {
  await shot(page, "error").catch(() => {});
  pass("walk", false, err instanceof Error ? err.message : String(err));
} finally {
  console.log(`doors seen: ${[...new Set(doorHits)].join(", ") || "(none)"}`);
  console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
  await browser.close();
}
