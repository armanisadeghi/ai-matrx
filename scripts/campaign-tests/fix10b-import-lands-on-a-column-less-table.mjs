// FIX-10B — VERIFIER-10 F2, proven end to end through the store's own client doors.
//
// THE USE CASE, NAMED. Rincon Plumbing Co's office is moving Truck 2 — Alvarado's dispatch
// backlog out of the old scheduling spreadsheet and into a table they just made. The table has
// no columns yet, the spreadsheet has eight, and the person answers the screen's own question
// with "columns this table does not have → are added straight away". That is the exact walk
// VERIFIER-10 made on 2026-09-22, and it landed ZERO rows and then refused the file forever.
//
// WHAT THIS ASSERTS (each one fails loudly, with the real numbers, and exits 1)
//   1. pass 1 on a column-less table CREATES the eight columns AND LANDS ALL 1,000 ROWS.
//      Against the bodies before this lane, this is the assertion that goes red: the columns
//      were made by io_import_finish, one call AFTER every row had been refused against their
//      absence — "0 landed · 1000 refused".
//   2. the same file offered again says it was ALREADY IMPORTED, with the TRUE count (1000),
//      and writes nothing. (The guard that exists to stop DOUBLE writing must still work.)
//   3. a run that lands NOTHING is not remembered: a file whose every row is refused can be
//      offered again and is not blocked. Against the old body this is the second red.
//
// Seat: admin@admin.com through supabase-js. Nothing is hard-deleted: the table this makes is
// archived with custom.table_archive at the end, contents and all.
//
//   node scripts/campaign-tests/fix10b-import-lands-on-a-column-less-table.mjs [--keep]
import { createHash } from "node:crypto";
import { signedInClient } from "./use-cases/_client.mjs";

const ORG = "6069a466-1445-42df-a64e-cf37ecdc1b99"; // Rincon Plumbing Co
const HOME = "7e56a871-971e-4122-9652-145b0d14efe1"; // the home its dispatch tables live in
const KEEP = process.argv.includes("--keep");

const { client } = await signedInClient();
const call = async (fn, args) => {
  const { data, error } = await client.schema("custom").rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.code ?? ""} ${error.message}`.trim());
  return Array.isArray(data) ? data[0] : data;
};

const failures = [];
const check = (ok, what, saw) => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${what}${saw === undefined ? "" : ` — ${saw}`}`);
  if (!ok) failures.push(`${what} — ${saw}`);
};

// ── THE SPREADSHEET. Truck 2 — Alvarado's real backlog shape: eight columns a plumbing
//    dispatcher actually keeps, Ventura-County streets, a real job lifecycle, real money-free
//    service names. Synthesised customers; never a real person.
const STREETS = ["Ventura Ave", "Telegraph Rd", "Petit Ave", "Loma Vista Rd", "Victoria Ave",
  "Foothill Rd", "Wells Rd", "Saticoy Ave", "Darling Rd", "Olivas Park Dr", "Bristol Rd",
  "Kimball Rd", "Johnson Dr", "Seaward Ave", "Thompson Blvd"];
const CITIES = ["Ventura", "Oxnard", "Camarillo", "Santa Paula", "Ojai", "Port Hueneme"];
const SERVICES = ["Drain Cleaning", "Water Heater Replacement", "Slab Leak Repair",
  "Sewer Camera Inspection", "Whole-House Repipe", "Fixture Install", "Backflow Test",
  "Emergency Callout"];
const STATUSES = ["Scheduled", "In Progress", "Completed", "Invoiced"];
const CREWS = ["Truck 2 — Alvarado", "Truck 2 — Alvarado / Ruiz"];
const LAST = ["Alcantar", "Brannigan", "Castellanos", "Dolan", "Eguchi", "Fennimore", "Gallardo",
  "Hollingsworth", "Ibarra", "Jessup", "Kalinowski", "Lindqvist", "Madrigal", "Nakashima",
  "Olivares", "Pankhurst", "Quintanilla", "Rosenbaum", "Suriano", "Thibodeaux"];
