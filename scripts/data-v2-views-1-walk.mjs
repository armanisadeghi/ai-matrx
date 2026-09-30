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
// Every navigation passes the walk cap's parked page the way a person would: press Resume, go on.
const rawGoto = page.goto.bind(page);
page.goto = async (url, opts) => {
  const r = await rawGoto(url, opts);
  if (page.url().includes("__dev-walk")) {
    await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
    await page.waitForURL((u) => !u.toString().includes("__dev-walk"), { timeout: 120000 }).catch(() => undefined);
    await sleep(3000);
    if (!page.url().replace(/[?#].*$/, "").endsWith(new URL(url).pathname)) return rawGoto(url, opts);
  }
  return r;
};
page.on("console", (m) => m.type() === "error" && out.console_errors.push(m.text().slice(0, 240)));
const shot = async (name) => {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  step(`screenshot ${name}`);
};
const text = async () => (await page.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ");

try {
  // A parked preview host says so and offers Resume; press it, as a person would.
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForLoadState("load").catch(() => undefined);
  if (page.url().includes("__dev-walk")) {
    await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
    await page.waitForURL((u) => !u.toString().includes("__dev-walk"), { timeout: 120000 }).catch(() => undefined);
    await sleep(3000);
    step("preview resumed", { url: page.url() });
  }
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

  if (PHASE === "b222") {
    // B2-22 on the preview: the Calendar's Ask AI opens with the ask typed and the chips in words.
    await page.goto(`${ORIGIN}/data-v2/${table}?view=calendar`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await until("the calendar's offer", async () => (await text()).includes("Make it work"), 120000);
    await sleep(2000);
    await page.getByRole("button", { name: "Ask AI" }).first().click();
    const box = page.getByPlaceholder("Type your message...").last();
    await box.waitFor({ timeout: 60000 }).catch(() => undefined);
    await sleep(5000);
    await shot("b2-22-ask-ai");
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const typed = await page.locator("textarea:visible, [contenteditable=true]:visible").evaluateAll((els) => els.map((e) => (e.value ?? e.textContent ?? "").trim()).filter(Boolean));
    step("B2-22 Ask AI", {
      typed,
      rawChips: body.match(/records_(ta|w|su)[a-z_…]*/g) ?? [],
      wordChips: ["This table", "A column", "The ask"].filter((w) => body.includes(w)),
    });
  }

  if (PHASE === "b2") {
    // BREAKER-2 B2-19 / B2-22 / B2-29 / B2-30 and BREAKER-3's drag, on BREAKER-2's own fixture.
    const FIXTURE = "031d3690-4a02-4cee-a575-454ffd96c992";
    const board = async () =>
      page.locator("section[data-board-column]").evaluateAll((els) =>
        els.map((e) => ({ name: e.getAttribute("data-board-column"), cards: [...e.querySelectorAll("li")].map((l) => (l.textContent ?? "").trim().slice(0, 40)) })),
      );
    await page.goto(`${ORIGIN}/data-v2/${FIXTURE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await sleep(8000);
    const back = page.getByRole("button", { name: "Bring it back" });
    if (await back.count()) {
      await back.click();
      await sleep(8000);
      step("restored the fixture");
    }
    await page.goto(`${ORIGIN}/data-v2/${FIXTURE}?view=kanban`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.locator("#view-field-kanban").waitFor({ timeout: 120000 });
    await page.selectOption("#view-field-kanban", { label: "Visit Status" });
    await sleep(6000);
    await shot("b2-19a-by-visit-status");
    step("B2-19 by Visit Status", { columns: await board() });
    // BREAKER-3: drag the first card of the first column onto the second column, then Undo.
    const cols = await board();
    const from = cols.find((c) => c.cards.length > 0 && c.name !== "No value");
    const to = cols.find((c) => c.name !== from?.name && c.name !== "No value");
    if (from && to) {
      await page.locator(`section[data-board-column="${from.name}"] li`).first().dragTo(page.locator(`section[data-board-column="${to.name}"]`));
      await sleep(6000);
      await shot("b3-dragged");
      step("BREAKER-3 drag", { from: from.name, to: to.name, said: (await text()).match(/[^.]*moved to [^.]*\./)?.[0] ?? null, columns: await board() });
      const undo = page.getByRole("button", { name: "Undo" }).first();
      if (await undo.count()) {
        await undo.click();
        await sleep(6000);
        await shot("b3-undone");
        step("BREAKER-3 undo", { columns: await board() });
      }
    }
    await page.selectOption("#view-field-kanban", { label: "Body Areas" });
    await sleep(6000);
    await shot("b2-19b-by-body-areas");
    step("B2-19 by Body Areas", { columns: await board(), ofThem: (await text()).includes("of them") });
    // B2-30: the table's settings, at the bottom.
    const settings = page.getByRole("button", { name: /^Settings$|Table settings|Configure/ }).first();
    if (await settings.count()) {
      await settings.click();
      await sleep(5000);
      const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      await page.mouse.wheel(0, 4000);
      await sleep(1500);
      await shot("b2-30-settings");
      step("B2-30 settings", { says: body.match(/Rules for (entering|moving)[^.]*\.[^.]*\./)?.[0] ?? null, denies: body.includes("no board to draw") });
      await page.keyboard.press("Escape");
    } else step("B2-30 settings button not found", { buttons: (await page.locator("button:visible").allInnerTexts()).filter(Boolean).slice(0, 30) });
    // B2-22: the Calendar's Ask AI (Visit Date is text here, so the calendar needs a date column).
    await page.goto(`${ORIGIN}/data-v2/${FIXTURE}?view=calendar`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await sleep(8000);
    const ask = page.getByRole("button", { name: "Ask AI" }).first();
    if (await ask.count()) {
      await ask.click();
      const box = page.getByPlaceholder("Type your message...").last();
      await box.waitFor({ timeout: 60000 });
      await sleep(4000);
      await shot("b2-22-ask-ai");
      const typed = await box.evaluate((e) => (e.value ?? e.textContent ?? "").trim()).catch(() => "");
      const chips = (await page.locator("body").innerText()).match(/records_(ta|w|su)/g) ?? [];
      step("B2-22 Ask AI", { typed: typed.slice(0, 160), rawChips: chips });
      await page.keyboard.press("Escape");
    } else step("B2-22: no Ask AI on the calendar (the table has a date column?)", { text: (await text()).slice(0, 300) });
    // B2-29: a record's history, from the grid.
    await page.goto(`${ORIGIN}/data-v2/${FIXTURE}?view=grid`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await sleep(8000);
    const open = page.locator("tbody tr[data-row-id]").first().getByRole("button", { name: /⤢|Open/ }).first();
    if (await open.count()) {
      await open.click();
      await sleep(5000);
      const hist = page.getByRole("tab", { name: /History/ }).or(page.getByRole("button", { name: /History/ })).first();
      if (await hist.count()) { await hist.click(); await sleep(5000); }
      await shot("b2-29-history");
      const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      step("B2-29 history", { retype: /\bretype\b/.test(body), sample: body.match(/(Created|Edited|Column type changed|Archived|Restored)[^·]{0,60}/g)?.slice(0, 4) ?? null });
    }
  }

  if (PHASE === "b2probe") {
    const FIXTURE = "031d3690-4a02-4cee-a575-454ffd96c992";
    await page.goto(`${ORIGIN}/data-v2/${FIXTURE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await sleep(12000);
    await shot("b2-probe-fixture");
    step("fixture page", { text: (await text()).slice(0, 500), buttons: (await page.locator("main button:visible").allInnerTexts()).filter(Boolean).slice(0, 30) });
  }

  if (PHASE === "boardshot") {
    await page.goto(`${ORIGIN}/data-v2/${table}?view=kanban`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await until("the board", async () => (await text()).includes("No value"), 180000);
    await sleep(4000);
    const overlay = await page.locator("nextjs-portal").count();
    await shot("a6-kanban-after");
    step("board", { overlay, text: (await text()).slice(0, 400) });
  }

  if (PHASE === "attach") {
    // A PATIENT'S PHOTO, ATTACHED THROUGH THE GRID'S OWN FILE WINDOW, THEN SEEN ON HER GALLERY CARD.
    await page.goto(`${ORIGIN}/data-v2/${table}?view=grid`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await until("the grid", async () => (await text()).includes("Dana Whitcomb"), 120000);
    await sleep(3000);
    const row = page.locator("tbody tr[data-row-id]", { hasText: "Dana Whitcomb" }).first();
    await row.locator('td[data-matrx-cell-col="photo"]').dblclick();
    await sleep(2500);
    const attach = page.getByRole("button", { name: /Attach|Add file|Upload/ }).first();
    await attach.click();
    await page.getByRole("button", { name: "Upload File" }).first().waitFor({ timeout: 60000 });
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 30000 }),
      page.getByRole("button", { name: "Upload File" }).first().click(),
    ]);
    await chooser.setFiles(new URL("../public/default-user-avatar.jpg", import.meta.url).pathname);
    await sleep(8000);
    await shot("f3-uploaded");
    step("after upload", { text: (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-700) });
    // If the window asks to confirm the pick, confirm it.
    const confirm = page.getByRole("button", { name: /^Attach( \d+ files?| file)?$|^Select$|^Done$/ });
    if (await confirm.count()) { await confirm.last().click(); await sleep(5000); }
    await shot("f4-cell");
    step("cell", { text: (await row.innerText()).replace(/\s+/g, " ") });
    await page.goto(`${ORIGIN}/data-v2/${table}?view=gallery`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await until("the gallery", async () => (await text()).includes("Dana Whitcomb"), 120000);
    await sleep(8000);
    await shot("f5-gallery-picture");
    step("gallery", { imgs: await page.locator("main img").evaluateAll((els) => els.map((e) => ({ src: e.getAttribute("src")?.slice(0, 120), w: e.naturalWidth }))) });
  }

  if (PHASE === "attachprobe") {
    await page.goto(`${ORIGIN}/data-v2/${table}?view=grid`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await until("the grid", async () => (await text()).includes("Dana Whitcomb"), 120000);
    await sleep(3000);
    const cell = page.locator('td[data-matrx-cell-col="photo"]').first();
    step("photo cells", { n: await page.locator('td[data-matrx-cell-col="photo"]').count() });
    await cell.dblclick();
    await sleep(2500);
    await shot("f1-photo-cell-open");
    step("buttons", { b: (await page.locator("button:visible").allInnerTexts()).filter(Boolean).slice(-25) });
    const attach = page.getByRole("button", { name: /Attach|Add file|Upload/ }).first();
    if (await attach.count()) {
      await attach.click();
      await sleep(4000);
      await shot("f2-file-window");
      step("window", { text: (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(-900), inputs: await page.locator("input[type=file]").count() });
    }
  }

  if (PHASE === "askdiag") {
    const bad = [];
    page.on("response", async (r) => {
      if (r.status() >= 400 && !/_next|favicon|\.png/.test(r.url())) {
        let body = "";
        try { body = (await r.text()).slice(0, 1500); } catch {}
        bad.push({ status: r.status(), url: r.url().slice(0, 200), body });
      }
    });
    await page.goto(`${ORIGIN}/data-v2/${table}?view=kanban`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await until("the empty state", async () => (await text()).includes("Make it work"), 120000);
    await sleep(2000);
    await page.getByRole("button", { name: "Ask AI" }).first().click();
    const box = page.getByPlaceholder("Type your message...").last();
    await box.waitFor({ timeout: 60000 });
    await sleep(2000);
    await box.click();
    await page.keyboard.type("Add a Status choice column to this table with the choices To do, In progress and Done, then group the Kanban board by it.");
    await page.keyboard.press("Enter");
    await sleep(30000);
    const details = page.getByRole("button", { name: "Details" }).last();
    if (await details.count()) { await details.click(); await sleep(1500); }
    await shot("d1-details");
    step("refusal", { dialog: (await page.locator("body").innerText()).replace(/\s+/g, " ").match(/could not be sent.{0,1500}/)?.[0] ?? null });
    step("bad responses", { bad });
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
