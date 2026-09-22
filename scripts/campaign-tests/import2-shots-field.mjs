// IMPORT-2 — the pictures for the second defect, on the real Grid over the real doors.
//
// THE USE CASE. Rincon Plumbing Co keeps a worked-out "Ticket summary" column on its dispatch
// board: the ticket number, then the service. In September the office decides the summary
// should lead with the SERVICE instead, so the dispatcher edits the formula. Before this lane
// the store answered "saved" and kept yesterday's formula — `expr` was read only inside
// custom.field_update's behaviour arm, so a patch without a type word beside it was dropped.
//
// TRANSPORT. Every call goes through @ai-matrx/records-ui's own demo harness lane
// (`demo/branch-server.ts`), which is how every page of that harness reads and writes: the
// store's real doors, the real bodies, the harness's own connection. It is used here rather
// than a signed-in supabase-js client because a peer lane is closing the record-store switch
// on every Rincon organization within about a minute of use tonight, and this lane does not
// flip a switch that belongs to another lane.
//
//   node scripts/campaign-tests/import2-shots-field.mjs --org <uuid> [--out <dir>]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const OUT = arg("--out", "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22");
const ORG = arg("--org");
if (!ORG) { console.error("--org <uuid> is required"); process.exit(2); }
const ORIGIN = "http://127.0.0.1:3049";
mkdirSync(OUT, { recursive: true });

const call = async (fn, args) => {
  const r = await fetch(`${ORIGIN}/__branch/rpc`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ fn, args: { p_organization_id: ORG, ...args } }),
  });
  const payload = await r.json();
  if (payload.error) throw new Error(`${fn}: ${payload.error.code ?? ""} ${payload.error.message}`);
  return payload.data;
};

const home = await call("record_write", { p_table_id: "11111111-0000-4000-8000-000000000005", p_data: { name: "Dispatch" } });
const stamp = Date.now();
const TABLE = await call("table_declare", { p_spec: {
  name: "Ticket summaries", slug: `ticket_summaries_${stamp}`.slice(0, 60),
  type: "entity", display: "list", weight: "light", ordered: false, row_order: "manual",
  title_field: "title", label_singular: "service ticket", label_plural: "service tickets",
  retention_days: 365, agent_writable: true,
  default_sort: [{ field: "title", direction: "asc" }], parent_id: home, fields: [{ name: "title" }] } });
const JOB = await call("field_declare", { p_table_id: TABLE, p_spec: { key: "job_number", label: "Job Number", plain: "text", sort: 10 } });
const SERVICE = await call("field_declare", { p_table_id: TABLE, p_spec: { key: "service_type", label: "Service Type", plain: "text", sort: 20 } });
const FIELD = await call("field_declare", { p_table_id: TABLE, p_spec: {
  key: "ticket_summary", label: "Ticket summary", type: "formula", sort: 30, compute_on: "read",
  depends_on: [JOB, SERVICE],
  expr: { op: "concat", args: [{ field: JOB }, { const: " — " }, { field: SERVICE }] } } });
for (const [job, service] of [
  ["RPC-SEP-41900", "Backflow Test"], ["RPC-SEP-41901", "Drain Cleaning"],
  ["RPC-SEP-41902", "Water Heater Replacement"], ["RPC-SEP-41903", "Slab Leak Repair"],
  ["RPC-SEP-41904", "Sewer Camera Inspection"], ["RPC-SEP-41905", "Emergency Callout"]]) {
  await call("record_write", { p_table_id: TABLE, p_data: { title: job, job_number: job, service_type: service } });
}
console.log(`  table ${TABLE} · ticket_summary ${FIELD}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const shot = async (name, note) => {
  const at = resolve(OUT, `import2-${name}.png`);
  await page.screenshot({ path: at, fullPage: true });
  console.log(`  ${at}  — ${note}`);
};

await page.goto(`${ORIGIN}/?demo=grid&table=${TABLE}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(20000);
await shot("7-the-summary-as-the-office-first-wrote-it", "ticket number first, then the service");

// THE OFFICE CHANGES ITS MIND. One patch carrying ONLY the formula — the patch this door used
// to accept, report success for, and throw away.
await call("field_update", { p_field_id: FIELD,
  p_patch: { expr: { op: "concat", args: [{ field: SERVICE }, { const: " · " }, { field: JOB }] } } });
console.log("  the formula was changed through custom.field_update, with nothing but expr in the patch");

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(20000);
await shot("8-the-summary-after-the-office-changed-the-formula", "service first — the change the door used to swallow");

await browser.close();
console.log("done");
