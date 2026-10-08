// "Database with AI" saves (round 29, item 2): a new page, "/" → Database with AI, a request, then wait for
// the designed table's block. Records the room trace (space-collab.ts `trace`: host, cadence, schedule,
// save) and every space_save request. Exit 1 when the typed line or the database block is not saved within
// FIRST_SAVE_MS (default 4000) of the change.
//   MEMBER=1 SPACES_WALK_ORG="Ashford Labs" node features/spaces/__tests__/walk/ai-database-save.walk.mjs
import { open, newPage, slash, act, shot, trashPage } from "./lib.mjs";
import { formatDurationMs } from "@ai-matrx/kit/format";

const FIRST_SAVE_MS = Number(process.env.FIRST_SAVE_MS ?? 4000);
const { browser, context, page } = await open({ member: !!process.env.MEMBER, width: 1440, height: 1000 });
await context.addInitScript(() => {
  window.__spacesCollabTrace = [];
});
const saves = [];
page.on("request", (r) => {
  if (r.url().includes("space_save")) saves.push({ t: Date.now(), method: r.method() });
});
const landed = [];
page.on("response", (r) => {
  if (r.url().includes("space_save") && r.request().method() === "POST") landed.push({ t: Date.now(), status: r.status() });
});
page.on("response", (r) => { if (/table_declare|assoc_link|field_declare|space_save|agents|run/.test(r.url()) && !/_next/.test(r.url())) console.log("[net]", r.status(), r.url().split("?")[0].slice(-70)); });
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 240));
});
const id = await newPage(page);
const opened = Date.now();
console.log("page", id);
await act(page, async () => {
  await page.locator(".bn-editor .bn-inline-content").last().click();
  await page.keyboard.type("Clients we work with", { delay: 20 });
});
const typedAt = Date.now();
await page.waitForTimeout(6000);
const typedSave = saves.find((s) => s.method === "POST" && s.t >= typedAt);
console.log("typed text saved after", typedSave ? typedSave.t - typedAt : null, "ms");
await act(page, async () => {
  await page.keyboard.press("Enter");
  await slash(page, "Database with AI");
});
const box = page.getByRole("textbox", { name: "What to track" });
await box.waitFor({ timeout: 15_000 });
await act(page, async () => {
  await box.fill("Clients with status, retainer and start date");
  await page.getByRole("button", { name: /^Create$/ }).click();
});
// "<name> is ready" — the moment the designer reports done (the walk that lost a page quit right after it).
const made = await page.getByText(/ is ready$/).first().waitFor({ timeout: 240_000 }).then(() => true, () => false);
const blockAt = Date.now();
console.log("database block:", made, "after", formatDurationMs(blockAt - opened, { style: "compact" }));
// A person who closes the tab (or whose walk ends) a moment after "ready" must not lose the block: the
// save has to have LANDED within QUIT_MS of the block appearing (a closed browser fires no pagehide).
await page.waitForTimeout(Number(process.env.QUIT_MS ?? 1200));
const dbLanded = landed.find((l) => l.t >= blockAt - 3000 && l.status < 300);
console.log("database save landed before quitting:", dbLanded ? `${dbLanded.t - blockAt} ms` : "NO");
await page.waitForTimeout(Number(process.env.WAIT ?? 3000));
await shot(page, process.env.SHOT ?? "/tmp/ai-database-save.png");
const trace = await page.evaluate(() => window.__spacesCollabTrace);
for (const e of trace) if (e.ev !== "body") console.log("   trace", JSON.stringify(e));
console.log("saves", JSON.stringify(saves.map((s) => ({ ms: s.t - opened, method: s.method }))));
const firstSave = dbLanded;
if (!process.env.KEEP) console.log("trashed:", await trashPage(page));
await browser.close();
const bad = !made || !typedSave || typedSave.t - typedAt > FIRST_SAVE_MS || !firstSave;
console.log(bad ? "FAIL" : "PASS", firstSave ? `database saved ${firstSave.t - blockAt} ms after it appeared` : "database not saved in time");
process.exit(bad ? 1 : 0);
