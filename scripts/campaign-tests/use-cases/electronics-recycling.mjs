// Data-doctrine real-data crew E — use case 1: electronics recycling operator.
// Enters a realistic dataset through the live unified data store's own doors,
// signed in as admin@admin.com via supabase-js, exactly as the app's
// features/organizations/service.ts and @ai-matrx/records core/client.ts do.
//
// Real use case: an electronics-recycling operator (like the owner's own
// company, synthesized fresh — no row copied from production) schedules
// pickups at client sites, weighs what came back by material, bills a
// service fee per pickup, and issues a certificate of destruction per pickup.
//
// Tables: client_sites, pickups, weights_by_material, certificates_of_destruction.
// Field kinds exercised: text, choice (select), date, money (currency),
// number-with-unit (plain number + unit "lb"), relation (table_id -> table_id,
// NOT member/attachment), rollup (sum of weights on a pickup; sum of pickup
// fees on a client site).
import { signedInClient, SUPABASE_URL } from "./_client.mjs";
import fs from "node:fs";
import { fixtureOrg } from "../../lib/fixture-org.mjs";

const LOG = [];
function log(step, ok, detail) {
  LOG.push({ step, ok, detail });
  console.log((ok ? "OK  " : "FAIL") + " " + step + (detail ? " :: " + JSON.stringify(detail).slice(0, 300) : ""));
}

async function rpc(client, name, args) {
  const { data, error } = await client.schema("custom").rpc(name, args);
  return { data, error };
}

