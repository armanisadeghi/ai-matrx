// IMPORT-2 — the pictures for the second defect. Rincon Plumbing Co keeps a worked-out
// "Ticket summary" column on its dispatch board. The office changes its mind about what the
// summary should lead with, and the store now actually stores that change: BEFORE and AFTER,
// on the real Grid, over the real doors, as admin@admin.com.
//
// The fixture is built first (a Rincon organization whose record store is on at that instant —
// a peer lane is flipping those switches tonight, so it is probed, never flipped by this lane).
//
//   node scripts/campaign-tests/import2-shots-field.mjs --org <uuid> --table <uuid> --field <uuid> --service <uuid> --job <uuid> [--out <dir>]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { signedInClient } from "./use-cases/_client.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const OUT = arg("--out", "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22");
const ORG = arg("--org"), TABLE = arg("--table"), FIELD = arg("--field");
const SERVICE = arg("--service"), JOB = arg("--job");
if (!ORG || !TABLE || !FIELD) { console.error("--org --table --field --service --job are required"); process.exit(2); }
const ORIGIN = "http://127.0.0.1:3049";
mkdirSync(OUT, { recursive: true });

const { client } = await signedInClient();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const shot = async (name, note) => {
  const at = resolve(OUT, `import2-${name}.png`);
  await page.screenshot({ path: at, fullPage: true });
  console.log(`  ${at}  — ${note}`);
};

await page.goto(`${ORIGIN}/?demo=grid&table=${TABLE}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);
await shot("7-the-summary-as-the-office-first-wrote-it", "ticket number first, then the service");

// THE OFFICE CHANGES ITS MIND. One patch carrying ONLY the formula — the patch this door used
// to accept, report success for, and throw away.
// A peer lane is turning these organizations' record stores off and on all night; this waits
// for the switch rather than flipping it, because it is not this lane's switch.
let error = null;
for (let tries = 0; tries < 40; tries += 1) {
  ({ error } = await client.schema("custom").rpc("field_update", {
    p_organization_id: ORG, p_field_id: FIELD,
    p_patch: { expr: { op: "concat", args: [{ field: SERVICE }, { const: " · " }, { field: JOB }] } },
  }));
  if (!error) break;
  if (error.code !== "42501") break;
  await new Promise((r) => setTimeout(r, 8000));
}
if (error) { console.error("field_update refused:", error.code, error.message); process.exit(1); }
console.log("  the formula was changed through custom.field_update, with nothing but expr in the patch");

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);
await shot("8-the-summary-after-the-office-changed-the-formula", "service first — the change the door used to swallow");

await browser.close();
console.log("done");
