// scripts/reference-carry-walk.mjs — lane REFERENCE-CARRY owner-seat walk (admin@admin.com).
//
// PHASE=before  the installed @ai-matrx/records-ui draws references as grey words and a copied
//               ```matrx reference fence as raw text (Arman's Department table, 2026-09-28).
// PHASE=after   every reference is a chip that opens what it names; a kind value draws through the
//               kind system; an entity-reference cell is edited with a picker.
//
// Tables: Cedar Ridge Physical Therapy's Departments (a scope type copied into the store, Team lead /
// Team members → its Team Member Records); Titanium's Department (read only — never written); admin's
// Workspace's Model Picks (an entity reference to AI models, the picker). Screens land in
// common-docs/operations/for-arman/2026-09-28/reference-carry/.

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { signIn, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://reference-carry.localhost:3001";
const PHASE = process.env.PHASE ?? "before";
const SHOTS =
  process.env.SHOTS ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-28/reference-carry";
mkdirSync(SHOTS, { recursive: true });
const T = {
  cedarRidgeDepartments: "41ae4b2d-46e7-463d-94d9-b26c46b6f451",
  titaniumDepartment: "e216a4de-3d73-4927-b31f-492c7b42c0c0",
  modelPicks: "a1fe654b-d31b-49c8-88c4-32483da5afb6",
};
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);

const out = { origin: ORIGIN, phase: PHASE, started: new Date().toISOString(), steps: [], console_errors: [] };
const step = (name, result = {}) => {
  out.steps.push({ name, ...result });
  console.log(`· ${name}`, JSON.stringify(result).slice(0, 500));
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  if (/_next\/hmr|WebSocket connection/.test(t)) return;
  out.console_errors.push({ at: page.url().replace(ORIGIN, ""), text: t.slice(0, 300) });
});
page.on("pageerror", (e) => out.console_errors.push({ at: page.url().replace(ORIGIN, ""), text: `PAGEERROR ${String(e).slice(0, 300)}` }));
const shot = (name) => page.screenshot({ path: join(SHOTS, `${PHASE}-${name}.png`) });

async function unpark() {
  if (!page.url().includes("__dev-walk")) return;
  await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
  await sleep(6000);
}