async function main() {
  const { client, userId } = await signedInClient();
  log("sign-in", true, { userId });

  // 1. Create the organization through the real org_create RPC (iam schema, public rpc).
  // FIXTURE-ORGS 2026-09-23: this minted "Fixture Recyclers Co" at a random slug on every run.
  // It now takes the family's ONE organization by slug (the name its use-case file declares)
  // through the shared helper, and creates it only the first time.
  let org;
  try {
    ({ org } = await fixtureOrg(client, {
      name: "Cascade Electronics Recovery",
      abbreviation: "CER",
      description:
        "Electronics recycling operator: schedules pickups, tracks material weights, issues certificates of destruction to client sites. Every client, site and person here is synthesized and belongs to nobody.",
    }));
  } catch (orgErr) {
    log("org_create", false, String(orgErr?.message ?? orgErr));
    fs.writeFileSync("/tmp/erecycle_log.json", JSON.stringify(LOG, null, 2));
    process.exit(1);
  }
  const orgId = org.id;
  log("org_create", true, { orgId, slug: org.slug });

  // 2. Turn the record store on for this organization: the same door the
  //    unified-data-ramp screen writes through, platform.knob_override_set,
  //    scoped to this organization.
  const { data: knobData, error: knobErr } = await client.schema("platform").rpc("knob_override_set", {
    p_feature: "custom",
    p_key: "system_enabled",
    p_scope_kind: "organization",
    p_scope_id: orgId,
    p_organization_id: orgId,
    p_value: true,
    p_note: "data-doctrine real-data crew E fixture",
  });
  log("knob_override_set(custom/system_enabled)", !knobErr, knobErr || { knobData });

  // 3. person_kernel_id / table_kernel_id / field_kernel_id — needed for Homes.
  const { data: personKernel, error: pkErr } = await rpc(client, "person_kernel_id", {});
  log("person_kernel_id", !pkErr, pkErr || { personKernel });
  if (pkErr) return finish();

  // 4. A Home record in the Person kernel for each table we declare.
  async function makeHome(name) {
    const { data, error } = await rpc(client, "record_write", {
      p_organization_id: orgId,
      p_table_id: personKernel,
      p_data: { name },
    });
    return { data, error };
  }

  async function declareTable(spec) {
    const home = await makeHome(spec.name + " Home");
    if (home.error) return { error: home.error, step: "home:" + spec.name };
    const { data, error } = await rpc(client, "table_declare", {
      p_organization_id: orgId,
      p_spec: { ...spec, parent_id: home.data },
    });
    return { data, error };
  }

  async function declareField(tableId, spec) {
    const { data, error } = await rpc(client, "field_declare", {
      p_organization_id: orgId,
      p_table_id: tableId,
      p_spec: spec,
    });
    return { data, error };
  }

  async function writeRecord(tableId, data) {
    const { data: id, error } = await rpc(client, "record_write", {
      p_organization_id: orgId,
      p_table_id: tableId,
      p_data: data,
    });
    return { id, error };
  }

  const tableIds = {};

  // ---- client_sites -------------------------------------------------------
  {
    const spec = {
      name: "Client Sites",
      slug: "client_sites",
      type: "entity",
      label_singular: "Client Site",
      label_plural: "Client Sites",
      display: "list",
      weight: "light",
      ordered: false,
      row_order: "manual",
      title_field: "site_name",
      retention_days: 365,
      agent_writable: true,
      default_sort: [{ field: "site_name", direction: "asc" }],
      fields: [{ name: "site_name" }],
    };
    const r = await declareTable(spec);
    log("table_declare(client_sites)", !r.error, r.error || { id: r.data });
    if (r.error) return finish();
    tableIds.client_sites = r.data;

    const f1 = await declareField(r.data, { key: "site_name", label: "Site Name", plain: "text" });
    log("field_declare(client_sites.site_name)", !f1.error, f1.error || {});
    const f2 = await declareField(r.data, { key: "address", label: "Address", plain: "text" });
    log("field_declare(client_sites.address)", !f2.error, f2.error || {});
    const f3 = await declareField(r.data, { key: "contact_email", label: "Contact Email", parity_type: "email" });
    log("field_declare(client_sites.contact_email)", !f3.error, f3.error || {});
    const f4 = await declareField(r.data, { key: "contact_phone", label: "Contact Phone", parity_type: "phone" });
    log("field_declare(client_sites.contact_phone)", !f4.error, f4.error || {});
  }

  // ---- pickups --------------------------------------------------------------
  {
    const spec = {
      name: "Pickups",
      slug: "pickups",
      type: "entity",
      label_singular: "Pickup",
      label_plural: "Pickups",
      display: "list",
      weight: "light",
      ordered: false,
      row_order: "manual",
      title_field: "pickup_ref",
      retention_days: 365,
      agent_writable: true,
      default_sort: [{ field: "scheduled_date", direction: "desc" }],
      fields: [{ name: "pickup_ref" }],
    };
    const r = await declareTable(spec);
    log("table_declare(pickups)", !r.error, r.error || { id: r.data });
    if (r.error) return finish();
    tableIds.pickups = r.data;

    const f1 = await declareField(r.data, { key: "pickup_ref", label: "Pickup Reference", plain: "text" });
    log("field_declare(pickups.pickup_ref)", !f1.error, f1.error || {});

    // GENERIC RELATION — pickup -> client_sites, NOT member/attachment. Not one
    // of the thirteen field_declare parity types, so this is the direct
    // record_write into the field kernel that field_declare itself would build
    // for a relation type, per FLD-1/FLD-8. If the store refuses this shape,
    // that is a real, reportable gap: field_declare has no parity type for
    // "points at another record I name."
    const relDoc = {
      key: "client_site",
      label: "Client Site",
      multi: false,
      dated: false,
      required: false,
      sort: 20,
      source: "manual",
      source_config: {},
      sensitivity: "internal",
      context_policy: "include",
      applies_to_types: [],
      depends_on: [],
      entity_definition_id: r.data,
      type: "relation",
      relation_target: tableIds.client_sites,
      relation_max: 1,
      on_target_delete: "set_null",
      rules: [],
      config: {},
    };
    // The field kernel id is needed to write the Field record directly.
    const { data: fieldKernel, error: fkErr } = await rpc(client, "field_kernel_id", {});
    log("field_kernel_id", !fkErr, fkErr || {});
    if (!fkErr) {
      // ONE SOURCE OF TRUTH, both ways (REC-1/FLD-8): the table must declare
      // the field's key in its own `fields` array BEFORE the field kernel
      // record for it can be written — field_declare itself does this update
      // first, so a direct record_write has to match that order.
      const { error: updErr } = await rpc(client, "record_update", {
        p_organization_id: orgId,
        p_record_id: r.data,
        p_patch: { fields: [{ name: "pickup_ref" }, { name: "client_site" }] },
      });
      log("record_update(pickups.fields += client_site)", !updErr, updErr || {});
      if (!updErr) {
        const { data: relId, error: relErr } = await client
          .schema("custom")
          .rpc("record_write", { p_organization_id: orgId, p_table_id: fieldKernel, p_data: relDoc });
        log("direct record_write(relation field pickups.client_site)", !relErr, relErr || { relId });
      }
    }

    const f3 = await declareField(r.data, { key: "scheduled_date", label: "Scheduled Date", parity_type: "datetime" });
    log("field_declare(pickups.scheduled_date)", !f3.error, f3.error || {});
    const f4 = await declareField(r.data, {
      key: "status",
      label: "Status",
      parity_type: "select",
      options: ["Scheduled", "Completed", "Cancelled"],
    });
    log("field_declare(pickups.status choice)", !f4.error, f4.error || {});
    const f5 = await declareField(r.data, { key: "service_fee_usd", label: "Service Fee", parity_type: "currency" });
    log("field_declare(pickups.service_fee_usd money)", !f5.error, f5.error || {});
    const f6 = await declareField(r.data, { key: "driver", label: "Driver", plain: "text" });
    log("field_declare(pickups.driver)", !f6.error, f6.error || {});
    // ROLLUP: total weight on a pickup, summed from weights_by_material through
    // the relation THAT TABLE holds back to this one (declared after that table
    // exists, see below).
  }

  // ---- weights_by_material ---------------------------------------------------
  {
    const spec = {
      name: "Weights By Material",
      slug: "weights_by_material",
      type: "entity",
      label_singular: "Weight Entry",
      label_plural: "Weight Entries",
      display: "list",
      weight: "light",
      ordered: false,
      row_order: "manual",
      title_field: "material",
      retention_days: 365,
      agent_writable: true,
      default_sort: [{ field: "material", direction: "asc" }],
      fields: [{ name: "material" }],
    };
    const r = await declareTable(spec);
    log("table_declare(weights_by_material)", !r.error, r.error || { id: r.data });
    if (r.error) return finish();
    tableIds.weights_by_material = r.data;

    const f1 = await declareField(r.data, {
      key: "material",
      label: "Material",
      parity_type: "select",
      options: ["CRT Glass", "Circuit Boards", "Aluminum", "Steel", "Plastics", "Batteries", "Copper Wire"],
    });
    log("field_declare(weights.material choice)", !f1.error, f1.error || {});

    const { data: fieldKernel } = await rpc(client, "field_kernel_id", {});
    const relDoc = {
      key: "pickup",
      label: "Pickup",
      multi: false,
      dated: false,
      required: false,
      sort: 20,
      source: "manual",
      source_config: {},
      sensitivity: "internal",
      context_policy: "include",
      applies_to_types: [],
      depends_on: [],
      entity_definition_id: r.data,
      type: "relation",
      relation_target: tableIds.pickups,
      relation_max: 1,
      on_target_delete: "cascade",
      rules: [],
      config: {},
    };
    const { error: updErr } = await rpc(client, "record_update", {
      p_organization_id: orgId,
      p_record_id: r.data,
      p_patch: { fields: [{ name: "material" }, { name: "pickup" }] },
    });
    log("record_update(weights.fields += pickup)", !updErr, updErr || {});
    if (!updErr) {
      const { data: relId, error: relErr } = await client
        .schema("custom")
        .rpc("record_write", { p_organization_id: orgId, p_table_id: fieldKernel, p_data: relDoc });
      log("direct record_write(relation field weights.pickup)", !relErr, relErr || { relId });
    }

    const f3 = await declareField(r.data, { key: "weight_lbs", label: "Weight", plain: "number", unit: "lb" });
    log("field_declare(weights.weight_lbs number+unit)", !f3.error, f3.error || {});
  }

  // ---- rollup: pickups.total_weight_lbs = sum(weights_by_material.weight_lbs via pickup) ----
  {
    const roll = await declareField(tableIds.pickups, {
      key: "total_weight_lbs",
      label: "Total Weight",
      parity_type: "rollup",
      via: "pickup",
      agg: "sum",
      of: "weight_lbs",
    });
    log("field_declare(pickups.total_weight_lbs ROLLUP of weights)", !roll.error, roll.error || {});
  }

  // ---- certificates_of_destruction ------------------------------------------
  {
    const spec = {
      name: "Certificates Of Destruction",
      slug: "certificates_of_destruction",
      type: "entity",
      label_singular: "Certificate",
      label_plural: "Certificates",
      display: "list",
      weight: "light",
      ordered: false,
      row_order: "manual",
      title_field: "serial_number",
      retention_days: 3650,
      agent_writable: true,
      default_sort: [{ field: "issued_date", direction: "desc" }],
      fields: [{ name: "serial_number" }],
    };
    const r = await declareTable(spec);
    log("table_declare(certificates_of_destruction)", !r.error, r.error || { id: r.data });
    if (r.error) return finish();
    tableIds.certificates = r.data;

    const f1 = await declareField(r.data, { key: "serial_number", label: "Serial Number", plain: "text" });
    log("field_declare(cert.serial_number)", !f1.error, f1.error || {});

    const { data: fieldKernel } = await rpc(client, "field_kernel_id", {});
    const relDoc = {
      key: "pickup",
      label: "Pickup",
      multi: false,
      dated: false,
      required: false,
      sort: 20,
      source: "manual",
      source_config: {},
      sensitivity: "internal",
      context_policy: "include",
      applies_to_types: [],
      depends_on: [],
      entity_definition_id: r.data,
      type: "relation",
      relation_target: tableIds.pickups,
      relation_max: 1,
      on_target_delete: "set_null",
      rules: [],
      config: {},
    };
    const { error: updErr } = await rpc(client, "record_update", {
      p_organization_id: orgId,
      p_record_id: r.data,
      p_patch: { fields: [{ name: "serial_number" }, { name: "pickup" }] },
    });
    log("record_update(cert.fields += pickup)", !updErr, updErr || {});
    if (!updErr) {
      const { data: relId, error: relErr } = await client
        .schema("custom")
        .rpc("record_write", { p_organization_id: orgId, p_table_id: fieldKernel, p_data: relDoc });
      log("direct record_write(relation field cert.pickup)", !relErr, relErr || { relId });
    }

    const f3 = await declareField(r.data, { key: "issued_date", label: "Issued Date", parity_type: "datetime" });
    log("field_declare(cert.issued_date)", !f3.error, f3.error || {});
  }

  // ---- rollup: client_sites.total_billed_usd = sum(pickups.service_fee_usd via client_site) ----
  {
    const roll = await declareField(tableIds.client_sites, {
      key: "total_billed_usd",
      label: "Total Billed",
      parity_type: "rollup",
      via: "client_site",
      agg: "sum",
      of: "service_fee_usd",
    });
    log("field_declare(client_sites.total_billed_usd ROLLUP of pickups fees)", !roll.error, roll.error || {});
  }

  fs.writeFileSync(
    "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/erecycle_tableIds.json",
    JSON.stringify({ orgId, orgSlug: slugBase, tableIds }, null, 2),
  );
  return finish();

  function finish() {
    fs.writeFileSync(
      "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/erecycle_log.json",
      JSON.stringify(LOG, null, 2),
    );
    const failed = LOG.filter((l) => !l.ok);
    console.log("\n=== " + failed.length + " failed step(s) of " + LOG.length + " ===");
    for (const f of failed) console.log(" - " + f.step + ": " + JSON.stringify(f.detail));
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  fs.writeFileSync(
    "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/erecycle_log.json",
    JSON.stringify(LOG, null, 2),
  );
  process.exit(1);
});