const FIRST = ["Ana", "Brett", "Celia", "Devon", "Elena", "Franklin", "Gina", "Hector", "Imani",
  "Jarrod", "Kenji", "Lourdes", "Marcus", "Nadia", "Omar", "Priya", "Quincy", "Rosa", "Samir", "Tessa"];
const NOTES = [
  "Gate code at the alley side; dog is friendly but loud.",
  "Second-floor unit — carry the drum snake up the outside stair.",
  "Tenant works nights, do not arrive before 11am.",
  "Shutoff is behind the oleander on the north wall.",
  "Prior visit left the cleanout cap loose; bring a replacement.",
  "Property manager wants photos before and after.",
  "Park on the street, the driveway is being resurfaced.",
  "Confirm with the office before opening the wall.",
];

const HEADERS = ["Job Number", "Customer", "Service Address", "Service Type", "Scheduled Date",
  "Crew", "Status", "Notes"];

const stamp = Date.now();
const rows = [];
for (let i = 0; i < 1000; i += 1) {
  const day = new Date(Date.UTC(2026, 8, 1 + (i % 28)));
  rows.push({
    "Job Number": `RPC-T2-${7000 + i}`,
    Customer: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
    "Service Address": `${1200 + ((i * 13) % 4800)} ${STREETS[i % STREETS.length]}, ${CITIES[(i * 3) % CITIES.length]} CA`,
    "Service Type": SERVICES[i % SERVICES.length],
    "Scheduled Date": day.toISOString().slice(0, 10),
    Crew: CREWS[i % CREWS.length],
    Status: STATUSES[(i * 5) % STATUSES.length],
    Notes: NOTES[(i * 3) % NOTES.length],
  });
}
const csv = [HEADERS.join(","), ...rows.map((r) => HEADERS.map((h) => `"${String(r[h]).replace(/"/g, '""')}"`).join(","))].join("\n");
// The run's identity is the sha-256 of the file's bytes, exactly as ImportWizard computes it.
// The stamp keeps THIS run's file distinct from the last run's; the point under test is the
// SAME bytes offered twice, which happens below.
const fileHash = createHash("sha256").update(`${csv}\n# ${stamp}`).digest("hex");
const fileName = "truck-2-dispatch-backlog.csv";

console.log(`FIX-10B / VERIFIER-10 F2 — Rincon Plumbing Co, Truck 2 — Alvarado backlog (${rows.length} rows, 8 columns)`);

// ── A TABLE WITH NO COLUMNS, made the way the seat makes one.
const tableId = await call("table_declare", {
  p_organization_id: ORG,
  p_spec: {
    name: `Truck 2 dispatch backlog (${new Date(stamp).toISOString().slice(0, 16).replace("T", " ")}Z)`,
    slug: `truck_2_dispatch_backlog_${stamp}`.slice(0, 60),
    type: "entity",
    display: "list",
    weight: "light",
    ordered: false,
    row_order: "manual",
    title_field: "title",
    label_singular: "dispatch ticket",
    label_plural: "dispatch tickets",
    retention_days: 365,
    agent_writable: true,
    default_sort: [{ field: "title", direction: "asc" }],
    parent_id: HOME,
    fields: [{ name: "title" }],
  },
});
console.log(`table ${tableId}`);

async function importFile(hash, label) {
  const opened = await call("io_import_begin", {
    p_organization_id: ORG,
    p_table_id: tableId,
    p_format: "csv",
    p_source_name: fileName,
    p_source_columns: HEADERS,
    p_file_hash: hash,
    p_policy: { on_duplicate: "skip", unmapped: "create" },
    p_dedupe_key: null,
    p_file_bytes: csv.length,
    p_force: false,
  });
  console.log(`  ${label}: ${opened.message}`);
  if (opened.already) return { opened, landed: 0, refused: 0, columnsAdded: 0 };
  let landed = 0, refused = 0, columnsAdded = 0;
  for (let at = 0; at < rows.length; at += 250) {
    const out = await call("io_import_rows", {
      p_organization_id: ORG,
      p_import_id: opened.import_id,
      p_rows: rows.slice(at, at + 250),
      p_mapping: {},
    });
    landed += out.rows_written;
    refused += out.rows_refused;
    columnsAdded += (out.columns_added ?? []).filter((c) => c.state === "accepted").length;
  }
  const finished = await call("io_import_finish", {
    p_organization_id: ORG, p_import_id: opened.import_id, p_unmapped: "create",
  });
  console.log(`  ${label}: ${finished.message}`);
  return { opened, landed, refused, columnsAdded, finished };
}

