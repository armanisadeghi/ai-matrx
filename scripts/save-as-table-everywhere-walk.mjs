// scripts/save-as-table-everywhere-walk.mjs — lane SAVE-AS-TABLE-EVERYWHERE, the owner-seat proof.
//
// Signs in through the app's own login form (scripts/lib/seat-browser.mjs, headless) as
// admin@admin.com on the shared preview (live database), picks Cedar Ridge Physical Therapy in the
// organization picker, and walks the one "Save to a table" from the surfaces a person meets:
//
//   STEP=note     a note holding a markdown table → ⋯ "Save to a table…" → a NEW table
//   STEP=chat     a chat answer with three bullets → right-click "Save to a table…" → rows ADDED to
//                 the table the note made, split at the dash, with the enum ask firing on a word the
//                 Visit type choice column does not know
//   STEP=csv      a note holding a CSV paste → the same action → a new table
//   STEP=canvas   a chat table artifact → Save to ▸ A table… → the artifact becomes a live table
//
//   ORIGIN=http://save-as-table.localhost:3001 STEP=note node scripts/save-as-table-everywhere-walk.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { signIn, setOrganization, until, sleep } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://save-as-table.localhost:3001";
const STEP = process.env.STEP ?? "note";
const SHOTS = process.env.SHOTS ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-29/save-as-table";
const STATE = process.env.WALK_STATE ?? "/private/tmp/save-as-table-walk-state.json";
mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
let state = {};
try {
  state = JSON.parse(readFileSync(STATE, "utf8"));
} catch {
  state = {};
}
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN }).catch(() => {});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
const shot = async (name) => {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  console.log(`  [shot] ${name}.png`);
};
const log = (...a) => console.log("·", ...a);

async function unpark() {
  if (!page.url().includes("__dev-walk")) return;
  await page.getByRole("button", { name: /Resume/ }).first().click({ timeout: 30000 }).catch(() => {});
  await page.waitForURL((u) => !u.href.includes("__dev-walk"), { timeout: 180000 }).catch(() => {});
}

async function goto(path) {
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await unpark();
  if (page.url().includes("__dev-walk")) await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 300000 });
}

// The walk cap parks a preview host (too many hosts walking at once); a person presses
// "Resume this preview", and so does the walk — before and, if it parks mid-way, during sign-in.
async function resumeIfParked() {
  if (!page.url().includes("__dev-walk")) return;
  await page.getByRole("button", { name: /Resume/ }).first().click({ timeout: 30000 }).catch(() => {});
  await page.waitForURL((u) => !u.href.includes("__dev-walk"), { timeout: 180000 }).catch(() => {});
}
let who = null;
for (let attempt = 1; attempt <= 4 && who !== "admin@admin.com"; attempt += 1) {
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 300000 }).catch(() => {});
  await resumeIfParked();
  try {
    who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  } catch {
    console.log(`  sign-in attempt ${attempt} was parked by the walk cap; resuming`);
    await resumeIfParked();
  }
}
log("signed in as", who);
if (who !== "admin@admin.com") throw new Error(`wrong seat: ${who}`);
await goto("/dashboard");
await sleep(4000);
await setOrganization(page, "Cedar Ridge Physical Therapy");
log("organization: Cedar Ridge Physical Therapy");

/** The one overlay: wait for it, and return its dialog. */
async function theDialog() {
  const dlg = page.getByRole("dialog").filter({ hasText: "Save to a table" }).last();
  await dlg.waitFor({ timeout: 60000 });
  await until("the shape is read", async () => (await dlg.innerText()).includes("from"), 60000);
  return dlg;
}

/** Right-click → Save ▸ Save to a table… (the one registry, drawn by the right-click menu). */
async function openRegistryAction(scope, position) {
  await scope.click({ button: "right", ...(position ? { position } : {}) });
  await sleep(2000);
  const direct = page.getByRole("menuitem", { name: /^Save to a table/ }).first();
  if (!(await direct.isVisible().catch(() => false))) {
    await page.getByRole("menuitem", { name: /^Save$/ }).first().hover();
    await sleep(1200);
  }
  await shot(`${STEP}-menu`);
  await page.getByRole("menuitem", { name: /^Save to a table/ }).first().click({ timeout: 15000 });
}

