// scripts/data-v2-views-1-walk.mjs — lane DATA-V2-VIEWS-1, from the owner's seat.
//
// Signs in as admin@admin.com through the login form (scripts/lib/seat-browser.mjs, headless) on
// the shared preview (LIVE database) in admin's test organization Cedar Ridge Physical Therapy.
// THE USE CASE: the front desk keeps a plain "Patient Callback List" (patient, phone, reason) —
// no choice, date or file column — and opens it as a Kanban, a Calendar and a Gallery.
//
//   PHASE=make  New table → three rows typed in the grid → the grid (before) → Kanban (before:
//               the one empty state) → Make it work → the board grouped by Status → back to the
//               grid (same rows, one new column at the end) → Calendar → Make it work → Gallery →
//               Make it work. Writes TABLE id to $SHOTS/table.json.
//   PHASE=archive  archives the disposable table through the table menu.
//
//   ORIGIN=http://data-v2-views-1.localhost:3001 SHOTS=<dir> node scripts/data-v2-views-1-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { signIn, setOrganization, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://data-v2-views-1.localhost:3001";
const PHASE = process.env.PHASE ?? "make";
const SHOTS =
  process.env.SHOTS ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-28/data-v2-views-1";
const ORG = process.env.ORG ?? "Cedar Ridge Physical Therapy";
mkdirSync(SHOTS, { recursive: true });
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
  console.log(`· ${name}`, JSON.stringify(result).slice(0, 400));
};
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && out.console_errors.push(m.text().slice(0, 240)));
const shot = async (name) => {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  step(`screenshot ${name}`);
};
const text = async () => (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");

try {
  out.signed_in_as = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  step("signed in", { as: out.signed_in_as });
  if (out.signed_in_as !== "admin@admin.com") throw new Error(`wrong seat: ${out.signed_in_as}`);
  await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await setOrganization(page, ORG);
  step("organization", { org: ORG });

  let table = existsSync(join(SHOTS, "table.json")) ? JSON.parse(readFileSync(join(SHOTS, "table.json"), "utf8")).table : null;

  if (PHASE === "probe") {
    await page.goto(`${ORIGIN}/data-v2/${table}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.getByRole("button", { name: "New record" }).first().waitFor({ timeout: 120000 });
    await sleep(3000);
    await page.getByRole("button", { name: "New record" }).first().click();
    await sleep(3000);
    await shot("probe-new-record");
    step("inputs", { i: await page.locator("input:visible, textarea:visible, [contenteditable=true]").evaluateAll((els) => els.map((e) => e.outerHTML.slice(0, 160))) });
  }

  if (PHASE === "rows") {
    await page.goto(`${ORIGIN}/data-v2/${table}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.getByRole("button", { name: "New record" }).first().waitFor({ timeout: 120000 });
    await sleep(3000);
    for (const who of ["Dana Whitcomb — knee rehab follow-up", "Luis Ortega — reschedule Thursday visit", "Priya Nair — insurance pre-authorization"]) {
      await page.getByRole("button", { name: "New record" }).first().click();
      await sleep(1500);
      await page.keyboard.type(who);
      await page.keyboard.press("Enter");
      await sleep(2500);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await sleep(8000);
    await shot("01-grid-before");
    step("grid text", { t: (await text()).slice(0, 600) });
  }

  if (PHASE === "tidy") {
    // The empty row left by the first probe of "New record": archived through the grid's own Delete.
    await page.goto(`${ORIGIN}/data-v2/${table}?view=grid`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await until("the grid", async () => (await text()).includes("Dana Whitcomb"), 120000);
    await sleep(3000);
    const rows = page.locator("tbody tr[data-row-id]");
    const n = await rows.count();
    let empty = null;
    for (let i = 0; i < n; i += 1) {
      const t = (await rows.nth(i).innerText()).replace(/\s+/g, " ").trim();
      if (!/Dana|Luis|Priya/.test(t)) empty = rows.nth(i);
    }
    step("empty row found", { found: Boolean(empty), rows: n });
    if (empty) {
      await empty.getByRole("button", { name: "Delete" }).first().click();
      await sleep(2500);
      const confirm = page.getByRole("button", { name: /^(Delete|Archive)/ }).filter({ hasNotText: "column" });
      if ((await page.getByRole("alertdialog").count()) > 0) await page.getByRole("alertdialog").getByRole("button", { name: /Delete|Archive/ }).first().click();
      await sleep(3000);
      await page.reload({ waitUntil: "domcontentloaded" });
      await until("the grid", async () => (await text()).includes("Dana Whitcomb"), 120000);
      await sleep(3000);
      step("after archive", { rows: await page.locator("tbody tr[data-row-id]").count(), notice: (await text()).includes("archived") });
    }
  }

  if (PHASE === "askai") {
    // ASK AI, END TO END: the board's empty state → the assistant → the ask sent → the agent's
    // column held for approval → approved → the board draws by it.
    await page.goto(`${ORIGIN}/data-v2/${table}?view=kanban`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await until("the empty state", async () => (await text()).includes("Make it work"), 120000);
    await sleep(2000);
    await shot("a1-kanban-before");
    const ask = await page.locator("text=You would say something like").innerText();
    const wording = ask.replace(/^.*?“/, "").replace(/”.*$/, "");
    await page.getByRole("button", { name: "Ask AI" }).first().click();
    const box = page.getByPlaceholder("Type your message...").last();
    await box.waitFor({ timeout: 60000 });
    await sleep(2000);
    await box.click();
    await page.keyboard.type(wording);
    await shot("a2-ask-typed");
    await page.keyboard.press("Enter");
    step("ask sent", { wording });
    let seen = "";
    for (let i = 0; i < 40; i += 1) {
      await sleep(10000);
      const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      const approve = page.getByRole("button", { name: /^(Approve|Allow|Yes, make it|Accept)/ });
      if (i % 3 === 0) await shot(`a3-agent-${String(i).padStart(2, "0")}`);
      if ((await approve.count()) > 0) {
        await shot("a4-approval-card");
        step("approval card", { buttons: await approve.allInnerTexts() });
        await approve.first().click();
        await sleep(8000);
        await shot("a5-approved");
        break;
      }
      seen = body.slice(-600);
    }
    step("agent tail", { seen });
    await page.goto(`${ORIGIN}/data-v2/${table}?view=kanban`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await sleep(8000);
    await shot("a6-kanban-after");
    step("kanban after", { text: (await text()).slice(0, 500) });
  }

  if (PHASE === "views") {
    const open = async (view) => {
      await page.goto(`${ORIGIN}/data-v2/${table}?view=${view}`, { waitUntil: "domcontentloaded", timeout: 180000 });
      await until(`the ${view} draws`, async () => (await text()).includes("Dana Whitcomb") || (await text()).includes("Make it work"), 120000);
      await sleep(3000);
    };
    const gridHeads = async () =>
      page.locator("thead th").evaluateAll((ths) => ths.map((t) => (t.textContent ?? "").trim()).filter(Boolean));

    // THE GRID BEFORE: one column, the rows.
    await open("grid");
    const before = { heads: await gridHeads(), text: (await text()).slice(0, 400) };
    step("grid before", before);

    // KANBAN BEFORE: the one empty state.
    await open("kanban");
    await shot("02-kanban-before");
    const k = await text();
    step("kanban before", {
      sentence: k.includes("This table has no choice column to make the board's columns from."),
      makeItWork: await page.getByRole("button", { name: "Make it work" }).count(),
      askAi: await page.getByRole("button", { name: "Ask AI" }).count(),
      oldInstruction: k.includes("Add column, then"),
    });
    await page.getByRole("button", { name: "Make it work" }).first().click();
    const grouped = await until("the board groups by Status", async () => (await text()).includes("Group by") && !(await text()).includes("Make it work"), 60000);
    await sleep(3000);
    await shot("03-kanban-after");
    step("kanban after", { grouped: Boolean(grouped.v), ms: grouped.ms, text: (await text()).slice(0, 500) });

    // THE SAME TABLE AS A GRID: the same rows, one new column at the end.
    await open("grid");
    const after = { heads: await gridHeads(), text: (await text()).slice(0, 400) };
    await shot("04-grid-after");
    step("grid after", after);

    // A reload keeps the board grouped (the view key was saved).
    await open("kanban");
    step("kanban after reload", { groupedStill: !(await text()).includes("Make it work"), picker: await page.locator("#view-field-kanban").inputValue().catch(() => null) });

    // CALENDAR.
    await open("calendar");
    await shot("05-calendar-before");
    step("calendar before", { sentence: (await text()).includes("This table has no date column to place records on.") });
    // ASK AI opens the assistant with the ask worded (autoRun off: the person sends it or says it her way).
    await page.getByRole("button", { name: "Ask AI" }).first().click();
    await sleep(6000);
    await shot("05b-calendar-ask-ai");
    step("ask ai", { body: (await page.locator("body").innerText()).replace(/\s+/g, " ").match(/.{0,80}(assistant|Ask|chat).{0,120}/i)?.[0] ?? null });
    await page.keyboard.press("Escape");
    await sleep(1500);
    await open("calendar");
    await page.getByRole("button", { name: "Make it work" }).first().click();
    await until("the calendar lays out", async () => !(await text()).includes("Make it work"), 60000);
    await sleep(3000);
    await shot("06-calendar-after");
    step("calendar after", { text: (await text()).slice(0, 400) });

    // GALLERY.
    await open("gallery");
    await shot("07-gallery-before");
    step("gallery before", { sentence: (await text()).includes("The cards have no picture because this table has no file column."), cards: (await text()).includes("Dana Whitcomb") });
    await page.getByRole("button", { name: "Make it work" }).first().click();
    await until("the gallery takes the Photo column", async () => !(await text()).includes("Make it work"), 60000);
    await sleep(3000);
    await shot("08-gallery-after");
    step("gallery after", { text: (await text()).slice(0, 400) });

    // Ask AI on a fresh look: the button is there and opens the assistant (not pressed to a write).
    await open("grid");
    step("grid final", { heads: await gridHeads() });
  }

  if (PHASE === "make") {
    await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 180000 });
    const nt = page.getByRole("button", { name: "New table" }).first();
    await nt.waitFor({ timeout: 120000 });
    await nt.click();
    await page.getByPlaceholder("Table name").fill(process.env.TABLE_NAME ?? "Patient Callback List");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    const opened = await until("the new table opens", async () => /\/data-v2\/[0-9a-f-]{36}/.test(page.url()), 120000);
    if (!opened.v) throw new Error("the new table did not open");
    table = page.url().match(/\/data-v2\/([0-9a-f-]{36})/)[1];
    writeFileSync(join(SHOTS, "table.json"), JSON.stringify({ table, org: ORG }, null, 2));
    step("table made", { table });
    await sleep(6000);
    await shot("00-new-table");
    // Explore: the buttons on the page.
    step("buttons", { b: await page.locator("button:visible").allInnerTexts() });
  }
} catch (e) {
  step("FAILED", { error: String(e?.message ?? e) });
  await shot("zz-failed").catch(() => undefined);
} finally {
  writeFileSync(join(SHOTS, `walk-${PHASE}.json`), JSON.stringify(out, null, 2));
  await browser.close();
}
