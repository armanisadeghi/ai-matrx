// scripts/gridmanual-walk.mjs — LANE GRID-MANUAL headless proof on the shared preview (live database).
//
// admin@admin.com's own disposable "Harbor Street Café — Morning Prep" (scripts/gridmanual-setup.mjs;
// archived after), its saved grid view "Morning run", in the records-ui GRID (not the Sheet):
//   1. Reorder writes nothing until Save;
//   2. Save is one view_record_order_set (no view_declare) and the grid reads "Sort: Manual · set by hand";
//   3. after a reload the view opens in the Grid in its hand order, read through the order door;
//   4. a column sort sets it aside with Back to manual;
//   5. kanban cards sit in the hand order within their column;
//   6. Use this sort instead writes the sort (view_declare with sorts) and the Manual line goes;
//   zero console errors.
//
//   TABLE=<id> VIEW=<id> ORIGIN=http://grid-manual.localhost:3001 node scripts/gridmanual-walk.mjs
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { signIn } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://grid-manual.localhost:3001";
const TABLE = process.env.TABLE ?? "7fb0f057-7fe2-49d3-955d-ba25b631a221";
const OUT = process.env.OUT ?? "/Users/armanisadeghi/code/common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20/shots/grid-manual";
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const doors = [];
page.on("request", (r) => {
  const m = r.url().match(/\/rpc\/(view_declare|view_record_order_set|read_records_in_view_order|record_update)\b/);
  if (m && r.method() === "POST") doors.push({ door: m[1], body: r.postData() ?? "" });
});
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
const writes = () => doors.filter((d) => d.door !== "read_records_in_view_order").map((d) => d.door);

const tasks = async () =>
  (await page.locator("tbody tr").allInnerTexts()).map((t) => t.split("\n")[0].replace(/who\?|⤢/g, "").trim()).filter((t) => t && !/^Summarize/.test(t));
const sortLine = async () => {
  const el = page.locator("[data-sort-mode]").first();
  if ((await el.count()) === 0) return { mode: null, text: "" };
  return { mode: await el.getAttribute("data-sort-mode"), text: (await el.innerText()).replace(/\s+/g, " ").trim() };
};
async function open() {
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForSelector("[data-table-toolbar]", { timeout: 240000 });
  await page.getByRole("button", { name: /Morning run/ }).first().click();
  await page.waitForTimeout(4000);
}

