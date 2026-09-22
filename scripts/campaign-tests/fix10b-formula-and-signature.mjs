// FIX-10B — VERIFIER-10 F5 (a worked-out column that never computes) and F6 (e-sign needs a
// signature column no screen could make), proven through the store's own client doors.
//
// THE USE CASE, NAMED. Rincon Plumbing Co dispatches Truck 3 — Okafor. Every ticket carries a
// label the office reads out over the radio ("RPC-T3-8001 — Slab Leak Repair"), which is the
// job number and the service joined together and is never typed by hand; and every truck
// assignment sheet is signed off by the lead technician before the truck leaves the yard.
//
// WHAT THIS ASSERTS (each fails loudly with what it actually saw, and exits 1)
//   F5-1  a worked-out column that names a column BY NAME is refused when it is declared,
//         naming the column and the remedy — instead of being created and reading `—` on
//         every record forever with the reason only in a server log.
//   F5-2  the same for a worked-out column pointing at a field id that does not exist.
//   F5-3  a worked-out column declared over two real columns SHOWS ITS VALUE after a write,
//   F5-4  follows a later write to a source column (the paste path's shape), and
//   F5-5  still reads right on a fresh read of the table (the reload).
//   F6-1  the store publishes ONE list of every kind a column can be, and `signature` is on it.
//   F6-2  a signature column can be declared from that list.
//   F6-3  an e-sign completes against it end to end: template -> render -> sign -> the seal
//         still holds.
//
// Seat: admin@admin.com through supabase-js. Nothing is hard-deleted: the table is archived
// with custom.table_archive at the end.
//
//   node scripts/campaign-tests/fix10b-formula-and-signature.mjs [--keep]
import { signedInClient } from "./use-cases/_client.mjs";

const ORG = "6069a466-1445-42df-a64e-cf37ecdc1b99"; // Rincon Plumbing Co
const HOME = "7e56a871-971e-4122-9652-145b0d14efe1";
const KEEP = process.argv.includes("--keep");

const { client } = await signedInClient();
const raw = (fn, args) => client.schema("custom").rpc(fn, args);
const call = async (fn, args) => {
  const { data, error } = await raw(fn, args);
  if (error) throw new Error(`${fn}: ${error.code ?? ""} ${error.message}`.trim());
  return Array.isArray(data) ? data[0] : data;
};
const tryCall = async (fn, args) => {
  const { data, error } = await raw(fn, args);
  return { data: Array.isArray(data) ? data[0] : data, error };
};