async function open(tableId) {
  await page.goto(`${ORIGIN}/data-v2/${tableId}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await unpark();
  if (page.url().includes("__dev-walk")) await page.goto(`${ORIGIN}/data-v2/${tableId}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  const ready = await until("the grid", async () => (await page.locator("thead th").count()) > 1, 240000);
  if (!ready.v) throw new Error(`the table ${tableId} did not draw`);
  await sleep(3500);
}

const colIndex = (name) =>
  page.evaluate((n) => [...document.querySelectorAll("thead th")].findIndex((th) => (th.textContent ?? "").trim().toLowerCase().startsWith(n.toLowerCase())), name);
async function cellOf(row, col) {
  const i = await colIndex(col);
  return page.locator("tbody tr", { hasText: row }).first().locator("td").nth(i);
}
async function readCell(row, col) {
  const cell = await cellOf(row, col);
  return cell.evaluate((td) => ({
    text: td.innerText.replace(/\s+/g, " ").trim().slice(0, 200),
    chips: td.querySelectorAll("[data-records-reference-chip]").length,
    links: [...td.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")),
    kind: [...td.querySelectorAll("[data-records-kind-value]")].map((k) => k.getAttribute("data-records-kind-value")),
    fence: /matrx_version|```matrx/.test(td.innerText),
  }));
}

await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
step("signed in", { as: "admin@admin.com" });

// 1 — Cedar Ridge Physical Therapy · Departments (a copied scope type; native relations in the store).
await open(T.cedarRidgeDepartments);
step("Cedar Ridge · Team lead", await readCell("Outpatient Orthopedics", "Team lead"));
step("Cedar Ridge · Team members", await readCell("Outpatient Orthopedics", "Team members"));
await shot("cedar-ridge-departments");

// 2 — Titanium · Department (Arman's copied table; READ ONLY — this walk writes nothing here).
await open(T.titaniumDepartment);
// The row whose copied cells hold the fence (Web Development, measured 2026-09-28).
const rowName = "Web Development";
step("Titanium · Team Leader", await readCell(rowName, "Team Leader"));
step("Titanium · Team members", await readCell(rowName, "Team members"));
await shot("titanium-department-read-only");

// 3 — a reference chip opens what it names (after only).
if (PHASE === "after") {
  await open(T.cedarRidgeDepartments);
  const lead = await cellOf("Outpatient Orthopedics", "Team lead");
  const link = lead.locator("[data-records-reference-chip] a[href]").first();
  const href = await link.getAttribute("href").catch(() => null);
  step("the Team lead chip is a door", { href });
  if (href) {
    // A plain click, as a person clicks: the chip is a real link to the record's one address.
    await link.click().catch(() => null);
    await until("the record page", async () => !page.url().includes(T.cedarRidgeDepartments), 60000);
    await page.waitForLoadState("domcontentloaded", { timeout: 120000 }).catch(() => undefined);
    await sleep(8000);
    step("the chip opened", { url: page.url().replace(ORIGIN, ""), title: (await page.title()).slice(0, 80) });
    await shot("team-lead-opened");
  }
  // A kind value opens the real view in a window: Arman's copied Titanium cell (read only — opening writes nothing).
  await open(T.titaniumDepartment);
  const fenceCell = await cellOf("Web Development", "Team Leader");
  await shot("titanium-kind-cell");
  const kindChip = fenceCell.locator("[data-records-kind-value] a[href], [data-records-kind-value] button").first();
  const kindHref = await kindChip.getAttribute("href").catch(() => null);
  step("the copied reference's chip", { href: kindHref, text: (await kindChip.innerText().catch(() => "")).slice(0, 80) });
}
// 4 — an entity-reference cell is edited with a picker (admin's Workspace · Model Picks).
await open(T.modelPicks);
const firstPick = (await page.locator("tbody tr").first().innerText().catch(() => "")).split("\n")[0]?.trim() || "";
step("Model Picks · Model before", await readCell(firstPick, "Model"));
await shot("model-picks");
if (PHASE === "after") {
  const cell = await cellOf(firstPick, "Model");
  await cell.dblclick();
  await sleep(1500);
  const pick = page.getByRole("button", { name: "Pick for Model" }).first();
  const offered = await pick.isVisible().catch(() => false);
  step("the cell offers a picker, not a text box", { offered });
  if (offered) {
    await pick.click();
    await sleep(800);
    // The search narrows the list (the typing pauses, then the store's search door answers). The walk
    // picks the model this row already named, so the table ends as it began.
    await page.getByRole("textbox", { name: /Search — Pick for Model/ }).fill("3.5-flash-lite");
    const found = await until(
      "candidates for the words",
      async () => {
        const all = await page.locator("[data-entity-reference-candidate]").allInnerTexts();
        return all.length > 0 && all.every((t) => /flash-lite/i.test(t)) ? all : null;
      },
      20000,
    );
    step("the picker found models by their words", { count: found.v?.length ?? 0, first: (found.v ?? []).slice(0, 4), ms: found.ms });
    await shot("model-picks-picker-open");
    if (found.v) {
      await page.locator("[data-entity-reference-candidate]", { hasText: /^gemini-3\.5-flash-lite$/ }).first().click();
      await sleep(800);
      await shot("model-picks-picked");
      const save = page.getByRole("button", { name: /^Save/ }).first();
      if (await save.isVisible().catch(() => false)) await save.click();
      await sleep(4000);
      step("Model Picks · Model after the pick", await readCell(firstPick, "Model"));
      await shot("model-picks-saved");
    }
  }
}

// 4b — a value that names its own shape opens the real view in a window. admin's own Model Picks: the
// "The hardest problems" row's "Why this model" holds a pasted comparison for the walk, then its own
// words again (the walk ends with the table as it found it). Every change is typed into the grid.
const WHY_HARDEST =
  "Highest intelligence: the hardest coding, agentic and long-running tasks. Thinking is always on and it can't be forced to call a specific tool.";
async function typeInto(rowText, col, words) {
  const cell = await cellOf(rowText, col);
  await cell.dblclick();
  await sleep(900);
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText(words);
  await page.keyboard.press("Enter");
  await sleep(3500);
}
if (PHASE === "after" || PHASE === "kind") {
  await open(T.modelPicks);
  // Put back what the first version of this walk typed into the wrong row (2026-09-29 20:00Z).
  if (await page.locator("tbody tr", { hasText: "Nightly ticket triage" }).count()) {
    await typeInto("Nightly ticket triage", "Purpose", "The hardest problems");
  }
  const COMPARISON = JSON.stringify({
    __kind: "data_table",
    title: "Opus against Sonnet on the month-end close checklist",
    columns: [{ key: "model", label: "Model" }, { key: "cost", label: "Cost per run" }, { key: "caught", label: "Errors caught" }],
    rows: [
      { model: "claude-opus-5-5", cost: "$0.84", caught: "11 of 11" },
      { model: "claude-sonnet-5", cost: "$0.19", caught: "9 of 11" },
    ],
  });
  await typeInto("The hardest problems", "Why this model", COMPARISON);
  step("a pasted kind value reads as its kind", await readCell("The hardest problems", "Why this model"));
  await shot("kind-cell");
  const why = await cellOf("The hardest problems", "Why this model");
  const button = why.locator("[data-records-kind-button]").first();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    await sleep(4000);
    const win = await page.evaluate(() =>
      [...document.querySelectorAll("[data-window-panel], [role=dialog], [id^=structured-value-window]")].map((d) => d.innerText.replace(/\s+/g, " ").slice(0, 240)),
    );
    step("the kind opened in a window", { windows: win });
    await shot("kind-window");
    await page.keyboard.press("Escape").catch(() => undefined);
  }
  await open(T.modelPicks);
  await typeInto("The hardest problems", "Why this model", WHY_HARDEST);
  step("the row reads as it did", await readCell("The hardest problems", "Why this model"));
}

// 5 — phone width: the chips wrap inside the cell, no sideways page scroll.
await page.setViewportSize({ width: 390, height: 844 });
await open(T.cedarRidgeDepartments);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
step("390 · page overflow px", { overflow });
await shot("cedar-ridge-departments-390");

out.finished = new Date().toISOString();
writeFileSync(join(SHOTS, `walk-${PHASE}.json`), JSON.stringify(out, null, 2));
console.log(`console errors: ${out.console_errors.length}`);
await browser.close();