try {
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  check("seat", who === "admin@admin.com", who);
  await open();
  const start = await tasks();
  check("0-opens-sorted-in-the-grid", (await sortLine()).mode === null && start.length === 6, `rows ${start.join(" / ")}`);
  await page.screenshot({ path: `${OUT}/0-grid-sorted.png` });

  // 1. Reorder writes nothing.
  doors.length = 0;
  await page.locator("[data-records-reorder-open]").click();
  await page.waitForSelector("[data-records-reorder]", { timeout: 20000 });
  await page.waitForTimeout(3000);
  const note = (await page.getByRole("alertdialog").innerText().catch(() => "")).replace(/\s+/g, " ");
  check("1-reorder-writes-nothing", writes().length === 0 && /Nothing changes until you save/.test(note), `writes: ${writes().join(", ") || "none"}; says "${note.slice(0, 160)}"`);
  // Drag the last row to the top (the drag itself; Up is its keyboard twin).
  const rowsIn = () => page.locator("[data-records-reorder-row]");
  const label = async (i) => (await rowsIn().nth(i).innerText()).split("\n").find((s) => /[a-z]{3}/i.test(s) && !/^(Up|Down)$/.test(s))?.trim();
  const last = await label(5);
  await rowsIn().nth(5).dragTo(rowsIn().nth(0));
  await page.waitForTimeout(800);
  let top = await label(0);
  if (top !== last) {
    for (let i = 0; i < 5; i += 1) {
      await page.getByRole("button", { name: `Move ${last} up` }).click();
      await page.waitForTimeout(150);
    }
    top = await label(0);
    check("1b-moved-by-hand", top === last, `drag did not move it in headless Chromium; Up x5 → top "${top}"`);
  } else check("1b-moved-by-hand", true, `dragged "${last}" to the top`);
  check("1c-still-nothing-written", writes().length === 0, writes().join(", ") || "none");
  await page.screenshot({ path: `${OUT}/1-reorder-open-nothing-written.png` });

  // 2. Save.
  await page.getByRole("button", { name: "Save order" }).click();
  await page.waitForTimeout(5000);
  const saved = await tasks();
  const line = await sortLine();
  check("2-save-is-one-order-write", JSON.stringify(writes()) === JSON.stringify(["view_record_order_set"]), writes().join(", "));
  check("2b-grid-says-manual", saved[0] === last && line.mode === "manual" && /Sort: Manual/.test(line.text) && /set by hand/.test(line.text), `"${line.text}"; rows ${saved.join(" / ")}`);
  await page.screenshot({ path: `${OUT}/2-after-save-manual.png` });

  // 3. Reload.
  doors.length = 0;
  await open();
  const again = await tasks();
  const line3 = await sortLine();
  check("3-reload-opens-in-the-grid-in-hand-order", JSON.stringify(again) === JSON.stringify(saved) && line3.mode === "manual" && doors.some((d) => d.door === "read_records_in_view_order"), `"${line3.text}"; rows ${again.join(" / ")}; order door read: ${doors.some((d) => d.door === "read_records_in_view_order")}`);
  await page.screenshot({ path: `${OUT}/3-after-reload-manual.png` });

  // 4. Column sort sets it aside; Back to manual.
  await page.locator("thead button").filter({ hasText: /^Task$/i }).first().click();
  await page.waitForTimeout(2000);
  const aside = await sortLine();
  const asideRows = await tasks();
  check("4a-column-sort-sets-aside", aside.mode === "column" && /Sorted by Task/.test(aside.text) && /hand-set order set aside/.test(aside.text) && asideRows[0] !== saved[0], `"${aside.text}"; first ${asideRows[0]}`);
  await page.screenshot({ path: `${OUT}/4a-sort-sets-aside.png` });
  await page.getByRole("button", { name: "Back to manual" }).click();
  await page.waitForTimeout(2000);
  check("4b-back-to-manual", (await sortLine()).mode === "manual" && (await tasks())[0] === saved[0], `first ${(await tasks())[0]}`);

  // 5. Kanban: cards in the hand order within their column.
  await page.getByRole("button", { name: /^Kanban$/ }).first().click();
  await page.waitForTimeout(5000);
  let board = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  if (!/Whisk the hollandaise/.test(board) || !/Season the hash browns/.test(board)) {
    // Choose Station as the column if the board asks.
    const pick = page.locator("select").filter({ hasText: /Station/ }).first();
    if (await pick.count()) await pick.selectOption({ label: "Station" }).catch(() => {});
    else await page.getByRole("button", { name: /Station/ }).first().click().catch(() => {});
    await page.waitForTimeout(4000);
    board = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  }
  const handGrill = saved.filter((t) => /hollandaise|hash browns/.test(t));
  const at = (t) => board.indexOf(t);
  check("5-kanban-in-hand-order", handGrill.length === 2 && at(handGrill[0]) > -1 && at(handGrill[0]) < at(handGrill[1]) && /order set by hand/.test(board), `hand order on Grill: ${handGrill.join(" → ")}; board positions ${handGrill.map(at).join(", ")}; manual note ${/order set by hand/.test(board)}`);
  await page.screenshot({ path: `${OUT}/5-kanban-hand-order.png` });
  await page.getByRole("button", { name: /^Grid$/ }).first().click();
  await page.waitForTimeout(4000);

  // 6. Use this sort instead.
  await page.locator("thead button").filter({ hasText: /^Task$/i }).first().click();
  await page.waitForTimeout(2000);
  doors.length = 0;
  await page.getByRole("button", { name: "Use this sort instead" }).click();
  await page.waitForTimeout(4000);
  check("6-use-this-sort-instead", doors.some((d) => d.door === "view_declare" && d.body.includes("sorts")) && (await sortLine()).mode === null, `writes ${writes().join(", ")}; line "${(await sortLine()).text}"`);
  await page.screenshot({ path: `${OUT}/6-sort-replaced.png` });
} catch (err) {
  check("walk", false, String(err).slice(0, 400));
  await page.screenshot({ path: `${OUT}/error.png` }).catch(() => {});
} finally {
  check("console-errors", consoleErrors.length === 0, consoleErrors.length ? consoleErrors.join(" || ").slice(0, 600) : "none");
  writeFileSync(`${OUT}/walk.json`, JSON.stringify({ origin: ORIGIN, table: TABLE, at: new Date().toISOString(), results }, null, 2));
  await browser.close();
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
