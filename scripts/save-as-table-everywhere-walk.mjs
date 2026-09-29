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
const STATE = join(SHOTS, "walk-state.json");
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
  await page.getByRole("button", { name: /Resume/ }).first().click().catch(() => {});
  await sleep(6000);
}

async function goto(path) {
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 300000 });
  await unpark();
  if (page.url().includes("__dev-walk")) await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 300000 });
}

// The walk cap parks an idle preview host; ask its Resume from the page itself before signing in.
await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 300000 }).catch(() => {});
await page
  .evaluate(async () => {
    const body = new FormData();
    body.set("returnTo", "/login");
    return (await fetch("/__dev-walk", { method: "POST", body, redirect: "manual" })).status;
  })
  .catch(() => null);
await sleep(4000);
const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
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
  console.log("after:", (await dlg.innerText()).slice(0, 600));
  await dlg.getByRole("button", { name: "Open the table" }).click();
  await until("the grid", async () => page.url().includes("/data-v2/") && (await page.locator("thead th").count()) > 1, 120000);
  await sleep(4000);
  state.tableUrl = page.url();
  await shot("01-note-after-table");
  save();
}

if (STEP === "explore") {
  await goto(process.env.PATHNAME ?? "/notes");
  await sleep(8000);
  await shot("explore");
}

console.log(JSON.stringify({ step: STEP, state, errors }, null, 2));
await browser.close();