const NOTE_TABLE = [
  "## Tomorrow's visits",
  "",
  "| Patient | Visit type | Therapist | Minutes |",
  "|---|---|---|---|",
  "| Priya Vantana | Follow-up | Dana Whitfield | 30 |",
  "| Camille Duprez | Initial Evaluation | Marcus Bell | 60 |",
  "| Omar Haddad | Follow-up | Dana Whitfield | 30 |",
  "| Lena Ortiz | Re-evaluation | Marcus Bell | 45 |",
].join("\n");

async function newNote(text) {
  await goto("/notes");
  await sleep(6000);
  await page.getByRole("button", { name: /New Note/ }).last().click();
  const box = page.locator('textarea[placeholder="Start typing..."]').last();
  await box.waitFor({ timeout: 60000 });
  await box.fill(text);
  await sleep(4000); // autosave
  return box;
}

if (STEP === "note") {
  const box = await newNote(NOTE_TABLE);
  state.noteUrl = page.url();
  await shot("01-note-before");
  await openRegistryAction(box, { x: 120, y: 60 });
  const dlg = await theDialog();
  await sleep(1500);
  await shot("01-note-dialog");
  console.log("dialog:", (await dlg.innerText()).slice(0, 800));
  await dlg.getByRole("button", { name: /^Make the table/ }).click();
  await until("made", async () => (await dlg.innerText()).includes("was made"), 90000);
  await sleep(1500);
  await shot("01-note-after-made");
  const made = await dlg.innerText();
  console.log("after:", made.slice(0, 600));
  state.tableName = made.match(/“([^”]+)” was made/)?.[1] ?? null;
  await dlg.getByRole("button", { name: "Open the table" }).click();
  await until("the grid", async () => page.url().includes("/data-v2/") && (await page.locator("thead th").count()) > 1, 120000);
  await sleep(4000);
  state.tableUrl = page.url();
  await shot("01-note-after-table");
  save();
}

/** Choose a Radix Select option by the control's accessible name and the option's words. */
async function choose(scope, label, option) {
  const trigger = scope.getByLabel(label).first();
  await trigger.click();
  await sleep(700);
  await page.getByRole("option", { name: option }).first().click();
  await sleep(700);
}

async function askChat(prompt, until_) {
  await goto("/chat");
  await sleep(8000);
  const box = page.locator("textarea").last();
  await box.waitFor({ timeout: 90000 });
  await box.click();
  await page.keyboard.type(prompt);
  await page.keyboard.press("Enter");
  const got = await until("the answer", async () => (await page.locator("main").innerText()).includes(until_), 180000);
  if (!got.v) throw new Error("the chat answer never arrived");
  await sleep(12000); // let the stream settle
}

if (STEP === "chat") {
  if (!state.tableName) throw new Error("run STEP=note first (it makes the table these rows are added to)");
  await askChat(
    "Reply with exactly three markdown bullet points and nothing else. Each bullet is a patient name, then an em dash with spaces around it, then a visit type: Nadia Karimi — Aquatic Therapy; Tom Reyes — Follow-up; Ivy Chen — Initial Evaluation.",
    "Ivy Chen",
  );
  state.chatUrl = page.url();
  await shot("02-chat-before");
  await openRegistryAction(page.getByText("Nadia Karimi").last());
  const dlg = await theDialog();
  await sleep(1000);
  console.log("dialog:", (await dlg.innerText()).slice(0, 500));
  await choose(dlg, "How to read the list", /Split at the dash/);
  await dlg.getByRole("radio", { name: "Add to a table" }).click();
  await sleep(2500);
  await choose(dlg, "Which table to add the rows to", state.tableName);
  await until("the plan", async () => (await dlg.innerText()).includes("From "), 60000);
  await sleep(3000);
  await choose(dlg, "Where Detail goes", "Visit type").catch((e) => console.log("map detail:", String(e).slice(0, 200)));
  await sleep(3000);
  await shot("02-chat-mapping");
  const ask = await until("the enum ask", async () => (await dlg.innerText()).includes("is not one of Visit type"), 30000);
  console.log("enum ask fired:", Boolean(ask.v));
  await shot("02-chat-enum-ask");
  await dlg.getByRole("button", { name: "Add to Visit type" }).click();
  await sleep(4000);
  await shot("02-chat-choice-added");
  // records-ui 0.93.70 still judges a choice column without its options (fixed in the next
  // release); tick its "Import the rest anyway" when it is shown, and say so.
  const goAhead = dlg.getByText("Import the rest anyway");
  if (await goAhead.isVisible().catch(() => false)) {
    console.log("pre-check still shown (0.93.70): ticking Import the rest anyway");
    await goAhead.click();
    await sleep(800);
  }
  const run = dlg.getByRole("button", { name: /^Import 3 rows/ });
  await run.click();
  await until("the report", async () => /landed|written|refused/i.test(await dlg.innerText()), 90000);
  await sleep(2000);
  await shot("02-chat-after-import");
  console.log("report:", (await dlg.innerText()).slice(-700));
  save();
}