// ── 1. THE FIRST PASS INTO A COLUMN-LESS TABLE.
const first = await importFile(fileHash, "pass 1");
check(first.columnsAdded === 8, "pass 1 creates the eight columns the file has and this table has not",
      `${first.columnsAdded} created`);
check(first.landed === 1000, "pass 1 LANDS every row, because the write waited for those columns",
      `${first.landed} landed · ${first.refused} refused`);

const { data: liveRows, error: cErr } = await client.schema("custom")
  .rpc("read_records", { p_organization_id: ORG, p_table_id: tableId, p_limit: 1, p_offset: 0 })
  .then((r) => ({ data: r.data, error: r.error }), (e) => ({ data: null, error: e }));
if (!cErr && Array.isArray(liveRows) && liveRows[0]) {
  const sample = liveRows[0].data ?? liveRows[0];
  console.log(`  a landed row: ${JSON.stringify(sample).slice(0, 220)}`);
}

// ── 2. THE SAME BYTES AGAIN. The double-write guard must still hold, and must say the TRUE count.
const second = await importFile(fileHash, "pass 2 (same file)");
check(second.opened.already === true, "the same file offered again is refused as already imported",
      `already=${second.opened.already}`);
check(second.opened.rows_written === 1000, "and it names the TRUE count that landed the first time",
      `says ${second.opened.rows_written} landed`);

// ── 3. A RUN THAT LANDS NOTHING IS NOT REMEMBERED. Every row of this file is blank, so nothing
//       can land; offering it a second time must still be possible.
const emptyRows = Array.from({ length: 5 }, () => ({}));
const emptyHash = createHash("sha256").update(`blank-rows-${stamp}`).digest("hex");
async function emptyRun(label) {
  const opened = await call("io_import_begin", {
    p_organization_id: ORG, p_table_id: tableId, p_format: "csv",
    p_source_name: "blank-rows.csv", p_source_columns: HEADERS,
    p_file_hash: emptyHash, p_policy: { on_duplicate: "skip", unmapped: "propose" },
    p_dedupe_key: null, p_file_bytes: 0, p_force: false,
  });
  if (opened.already) { console.log(`  ${label}: ${opened.message}`); return opened; }
  await call("io_import_rows", { p_organization_id: ORG, p_import_id: opened.import_id, p_rows: emptyRows, p_mapping: {} });
  await call("io_import_finish", { p_organization_id: ORG, p_import_id: opened.import_id, p_unmapped: "ignore" });
  console.log(`  ${label}: opened and landed nothing`);
  return opened;
}
await emptyRun("zero-landing run");
const retry = await emptyRun("the same zero-landing file again");
check(retry.already === false, "a run that landed NOTHING is not remembered as an import of that file",
      `already=${retry.already}`);

// ── CLEANUP. Soft, through the new primitive, never a delete.
if (!KEEP) {
  let pass = await call("table_archive", { p_organization_id: ORG, p_table_id: tableId, p_chunk: 0, p_include_table: true });
  while (!pass.done) {
    pass = await call("table_archive", { p_organization_id: ORG, p_table_id: tableId, p_chunk: 50, p_include_table: true });
  }
  console.log(`cleanup: ${pass.message}`);
}

if (failures.length) {
  console.error(`\nRED — ${failures.length} assertion(s) failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nGREEN — a CSV lands on a table that has none of its columns, the same file is refused once with the true count, and a run that landed nothing is not remembered.");
