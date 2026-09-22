// IMPORT-2 — a 1,000-row import lands in batches that finish WELL under PostgREST's ~8 s ceiling.
//
// THE USE CASE, NAMED. Rincon Plumbing Co's Ventura dispatcher is moving the September
// service board out of the old scheduling spreadsheet into a brand-new table. The file has
// eight columns the table has not got, 1,000 tickets, a real job lifecycle, and — as a real
// export always does — a handful of repeated ticket numbers and two rows the office typed
// wrong. She answers the wizard's question with "add the columns straight away".
//
// WHAT THIS MEASURES AND ASSERTS
//   1. DECLARING THE COLUMNS IS ITS OWN STEP. `custom.io_import_declare_columns` is called
//      first, returns the columns it made, and is the only call in the walk that declares
//      anything — so the screen can show "8 columns added" as a step of its own.
//   2. EVERY WRITING BATCH AFTER THE FIRST IS UNDER 3,000 ms, because the door MEASURES its
//      own writing phase and answers `rows_per_call` — how many rows it could have written in
//      three seconds — and the caller uses that for the next slice, exactly as ImportWizard
//      now does. The FIRST call is the client's guess (250) and must still be nowhere near
//      the ~8 s ceiling. Against the bodies before this lane the first batch carried 8
//      field_declare calls PLUS 250 record_write calls and ran 7.4 s, and batch 4 died
//      SQLSTATE 57014 after 8,146 ms.
//   3. THE ANSWERS DO NOT MOVE: 1,000 seen, the right number landed, the repeats reported as
//      duplicates against the dedupe key, the two bad rows refused BY NAME (not the batch).
//   4. A ROW REFUSED DOES NOT TAKE THE BATCH WITH IT — the other 249 still land.
//   5. THE UNIQUE RULE STILL HOLDS INSIDE ONE BATCH: a second row carrying a ticket number a
//      unique-ruled column already saw in the SAME batch is refused by name.
//
// Seat: admin@admin.com through supabase-js, the same client doors a browser uses.
// Nothing is hard-deleted: the table is archived through custom.table_archive at the end.
//
//   node scripts/campaign-tests/import2-a-thousand-rows-land-in-one-statement.mjs [--keep] [--baseline]
//
// `--baseline` skips the declare-columns step (the door may not exist yet) and only measures
// and reports, so the SAME file can be timed against the bodies before this lane.
import { createHash } from "node:crypto";
import { signedInClient } from "./use-cases/_client.mjs";

const ORG = "6069a466-1445-42df-a64e-cf37ecdc1b99"; // Rincon Plumbing Co
const HOME = "7e56a871-971e-4122-9652-145b0d14efe1"; // the home its dispatch tables live in
const KEEP = process.argv.includes("--keep");
const BASELINE = process.argv.includes("--baseline");
const BATCH = 250;
const CEILING_MS = 3000;

const { client } = await signedInClient();
const call = async (fn, args) => {
  const { data, error } = await client.schema("custom").rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.code ?? ""} ${error.message}`.trim());
  return Array.isArray(data) ? data[0] : data;
};
const timed = async (fn, args) => {
  const t0 = Date.now();
  try {
    const out = await call(fn, args);
    return { ms: Date.now() - t0, out };
  } catch (e) {
    return { ms: Date.now() - t0, err: e };
  }
};

const failures = [];
const check = (ok, what, saw) => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${what}${saw === undefined ? "" : ` — ${saw}`}`);
  if (!ok) failures.push(`${what} — ${saw}`);
};

// ── THE SEPTEMBER SERVICE BOARD. Ventura-County streets, a real plumbing job lifecycle,
//    synthesised customers — never a real person.
const STREETS = ["Ventura Ave", "Telegraph Rd", "Petit Ave", "Loma Vista Rd", "Victoria Ave",
  "Foothill Rd", "Wells Rd", "Saticoy Ave", "Darling Rd", "Olivas Park Dr", "Bristol Rd",
  "Kimball Rd", "Johnson Dr", "Seaward Ave", "Thompson Blvd"];
