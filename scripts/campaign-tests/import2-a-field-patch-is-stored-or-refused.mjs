// IMPORT-2 — a patch sent to custom.field_update is STORED or REFUSED BY NAME, never ignored.
//
// THE USE CASE, NAMED. Rincon Plumbing Co keeps a "Ticket summary" column on its dispatch
// board — a worked-out column that reads the ticket number and the service address so the
// office can scan the list without opening anything. In September the office decided the
// summary should lead with the SERVICE TYPE instead, so the dispatcher opens the column and
// edits its formula. Before this lane the store answered "saved" and kept yesterday's formula.
//
// WHAT THIS ASSERTS (each one fails loudly and exits 1)
//   1. THE FOUND INSTANCE — a patch carrying only `expr` on an existing formula column is
//      STORED: the column reads the new way on every row, straight away.
//      Against the bodies before this lane this is the red one: the door answers with the
//      field id, `config.expr` is unchanged, and the cells still read the old way.
//   2. THE CLASS — a patch carrying a key this door does not store is REFUSED BY NAME, with
//      the list of what it does store. (`custom.entity_field_update`, the sibling door, has
//      had exactly this guard since FLD-12; this one had none.)
//   3. A FORMULA ON A COLUMN THAT IS NOT WORKED OUT is refused by name, not forced quietly.
//   4. A FORMULA THAT IS NOT AN EXPRESSION is refused by name.
//   5. The settings that already worked still work — a label-only patch still saves.
//
// Seat: admin@admin.com through supabase-js. Nothing is hard-deleted.
//
//   node scripts/campaign-tests/import2-a-field-patch-is-stored-or-refused.mjs [--keep]
import { signedInClient } from "./use-cases/_client.mjs";

const ORG = "6069a466-1445-42df-a64e-cf37ecdc1b99"; // Rincon Plumbing Co
const HOME = "7e56a871-971e-4122-9652-145b0d14efe1";
const KEEP = process.argv.includes("--keep");

const { client } = await signedInClient();
const call = async (fn, args) => {
  const { data, error } = await client.schema("custom").rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.code ?? ""} ${error.message}`.trim());
  return Array.isArray(data) ? data[0] : data;
};
const refusal = async (fn, args) => {
  const { error } = await client.schema("custom").rpc(fn, args);
  return error ? `${error.code ?? ""} ${error.message}`.trim() : null;
};

const failures = [];
const check = (ok, what, saw) => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${what}${saw === undefined ? "" : ` — ${saw}`}`);
  if (!ok) failures.push(`${what} — ${saw}`);
};

const stamp = Date.now();
console.log("IMPORT-2 — Rincon Plumbing Co, the dispatch board's ticket summary");

const tableId = await call("table_declare", {
  p_organization_id: ORG,
  p_spec: {
    name: `Dispatch board (${new Date(stamp).toISOString().slice(0, 16).replace("T", " ")}Z)`,
    slug: `dispatch_board_${stamp}`.slice(0, 60),
    type: "entity", display: "list", weight: "light", ordered: false, row_order: "manual",
    title_field: "title", label_singular: "dispatch ticket", label_plural: "dispatch tickets",
    retention_days: 365, agent_writable: true,
    default_sort: [{ field: "title", direction: "asc" }], parent_id: HOME,
    fields: [{ name: "title" }],
  },
});
console.log(`table ${tableId}`);

const ticketId = await call("field_declare", {
  p_organization_id: ORG, p_table_id: tableId,
  p_spec: { key: "job_number", label: "Job Number", plain: "text", sort: 10 },
});
const serviceId = await call("field_declare", {
  p_organization_id: ORG, p_table_id: tableId,
  p_spec: { key: "service_type", label: "Service Type", plain: "text", sort: 20 },
});
// The summary as the office first wrote it: the ticket number, then the service.
const summaryId = await call("field_declare", {
  p_organization_id: ORG, p_table_id: tableId,
  p_spec: {
    key: "ticket_summary", label: "Ticket summary", type: "formula", sort: 30,
    compute_on: "read", depends_on: [ticketId, serviceId],
    expr: { op: "concat", args: [{ field: ticketId }, { const: " — " }, { field: serviceId }] },
  },
});
console.log(`columns: job_number ${ticketId} · service_type ${serviceId} · ticket_summary ${summaryId}`);