const failures = [];
const check = (ok, what, saw) => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${what}${saw === undefined ? "" : ` — ${saw}`}`);
  if (!ok) failures.push(`${what} — ${saw}`);
};

const stamp = Date.now();
console.log("FIX-10B / VERIFIER-10 F5 + F6 — Rincon Plumbing Co, Truck 3 — Okafor");

const tableId = await call("table_declare", {
  p_organization_id: ORG,
  p_spec: {
    name: `Truck 3 assignment sheet (${new Date(stamp).toISOString().slice(0, 16).replace("T", " ")}Z)`,
    slug: `truck_3_assignment_sheet_${stamp}`.slice(0, 60),
    type: "entity", display: "list", weight: "light", ordered: false, row_order: "manual",
    title_field: "title", label_singular: "assignment", label_plural: "assignments",
    retention_days: 365, agent_writable: true,
    default_sort: [{ field: "title", direction: "asc" }],
    parent_id: HOME,
    fields: [{ name: "title" }],
  },
});
console.log(`table ${tableId}`);

const jobNumberId = await call("field_declare", {
  p_organization_id: ORG, p_table_id: tableId,
  p_spec: { key: "job_number", label: "Job Number", type: "text", source: "manual" },
});
const serviceTypeId = await call("field_declare", {
  p_organization_id: ORG, p_table_id: tableId,
  p_spec: { key: "service_type", label: "Service Type", type: "text", source: "manual" },
});

// ── F5-1 / F5-2. The two silent-blank shapes the census found, refused at declaration.
const byName = await tryCall("field_declare", {
  p_organization_id: ORG, p_table_id: tableId,
  p_spec: {
    key: "radio_label_by_name", label: "Radio label (by name)", type: "formula", source: "formula",
    expr: { op: "concat", args: [{ field: "job_number" }, { const: " — " }, { field: "service_type" }] },
  },
});
check(!!byName.error, "a worked-out column naming a column BY NAME is refused when it is declared",
      byName.error ? `${byName.error.code}: ${byName.error.message}` : "IT WAS CREATED");

const missingId = "3014b868-2c69-4a1e-9f3b-000000000000";
const byGhost = await tryCall("field_declare", {
  p_organization_id: ORG, p_table_id: tableId,
  p_spec: {
    key: "radio_label_ghost", label: "Radio label (ghost)", type: "formula", source: "formula",
    expr: { op: "concat", args: [{ field: missingId }] },
  },
});
check(!!byGhost.error, "a worked-out column pointing at a column that does not exist is refused",
      byGhost.error ? `${byGhost.error.code}: ${byGhost.error.message}` : "IT WAS CREATED");

// ── F5-3. The real one, declared the way the fixed panel declares it: BY ID.
await call("field_declare", {
  p_organization_id: ORG, p_table_id: tableId,
  p_spec: {
    key: "radio_label", label: "Radio label", type: "formula", source: "formula",
    expr: { op: "concat", args: [{ field: jobNumberId }, { const: " — " }, { field: serviceTypeId }] },
  },
});

const recordId = await call("record_write", {
  p_organization_id: ORG, p_table_id: tableId,
  p_data: { title: "RPC-T3-8001", job_number: "RPC-T3-8001", service_type: "Slab Leak Repair", _actor: "system" },
});

const readOne = async (label) => {
  const rows = await client.schema("custom")
    .rpc("read_records", { p_organization_id: ORG, p_table_id: tableId, p_by_id: false, p_limit: 10, p_offset: 0 });
  if (rows.error) throw new Error(`read_records: ${rows.error.code} ${rows.error.message}`);
  const list = Array.isArray(rows.data) ? rows.data : [rows.data];
  const row = list.find((r) => (r.id ?? r.record_id) === recordId) ?? list[0];
  const doc = row?.document ?? row?.data ?? row;
  console.log(`  ${label}: radio_label = ${JSON.stringify(doc?.radio_label)}`);
  return doc?.radio_label ?? null;
};

const afterWrite = await readOne("after the write");
check(afterWrite === "RPC-T3-8001 — Slab Leak Repair",
      "the worked-out column shows its value after a write", JSON.stringify(afterWrite));

// ── F5-4. A later write to a source column — the shape the paste path writes.
await call("record_update", {
  p_organization_id: ORG, p_record_id: recordId,
  p_patch: { service_type: "Sewer Camera Inspection", _actor: "system" },
  p_expected_version: null,
});
const afterPaste = await readOne("after a write to a source column");
check(afterPaste === "RPC-T3-8001 — Sewer Camera Inspection",
      "and it follows a later write to one of its source columns", JSON.stringify(afterPaste));

// ── F5-5. A fresh read of the table — what a reload does.
const afterReload = await readOne("on a fresh read (the reload)");
check(afterReload === "RPC-T3-8001 — Sewer Camera Inspection",
      "and it still reads right on a fresh read of the table", JSON.stringify(afterReload));

// ── F6-1. ONE published list of every kind a column can be.
const { data: kinds, error: kindsErr } = await client.schema("custom").rpc("field_kinds");
check(!kindsErr && Array.isArray(kinds) && kinds.some((k) => k.kind === "signature"),
      "the store publishes one list of every kind a column can be, and `signature` is on it",
      kindsErr ? `${kindsErr.code}: ${kindsErr.message}`
               : `${(kinds ?? []).length} kinds; signature ${(kinds ?? []).some((k) => k.kind === "signature") ? "present" : "ABSENT"}`);

// ── F6-2. A signature column, declared from that list.
const signField = await tryCall("field_declare", {
  p_organization_id: ORG, p_table_id: tableId,
  p_spec: { key: "signed_off_by", label: "Signed off by", type: "signature", source: "manual" },
});
check(!signField.error, "a signature column can be declared from that list",
      signField.error ? `${signField.error.code}: ${signField.error.message}` : `field ${signField.data}`);

// ── F6-3. The e-sign, end to end.
let signatureId = null;
if (!signField.error) {
  const template = await call("doc_template_save", {
    p_organization_id: ORG, p_table_id: tableId,
    p_name: "Truck 3 assignment sheet",
    p_body: `Truck 3 — Okafor\n\nTicket: {{field:${jobNumberId}}}\nService: {{field:${serviceTypeId}}}\n\nThe lead technician confirms the truck is stocked for this call before it leaves the yard.`,
    p_template_id: null,
  });
  const templateId = template?.template_id ?? template?.id ?? template;
  const render = await call("doc_render_document", {
    p_organization_id: ORG, p_template_id: templateId, p_record_id: recordId,
  });
  const renderId = render?.render_id ?? render?.id ?? render;
  const signed = await tryCall("doc_sign", {
    p_organization_id: ORG, p_render_id: renderId, p_field_key: "signed_off_by",
    p_signer_name: "Ama Osei", p_signer_user_id: null,
  });
  check(!signed.error, "an e-sign completes against that column",
        signed.error ? `${signed.error.code}: ${signed.error.message}` : JSON.stringify(signed.data).slice(0, 180));
  signatureId = signed.data?.signature_id ?? signed.data?.id ?? (typeof signed.data === "string" ? signed.data : null);
  if (signatureId) {
    const intact = await call("doc_signature_intact", { p_organization_id: ORG, p_signature_id: signatureId });
    check(intact?.intact === true || intact?.holds === true,
          "and the seal still holds when the store is asked", JSON.stringify(intact).slice(0, 220));
  }
}

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
console.log("\nGREEN — a worked-out column that cannot compute is refused when it is written, a good one follows its sources through write, paste and reload, and a signature column can be made and signed.");