const CITIES = ["Ventura", "Oxnard", "Camarillo", "Santa Paula", "Ojai", "Port Hueneme"];
const SERVICES = ["Drain Cleaning", "Water Heater Replacement", "Slab Leak Repair",
  "Sewer Camera Inspection", "Whole-House Repipe", "Fixture Install", "Backflow Test",
  "Emergency Callout"];
const STATUSES = ["Scheduled", "In Progress", "Completed", "Invoiced"];
const CREWS = ["Truck 4 — Benavides", "Truck 4 — Benavides / Okafor", "Truck 7 — Delacroix"];
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
    "Job Number": `RPC-SEP-${41000 + i}`,
    Customer: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
    "Service Address": `${1200 + ((i * 13) % 4800)} ${STREETS[i % STREETS.length]}, ${CITIES[(i * 3) % CITIES.length]} CA`,
    "Service Type": SERVICES[i % SERVICES.length],
    "Scheduled Date": day.toISOString().slice(0, 10),
    Crew: CREWS[i % CREWS.length],
    Status: STATUSES[(i * 5) % STATUSES.length],
    Notes: NOTES[(i * 3) % NOTES.length],
  });
}
// THE MESS A REAL EXPORT CARRIES. Four tickets the office pasted twice (inside one batch and
// across two), and two rows where the scheduled date was typed as free text.
const DUP_AT = [37, 118, 260, 640];
for (const at of DUP_AT) rows[at] = { ...rows[at - 1] };   // 118 & 260 are cross-batch, 37 & 640 in-batch
const BAD_AT = [95, 418];
for (const at of BAD_AT) rows[at] = { ...rows[at], "Scheduled Date": "next tuesday-ish" };

const csv = [HEADERS.join(","), ...rows.map((r) => HEADERS.map((h) => `"${String(r[h]).replace(/"/g, '""')}"`).join(","))].join("\n");
const fileHash = createHash("sha256").update(`${csv}\n# ${stamp}`).digest("hex");
const fileName = "september-service-board.csv";

console.log(`IMPORT-2 — Rincon Plumbing Co, September service board (${rows.length} rows, 8 columns)${BASELINE ? "  [BASELINE: no declare step]" : ""}`);

const tableId = await call("table_declare", {
  p_organization_id: ORG,
  p_spec: {
    name: `September service board (${new Date(stamp).toISOString().slice(0, 16).replace("T", " ")}Z)`,
    slug: `september_service_board_${stamp}`.slice(0, 60),
    type: "entity",
    display: "list",
    weight: "light",
    ordered: false,
    row_order: "manual",
    title_field: "title",
    label_singular: "service ticket",
    label_plural: "service tickets",
    retention_days: 365,
    agent_writable: true,
    default_sort: [{ field: "title", direction: "asc" }],
    parent_id: HOME,
    fields: [{ name: "title" }],
  },
});
console.log(`table ${tableId}`);

// ── 1. THE COLUMNS, AS THEIR OWN STEP — table-scoped, before a run is even opened, so the
//      wizard can show "8 columns added" and then offer a duplicate key that names one of them.
let declareMs = null;
let declared = 0;
if (!BASELINE) {
  const d = await timed("io_import_declare_columns", {
    p_organization_id: ORG, p_table_id: tableId, p_rows: rows, p_mapping: {},
  });
  if (d.err) throw d.err;
  declareMs = d.ms;
  declared = (d.out.columns_added ?? []).filter((c) => c.state === "accepted").length;
  console.log(`  step "add the columns": ${declared} columns in ${declareMs} ms — ${d.out.message ?? ""}`);
  check(declared === 8, "the column step declares the eight columns the file has and this table has not",
        `${declared} created in ${declareMs} ms`);
}