async function makeNewTable(prefix) {
  const dlg = await theDialog();
  await sleep(1500);
  await shot(`${prefix}-dialog`);
  console.log("dialog:", (await dlg.innerText()).slice(0, 600));
  await dlg.getByRole("button", { name: /^Make the table/ }).click();
  await until("made", async () => (await dlg.innerText()).includes("was made"), 90000);
  await sleep(1500);
  await shot(`${prefix}-after-made`);
  const made = await dlg.innerText();
  console.log("after:", made.slice(0, 600));
  return dlg;
}

if (STEP === "csv") {
  const csv = [
    "Room,Floor,Equipment,Opens",
    "Gym A,1,Parallel bars,7:00 AM",
    "Gym B,1,Treadmill,7:00 AM",
    "Aquatic pool,Lower,Pool lift,8:30 AM",
    "Private room 3,2,Treatment table,8:00 AM",
  ].join("\n");
  const box = await newNote(csv);
  await shot("03-csv-before");
  await openRegistryAction(box, { x: 120, y: 40 });
  const dlg = await makeNewTable("03-csv");
  await dlg.getByRole("button", { name: "Open the table" }).click();
  await until("the grid", async () => page.url().includes("/data-v2/") && (await page.locator("thead th").count()) > 1, 120000);
  await sleep(4000);
  state.csvTableUrl = page.url();
  await shot("03-csv-after-table");
  save();
}

if (STEP === "canvas") {
  await askChat(
    "Make a markdown table of 4 balance exercises for knee rehab with the columns Exercise, Body area, Sets and Reps. Only the table.",
    "Reps",
  );
  state.canvasChatUrl = page.url();
  await sleep(4000);
  await shot("04-canvas-before");
  const saveTo = page.getByRole("button", { name: "Save this table to…" }).last();
  await saveTo.scrollIntoViewIfNeeded();
  const down = await saveTo.boundingBox();
  await saveTo.click();
  await sleep(1200);
  await shot("04-canvas-menu");
  await page.getByRole("menuitem", { name: /^A table/ }).first().click();
  const dlg = await makeNewTable("04-canvas");
  await dlg.getByRole("button", { name: "Done" }).click().catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  const live = await until("the artifact is live", async () => (await page.locator("main").innerText()).includes("This table is live now") || (await page.getByRole("button", { name: /New record/ }).count()) > 0, 60000);
  console.log("artifact live:", Boolean(live.v), down ? "" : "");
  await sleep(5000);
  await shot("04-canvas-after-live");
  save();
}

if (STEP === "table-after") {
  await goto(new URL(state.tableUrl).pathname);
  await until("the grid", async () => (await page.locator("thead th").count()) > 1, 120000);
  await sleep(4000);
  await shot("02-chat-after-table");
  console.log("rows:", (await page.locator("tbody").innerText()).replace(/\s+/g, " ").slice(0, 600));
}

/** Open the one screen from `open`, screenshot it, close it — proof that a surface reaches it. */
async function reachesTheScreen(prefix, open) {
  await open();
  const dlg = await theDialog();
  await sleep(1500);
  await shot(`${prefix}-dialog`);
  console.log(`${prefix}:`, (await dlg.innerText()).split("\n").slice(0, 6).join(" | "));
  await page.keyboard.press("Escape");
  await sleep(1000);
}

