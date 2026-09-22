/**
 * OLD-TABLES-2 — W4's headless proof: the same seat, the same table, both knob states.
 *
 * `data_tables.relation.relation_columns_enabled` is default OFF. This walk opens the
 * "Add column" dialog's "Shows as" picker on Rincon Plumbing & Drain's dispatch board and
 * captures the list BEFORE and AFTER admin's Workspace turns the feature on through its own
 * `platform.knob_override` row.
 *
 * The state is flipped by the caller between the two passes (see the runner beside it), not
 * by this script: a walk that writes its own settings is a walk that proves its own premise.
 *
 *   node scripts/oldtables2-knob-shots.mjs before
 *   node scripts/oldtables2-knob-shots.mjs after
 */
import { chromium } from "playwright";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";

const PHASE = process.argv[2] === "after" ? "after" : "before";
const ORIGIN = "http://127.0.0.1:3054";
const CALLS = "dbc7cd48-7b46-4402-ac9d-e459a95f4598";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-23";
mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  const nonce = randomBytes(16).toString("hex");
  writeFileSync("/Users/armanisadeghi/code/matrx-frontend/.dev-login-nonce.127.0.0.1", `${nonce}\n`);
  await page.goto(
    `${ORIGIN}/api/dev-login?nonce=${nonce}&next=${encodeURIComponent(`/data/${CALLS}?ps=50`)}`,
    { waitUntil: "domcontentloaded", timeout: 240000 },
  );
  await page.waitForFunction(() => document.body.innerText.includes("WO-4471"), null, { timeout: 240000 });
  await page.waitForTimeout(2500);

  await page.locator('button:has-text("Column")').first().click();
  await page.waitForTimeout(1500);
  // The format select inside the dialog, under the "Shows as" caption.
  // "Add New Column" — by its own heading, not by "the first dialog", because the
  // app mounts more than one and the first cut of this walk read the ORGANIZATION
  // SWITCHER's 79 options and concluded the format picker offers no Relation:
  // true by accident, for the wrong reason.
  const dialog = page.locator('[role="dialog"]:has-text("Add New Column")').first();
  const combos = dialog.locator('[role="combobox"]');
  const n = await combos.count();
  await combos.nth(n - 1).click();
  await page.waitForTimeout(1500);

  // THE FORMAT LIST IS THE ONE THAT DESCRIBES A FORMAT. Identified by its own
  // content, so no selector guess about portals or wrappers can pick another.
  const options = await page.evaluate(() => {
    const lists = Array.from(document.querySelectorAll('[role="listbox"]'));
    const list = lists.find((el) => (el.textContent || "").includes("Plain single-line text"));
    if (!list) return [];
    return Array.from(list.querySelectorAll('[role="option"]')).map((el) =>
      (el.textContent || "").trim().split("\n")[0].trim(),
    );
  });
  if (options.length === 0) throw new Error("the FORMAT list did not open — nothing to prove");
  // An option's text is its LABEL immediately followed by its description with no
  // separator ("RelationA record of another table — pick it, and its name is
  // shown"), so the test anchors on the label. `^Relation` cannot collide with
  // "Relative time", which diverges at the sixth character.
  const offersRelation = options.some((o) => /^Relation\b|^Relation[A-Z]/.test(o));

  // Scroll the CHOICE group into view before the shot: `Relation` sits below the
  // fold of the open list, and a screenshot of the part of the list that cannot
  // differ between the two states proves nothing to a person reading it.
  // Radix Select owns its own scroll container, so `scrollIntoView` on an item
  // does nothing useful — its TYPEAHEAD does. Typing "choi" walks the list to the
  // Choice group, which is where `Relation` lives and where the two states differ.
  await page.keyboard.type("choi", { delay: 90 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/oldtables2-4-shows-as-${PHASE}-the-override.png` });

  const file = `${OUT}/oldtables2-knob.json`;
  const prior = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  prior[PHASE] = { offersRelation, optionCount: options.length, options, consoleErrors: errors };
  writeFileSync(file, JSON.stringify(prior, null, 2));

  console.log(`[knob:${PHASE}] offers "Relation":`, offersRelation, "· options:", options.length);
  console.log(`[knob:${PHASE}] console errors:`, errors.length);
  await browser.close();
}
main().catch((e) => { console.error("[knob] FAILED:", e.message); process.exit(1); });