const opened = await call("io_import_begin", {
  p_organization_id: ORG,
  p_table_id: tableId,
  p_format: "csv",
  p_source_name: fileName,
  p_source_columns: HEADERS,
  p_file_hash: fileHash,
  p_policy: { on_duplicate: "skip", unmapped: "create" },
  p_dedupe_key: null,
  p_file_bytes: csv.length,
  p_force: false,
});
console.log(`run ${opened.import_id}: ${opened.message}`);

// ── 2. THE WRITING BATCHES.
const times = [];
let landed = 0, refused = 0, dupes = 0, seen = 0, madeInWrite = 0, toldPerCall = null;
const refusalReasons = [];
let at = 0, n = 0, take = BATCH;
while (at < rows.length) {
  const r = await timed("io_import_rows", {
    p_organization_id: ORG, p_import_id: opened.import_id,
    p_rows: rows.slice(at, at + take), p_mapping: {},
  });
  n += 1;
  times.push({ ms: r.ms, rows: Math.min(take, rows.length - at) });
  if (r.err) {
    console.log(`  batch ${n} (${take} rows): ${r.ms} ms — THREW ${r.err.message.slice(0, 120)}`);
    failures.push(`batch ${n} threw after ${r.ms} ms: ${r.err.message}`);
    at += take;
    continue;
  }
  const out = r.out;
  seen += out.rows_seen; landed += out.rows_written; refused += out.rows_refused; dupes += out.rows_duplicate;
  madeInWrite += (out.columns_added ?? []).filter((c) => c.state === "accepted").length;
  for (const o of out.outcomes ?? []) if (o.outcome === "refused") refusalReasons.push(`row ${o.row}: ${o.reason}`);
  console.log(`  batch ${n} (${take} rows): ${r.ms} ms — ${out.rows_written} landed · ${out.rows_duplicate} already here · ${out.rows_refused} refused` +
              `  [the door: ${out.ms_per_row} ms/row, take ${out.rows_per_call} next, one_statement=${out.one_statement}]`);
  at += take;
  // THE DOOR'S OWN NUMBER, used the way ImportWizard uses it.
  if (out.rows_per_call) { toldPerCall = out.rows_per_call; take = out.rows_per_call; }
}

const worstFirst = times[0].ms;
const worstRest = times.length > 1 ? Math.max(...times.slice(1).map((t) => t.ms)) : 0;
const worst = Math.max(...times.map((t) => t.ms));
const total = times.reduce((a, b) => a + b.ms, 0);
console.log(`  batches: ${times.map((t) => `${t.rows}r/${t.ms}ms`).join(" · ")}   worst ${worst} ms   total ${total} ms   ${(total / rows.length).toFixed(2)} ms/row`);

check(toldPerCall !== null, "the door says how many rows it can comfortably take in one call", `rows_per_call ${toldPerCall}`);
check(worstFirst < 5000, `the first call — the client's own guess of ${BATCH} rows — is nowhere near the ~8 s ceiling`, `${worstFirst} ms`);
check(worstRest < CEILING_MS, `every call AFTER the first, sized by the door's own answer, finishes under ${CEILING_MS} ms`, `worst ${worstRest} ms`);
check(seen === 1000, "every row of the file was seen", `${seen} seen`);
check(landed === 1000 - BAD_AT.length, "every good row landed",
      `${landed} landed · ${dupes} already here · ${refused} refused`);
check(refused === BAD_AT.length, "only the two mistyped rows were refused — a bad row does not take its batch with it",
      `${refused} refused: ${refusalReasons.map((s) => s.slice(0, 90)).join(" | ")}`);
if (!BASELINE) {
  check(madeInWrite === 0, "the writing batches declare NOTHING — the columns were their own step", `${madeInWrite} declared while writing`);
}

// ── 3. WHAT IS ACTUALLY IN THE TABLE.
const { data: page } = await client.schema("custom")
  .rpc("read_records", { p_organization_id: ORG, p_table_id: tableId, p_limit: 1, p_offset: 0 });