const recordId = await call("record_write", {
  p_organization_id: ORG, p_table_id: tableId,
  p_data: { title: "RPC-SEP-41900", job_number: "RPC-SEP-41900", service_type: "Backflow Test" },
});
const readSummary = async () => {
  const rec = await call("read_record", { p_organization_id: ORG, p_record_id: recordId, p_by_id: true });
  const doc = rec?.data ?? rec?.document ?? rec;
  return (doc?._derived ?? doc?.derived ?? doc)?.ticket_summary ?? doc?.ticket_summary ?? JSON.stringify(doc).slice(0, 200);
};
console.log(`  the summary as first written: ${await readSummary()}`);

// ── 1. THE FOUND INSTANCE. The office changes its mind: lead with the SERVICE TYPE.
const newExpr = { op: "concat", args: [{ field: serviceId }, { const: " · " }, { field: ticketId }] };
const err1 = await refusal("field_update", {
  p_organization_id: ORG, p_field_id: summaryId, p_patch: { expr: newExpr },
});
const after = await readSummary();
check(err1 === null, "a patch that changes only the formula is accepted", err1 ?? "accepted");
check(String(after).startsWith("Backflow Test"),
      "and the column reads the NEW way on the record that already existed", `reads ${JSON.stringify(after)}`);

// ── 2. THE CLASS. A key this door does not store is refused BY NAME.
const err2 = await refusal("field_update", {
  p_organization_id: ORG, p_field_id: summaryId, p_patch: { label: "Ticket summary", colour: "blue" },
});
check(err2 !== null && /colour/.test(err2) && /no setting called/i.test(err2),
      "a key this door does not store is refused by name, with the list of what it does store",
      err2 ?? "ACCEPTED — the door said yes and stored nothing");

// ── 3. A FORMULA ON A COLUMN THAT IS NOT WORKED OUT.
const err3 = await refusal("field_update", {
  p_organization_id: ORG, p_field_id: ticketId, p_patch: { expr: newExpr },
});
check(err3 !== null && /not worked out/i.test(err3),
      "a formula sent to a column that is not worked out is refused by name",
      err3 ?? "ACCEPTED — the door said yes and stored nothing");

// ── 4. A FORMULA THAT IS NOT AN EXPRESSION.
const err4 = await refusal("field_update", {
  p_organization_id: ORG, p_field_id: summaryId, p_patch: { expr: "job_number plus service_type" },
});
check(err4 !== null && /formula is an expression/i.test(err4),
      "a formula that is not an expression is refused by name",
      err4 ?? "ACCEPTED — the door said yes and stored nothing");

// ── 5. THE SETTINGS THAT ALREADY WORKED STILL WORK.
const err5 = await refusal("field_update", {
  p_organization_id: ORG, p_field_id: summaryId, p_patch: { label: "Ticket summary (September)" },
});
const fields = await client.schema("custom")
  .rpc("applicable_fields", { p_organization_id: ORG, p_table_id: tableId, p_record_type: null });
const summaryNow = (fields.data ?? []).find((f) => (f.data?.key ?? f.key) === "ticket_summary");
check(err5 === null && (summaryNow?.data?.label ?? "") === "Ticket summary (September)",
      "a label-only patch still saves", `${err5 ?? "accepted"} · label now ${JSON.stringify(summaryNow?.data?.label)}`);
check(JSON.stringify(summaryNow?.data?.config?.expr) === JSON.stringify(newExpr),
      "and the formula this suite wrote is the one on the column", JSON.stringify(summaryNow?.data?.config?.expr));

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
console.log("\nGREEN — the formula of an existing worked-out column can be changed through the door, and every key it does not store is refused by name.");
