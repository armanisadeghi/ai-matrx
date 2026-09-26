// scripts/bigvalueswrite-walk.mjs — lane BIG-VALUES-WRITE headless proof on the shared preview (live DB).
//
// admin@admin.com's own disposable "Brightline Heating & Air — Policies" (scripts/bigvalueswrite-setup.mjs;
// archived after). In the records-ui Grid, as a person:
//   1. open the "Policy text" cell of "Records retention and destruction", put the ~200 KB policy in it, save;
//   2. the save is ONE record_update that answers ok (no "one value in a record holds at most" refusal);
//   3. after a reload the cell shows the policy's first words (its head), and — once the follower has
//      filed the whole text — "Open the whole text";
//   4. zero console errors.
//   READ_ONLY=1 skips 1-2 (a later look at the same row once its file exists).
//
//   TABLE=<id> ORIGIN=http://big-values-write.localhost:3001 OUT=<dir> node scripts/bigvalueswrite-walk.mjs
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { signIn, until } from "./lib/seat-browser.mjs";
import { policyText } from "./bigvalueswrite-policy.mjs";

const ORIGIN = process.env.ORIGIN ?? "http://big-values-write.localhost:3001";
const TABLE = process.env.TABLE;
const ROW = process.env.ROW ?? "Records retention and destruction";
const OUT = process.env.OUT ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-25/big-values";
if (!TABLE) throw new Error("TABLE is required");
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const POLICY = policyText();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const writes = [];
page.on("response", async (r) => {
  const m = r.url().match(/\/rpc\/(record_update|record_write)\b/);
  if (m && r.request().method() === "POST") writes.push({ door: m[1], status: r.status(), body: (await r.text().catch(() => "")).slice(0, 400) });
});
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 200)));
const row = () => page.locator("tbody tr").filter({ hasText: ROW }).first();
async function open() {
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await until("row", () => row().isVisible(), 180000);
  await page.waitForTimeout(2500);
}
try {
  const who = await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  check("seat", who === "admin@admin.com", who);
  await open();
  if (!process.env.READ_ONLY) {
  await page.screenshot({ path: `${OUT}/0-before.png` });
  const target = row().locator(`td[data-matrx-cell-col="policy_text"] [aria-label="Edit Policy text"]`).first();
  check("0-cell-found", await target.count(), `aria-label ${await target.getAttribute("aria-label").catch(() => null)}`);
  await target.click();
  const box = await until("editor", async () => {
    const t = page.locator("tbody textarea, tbody input[type=text], [data-matrx-cell-control] textarea").first();
    return (await t.isVisible().catch(() => false)) ? t : null;
  }, 20000);
  if (!box.v) throw new Error("no editor opened on the Policy text cell");
  await box.v.fill(POLICY); // what a paste does to the box
  check("1-pasted", (await box.v.inputValue()).length === POLICY.length, `${Buffer.byteLength(POLICY)} bytes, ${POLICY.length} characters in the box`);
  await page.screenshot({ path: `${OUT}/1-pasted-in-the-cell.png` });
  writes.length = 0;
  await box.v.press("ControlOrMeta+Enter");
  await until("write", () => writes.length > 0, 60000);
  await page.waitForTimeout(3000);
  const w = writes[0];
  check("2-one-write-answers-ok", writes.length === 1 && w?.status === 200 && !/at most|value_max_bytes/.test(w?.body ?? ""), `${writes.map((x) => `${x.door} ${x.status}`).join(", ") || "none"}; ${w?.body?.slice(0, 160) ?? ""}`);
  const refusal = await page.locator("[data-refusal-notice]").first().isVisible().catch(() => false);
  check("2b-no-refusal-on-screen", !refusal, refusal ? await page.locator("[data-refusal-notice]").first().innerText() : "none");
  await page.screenshot({ path: `${OUT}/2-saved.png` });
  await open();
  }
  const cellText = (await row().innerText()).replace(/\s+/g, " ");
  check("3-reload-shows-the-policy-head", cellText.includes("Records Retention and Destruction Policy") && cellText.includes("Effective January 1, 2027"), cellText.slice(0, 200));
  const link = row().getByText(/Open the whole text/).first();
  const linked = await until("whole-text link", () => link.isVisible(), Number(process.env.LINK_WAIT_MS ?? 30000));
  results.push({ name: "3b-open-the-whole-text (needs the follower on the live server)", ok: null, detail: linked.v ? "drawn" : "not drawn yet" });
  console.log(`INFO 3b-open-the-whole-text — ${linked.v ? "drawn" : "not drawn yet"}`);
  if (linked.v) {
    const a = row().locator("[data-whole-value-file] a, a").filter({ hasText: /Open the whole text/ }).first();
    const href = (await a.count()) ? await a.getAttribute("href") : null;
    results.push({ name: "3c-link", ok: !!href, detail: href ?? "no href" });
    console.log(`${href ? "PASS" : "FAIL"} 3c-link — ${href}`);
  }
  await page.screenshot({ path: `${OUT}/${process.env.READ_ONLY ? "4-after-the-file-was-written" : "3-after-reload"}.png` });
} catch (err) {
  check("walk", false, String(err).slice(0, 400));
  await page.screenshot({ path: `${OUT}/error.png` }).catch(() => {});
} finally {
  check("console-errors", consoleErrors.length === 0, consoleErrors.length ? consoleErrors.join(" || ").slice(0, 600) : "none");
  writeFileSync(`${OUT}/walk.json`, JSON.stringify({ origin: ORIGIN, table: TABLE, at: new Date().toISOString(), results }, null, 2));
  await browser.close();
}
process.exit(results.every((r) => r.ok !== false) ? 0 : 1);