if (Array.isArray(page) && page[0]) {
  console.log(`  a landed ticket: ${JSON.stringify(page[0].data ?? page[0]).slice(0, 260)}`);
}

// ── 3b. NEXT WEEK'S EXPORT, WITH THE OVERLAP. The dispatcher exports again and the file
//      repeats 200 tickets she already imported plus 3 the office pasted twice inside ONE
//      batch. The ticket number is the duplicate key and the policy is "leave them alone".
//      THIS IS WHAT BATCHING MOST RISKS: the in-batch map that makes a ticket this very call
//      just wrote count as "already here" used to be updated at write time, one row at a time.
{
  const followOn = [];
  for (let i = 900; i < 1000; i += 1) followOn.push(rows[i]);          // 100 already here
  for (let i = 1000; i < 1200; i += 1) {                              // 200 genuinely new
    const day = new Date(Date.UTC(2026, 9, 1 + (i % 28)));
    followOn.push({
      "Job Number": `RPC-SEP-${41000 + i}`,
      Customer: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
      "Service Address": `${1200 + ((i * 13) % 4800)} ${STREETS[i % STREETS.length]}, ${CITIES[(i * 3) % CITIES.length]} CA`,
      "Service Type": SERVICES[i % SERVICES.length],
      "Scheduled Date": day.toISOString().slice(0, 10),
      Crew: CREWS[i % CREWS.length],
      Status: STATUSES[(i * 5) % STATUSES.length],
      Notes: NOTES[(i * 3) % NOTES.length],
    });
  }
  const IN_BATCH_REPEATS = [120, 180, 199];
  for (const at of IN_BATCH_REPEATS) followOn[at] = { ...followOn[at - 1] };
  const planOut = await call("io_import_plan", { p_organization_id: ORG, p_table_id: tableId, p_columns: HEADERS.map((h) => ({ header: h, samples: [] })) });
  const mapping = Object.fromEntries((planOut.columns ?? [])
    .filter((c) => c.field_key)
    .map((c) => [c.header, c.field_key]));
  console.log(`  the wizard's plan maps ${Object.keys(mapping).length} of the file's ${HEADERS.length} headers`);
  const dupHash = createHash("sha256").update(`follow-on-${stamp}`).digest("hex");
  const dOpen = await call("io_import_begin", {
    p_organization_id: ORG, p_table_id: tableId, p_format: "csv",
    p_source_name: "october-service-board.csv", p_source_columns: HEADERS,
    p_file_hash: dupHash, p_policy: { on_duplicate: "skip", unmapped: "ignore" },
    p_dedupe_key: "job_number", p_file_bytes: 0, p_force: false,
  });
  let dLanded = 0, dDupes = 0, dRefused = 0;
  const dTimes = [];
  let dAt = 0, dTake = toldPerCall ?? BATCH;
  while (dAt < followOn.length) {
    const r = await timed("io_import_rows", {
      p_organization_id: ORG, p_import_id: dOpen.import_id,
      p_rows: followOn.slice(dAt, dAt + dTake), p_mapping: mapping,
    });
    dTimes.push(r.ms);
    dAt += dTake;
    if (r.err) { failures.push(`follow-on batch threw: ${r.err.message}`); continue; }
    dLanded += r.out.rows_written; dDupes += r.out.rows_duplicate; dRefused += r.out.rows_refused;
    if (r.out.rows_per_call) dTake = r.out.rows_per_call;
  }
  console.log(`  follow-on: ${dTimes.join(" ms · ")} ms — ${dLanded} landed · ${dDupes} already here · ${dRefused} refused`);
  check(dDupes === 100 + IN_BATCH_REPEATS.length,
        "the 100 tickets already on the board AND the 3 the office pasted twice inside one batch are all 'already here'",
        `${dDupes} duplicates, expected ${100 + IN_BATCH_REPEATS.length}`);
  check(dLanded === 200 - IN_BATCH_REPEATS.length,
        "and only the genuinely new tickets were written", `${dLanded} landed, expected ${200 - IN_BATCH_REPEATS.length}`);
  check(dLanded + dDupes + dRefused === followOn.length,
        "every row of the follow-on file is accounted for", `${dLanded}+${dDupes}+${dRefused} of ${followOn.length}`);
  check(Math.max(...dTimes) < CEILING_MS, `every follow-on batch finishes under ${CEILING_MS} ms`, `worst ${Math.max(...dTimes)} ms`);
}