if (STEP === "blocks") {
  const fence = "`".repeat(3);
  const text = [
    "## Room hours",
    "",
    `${fence}csv`,
    "Room,Opens",
    "Gym A,7:00 AM",
    "Aquatic pool,8:30 AM",
    fence,
    "",
    `${fence}json`,
    '[{"room":"Gym A","floor":1},{"room":"Aquatic pool","floor":0}]',
    fence,
    "",
    `${fence}json`,
    '{"__kind":"data_table","title":"Therapist caseload","columns":[{"name":"Therapist"},{"name":"Patients"}],"rows":[["Dana Whitfield",12],["Marcus Bell",9]]}',
    fence,
  ].join("\n");
  await newNote(text);
  await sleep(6000);
  await shot("05-blocks-before");
  const saveButtons = page.getByRole("button", { name: /^Save to a table$/ });
  console.log("block buttons:", await saveButtons.count());
  await reachesTheScreen("05-csv-block", () => page.getByTitle("Save to a table").first().click());
  await reachesTheScreen("05-data-table-kind", () => page.getByRole("button", { name: "Save to a table" }).last().click());
  // The JSON block's menu (its own AdvancedMenu): open it, then its "Save to a table…".
  const jsonMenu = page.locator('[data-block-type="json"], [data-json-block]').first();
  console.log("json block present:", await jsonMenu.count());
}

if (STEP === "json-block") {
  // The note from STEP=blocks is the newest "Room hours" note; the JSON block's own menu is the ⋯
  // at the right of its header.
  await goto("/notes");
  await sleep(5000);
  await page.getByText("Room hours").first().click();
  await sleep(6000);
  // The JSON block's ⋯ ("More actions") sits at the end of its header, after Copy.
  const clicked = await page.evaluate(() => {
    const compact = document.querySelector('[aria-label="Compact JSON"], [aria-label="Expand JSON"]');
    let box = compact?.parentElement ?? null;
    for (let up = 0; box && up < 6; up += 1, box = box.parentElement) {
      const dots = box.querySelector("svg.lucide-ellipsis, svg.lucide-more-horizontal");
      const btn = dots?.closest("button");
      if (btn) {
        btn.click();
        return true;
      }
    }
    return false;
  });
  console.log("kebab clicked:", clicked);
  await sleep(1500);
  await shot("05-json-block-menu");
  await reachesTheScreen("05-json-block", () => page.getByText("Save to a table…", { exact: true }).first().click());
}

if (STEP === "shapes") {
  await goto("/shapes/wine_tasting/instances");
  await until("the instances", async () => (await page.getByRole("button", { name: /Save to a table/ }).count()) > 0, 120000);
  await sleep(2000);
  await shot("06-shape-instances-before");
  await reachesTheScreen("06-shape-instances", () => page.getByRole("button", { name: /Save to a table/ }).first().click());
}

if (STEP === "chat-dots") {
  await goto(new URL(state.chatUrl).pathname);
  await until("the answer", async () => (await page.locator("main").innerText()).includes("Ivy Chen"), 120000);
  await sleep(4000);
  const more = page.getByRole("button", { name: /More actions|More options|More/i }).last();
  await more.click();
  await sleep(1500);
  await shot("07-chat-dots-menu");
  const direct = page.getByRole("menuitem", { name: /^Save to a table/ }).first();
  if (!(await direct.isVisible().catch(() => false))) {
    await page.getByRole("menuitem", { name: /^Save$/ }).first().hover();
    await sleep(1200);
  }
  await shot("07-chat-dots-save");
  await page.getByRole("menuitem", { name: /^Save to a table/ }).first().click();
  const dlg = await theDialog();
  await sleep(1200);
  await shot("07-chat-dots-dialog");
  console.log("chat dots:", (await dlg.innerText()).split("\n").slice(0, 5).join(" | "));
}

if (STEP === "agent") {
  await askChat(
    "Use your records tool to save these rows as a NEW table named 'Front desk supplies' in this organization, with import_propose: Item: Intake forms, Count: 200; Item: Ice packs, Count: 40; Item: Resistance bands, Count: 25. Then tell me what the tool answered.",
    "Front desk supplies",
  );
  await sleep(20000);
  state.agentChatUrl = page.url();
  await shot("08-agent-import");
  console.log("agent said:", (await page.locator("main").innerText()).slice(-900));
  save();
}

if (STEP === "explore") {
  await goto(process.env.PATHNAME ?? "/notes");
  await sleep(8000);
  await shot("explore");
}

console.log(JSON.stringify({ step: STEP, state, errors }, null, 2));
await browser.close();