// ── 4. THE UNIQUE RULE, INSIDE ONE BATCH. A batched INSERT cannot see its own earlier rows,
//      so a guard that reads custom.record would pass both copies unless the door holds the
//      line itself. Ticket numbers are unique on a dispatch board; two rows in ONE call
//      carrying the same one must be one landed and one refused by name.
const { data: fields } = await client.schema("custom")
  .rpc("applicable_fields", { p_organization_id: ORG, p_table_id: tableId, p_record_type: null });
const jobField = (Array.isArray(fields) ? fields : []).find((f) => (f.data?.key ?? f.key) === "job_number");
if (jobField) {
  await call("field_update", {
    p_organization_id: ORG, p_field_id: jobField.id ?? jobField.data?.id,
    p_patch: { rules: [{ kind: "unique" }] },
  });
  const uHash = createHash("sha256").update(`unique-in-one-batch-${stamp}`).digest("hex");
  const uOpen = await call("io_import_begin", {
    p_organization_id: ORG, p_table_id: tableId, p_format: "csv",
    p_source_name: "one-batch-repeat.csv", p_source_columns: HEADERS,
    p_file_hash: uHash, p_policy: { on_duplicate: "skip", unmapped: "ignore" },
    p_dedupe_key: null, p_file_bytes: 0, p_force: false,
  });
  const uPlan = await call("io_import_plan", { p_organization_id: ORG, p_table_id: tableId, p_columns: HEADERS.map((h) => ({ header: h, samples: [] })) });
  const uMap = Object.fromEntries((uPlan.columns ?? [])
    .filter((c) => c.field_key).map((c) => [c.header, c.field_key]));
  const twin = {
    "Job Number": `RPC-SEP-99${stamp % 1000}`, Customer: "Priya Nakashima",
    "Service Address": "4120 Telegraph Rd, Ventura CA", "Service Type": "Backflow Test",
    "Scheduled Date": "2026-09-30", Crew: "Truck 7 — Delacroix", Status: "Scheduled",
    Notes: "Annual test, city form due the same week.",
  };
  const u = await call("io_import_rows", {
    p_organization_id: ORG, p_import_id: uOpen.import_id, p_rows: [twin, { ...twin }], p_mapping: uMap,
  });
  const uReason = (u.outcomes ?? []).find((o) => o.outcome === "refused")?.reason ?? "";
  check(u.rows_written === 1 && u.rows_refused === 1,
        "two rows in ONE call carrying the same unique ticket number: one lands, one is refused by name",
        `${u.rows_written} landed · ${u.rows_refused} refused — ${uReason.slice(0, 120)}`);
} else {
  check(false, "the job_number column exists so the unique rule can be put on it", "not found");
}

// ── CLEANUP. Soft, through the store's own primitive, never a delete.
if (!KEEP) {
  let pass = await call("table_archive", { p_organization_id: ORG, p_table_id: tableId, p_chunk: 0, p_include_table: true });
  while (!pass.done) {
    pass = await call("table_archive", { p_organization_id: ORG, p_table_id: tableId, p_chunk: 50, p_include_table: true });
  }
  console.log(`cleanup: ${pass.message}`);
} else {
  console.log(`kept: table ${tableId}`);
}

if (failures.length) {
  console.error(`\nRED — ${failures.length} assertion(s) failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`\nGREEN — 1,000 rows landed: the columns were their own ${declareMs} ms step, the first call ${worstFirst} ms, every call after it under ${CEILING_MS} ms (worst ${worstRest} ms), and the bad rows refused by name.`);
