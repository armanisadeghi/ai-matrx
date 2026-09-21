// Phase 2 for the electronics-recycling fixture: adds two denormalized text
// link fields (a real relation field could not be declared through any
// client-callable door — see REAL-DATA-LIMITS.md), then writes a realistic,
// internally-consistent dataset through custom.record_write, one row per
// call ("record_write_many" in practitioner terms — there is no bulk-write
// door; each row is its own record_write, exactly as a real client does it).
import { signedInClient } from "./_client.mjs";
import fs from "node:fs";

const orgId = "b3c98221-861e-405c-b986-5f5abd45e362";
const T = {
  client_sites: "5503f505-595e-4669-80bb-c34dbc5dfd3b",
  pickups: "0b113241-7e8b-4837-9bbe-1d2c355cdae9",
  weights_by_material: "a7511f92-ace2-41a1-af39-da8efe2585ec",
  certificates: "4f581d20-2b60-4cd4-9fb4-2ef9ca5ef874",
};

const LOG = [];
function log(step, ok, detail) {
  LOG.push({ step, ok, detail });
  console.log((ok ? "OK  " : "FAIL") + " " + step + (detail ? " :: " + JSON.stringify(detail).slice(0, 200) : ""));
}

async function main() {
  const { client } = await signedInClient();
  async function rpc(name, args) {
    return client.schema("custom").rpc(name, args);
  }
  async function fieldDeclare(tableId, spec) {
    return rpc("field_declare", { p_organization_id: orgId, p_table_id: tableId, p_spec: spec });
  }
  async function write(tableId, data) {
    return rpc("record_write", { p_organization_id: orgId, p_table_id: tableId, p_data: data });
  }

  // Denormalized link fields (workaround for the confirmed relation gap).
  const f1 = await fieldDeclare(T.pickups, { key: "client_site_name", label: "Client Site (name)", plain: "text" });
  log("field_declare(pickups.client_site_name)", !f1.error, f1.error || {});
  const f2 = await fieldDeclare(T.weights_by_material, { key: "pickup_ref_link", label: "Pickup (ref)", plain: "text" });
  log("field_declare(weights.pickup_ref_link)", !f2.error, f2.error || {});
  const f3 = await fieldDeclare(T.certificates, { key: "pickup_ref_link", label: "Pickup (ref)", plain: "text" });
  log("field_declare(cert.pickup_ref_link)", !f3.error, f3.error || {});
  const f4 = await fieldDeclare(T.pickups, { key: "total_weight_lbs_manual", label: "Total Weight (manual)", plain: "number", unit: "lb" });
  log("field_declare(pickups.total_weight_lbs_manual)", !f4.error, f4.error || {});
  const f5 = await fieldDeclare(T.certificates, { key: "total_weight_destroyed_lbs", label: "Total Weight Destroyed", plain: "number", unit: "lb" });
  log("field_declare(cert.total_weight_destroyed_lbs)", !f5.error, f5.error || {});

  // ---- dataset ---------------------------------------------------------
  const sites = [
    { site_name: "Meridian Logistics Park", address: "4501 Freight Way, Rialto, CA", contact_email: "ops@meridianlog.example", contact_phone: "+19095550142" },
    { site_name: "Cascade School District Admin", address: "220 NE 6th Ave, Portland, OR", contact_email: "facilities@cascadesd.example", contact_phone: "+15035550118" },
    { site_name: "Brightline Medical Center", address: "88 Wellness Blvd, Tempe, AZ", contact_email: "itasset@brightlinemed.example", contact_phone: "+14805550199" },
    { site_name: "Hawthorne Credit Union HQ", address: "12 Bank St, Hartford, CT", contact_email: "facilities@hawthornecu.example", contact_phone: "+18605550171" },
    { site_name: "Redwood Data Center 3", address: "900 Server Row, San Jose, CA", contact_email: "decom@redwooddc.example", contact_phone: "+14085550133" },
    { site_name: "Aster County Sheriff's Office", address: "1 Justice Plaza, Aster, TX", contact_email: "it@astercounty.example", contact_phone: "+18325550187" },
    { site_name: "Union Textile Manufacturing", address: "77 Mill Rd, Greenville, SC", contact_email: "plant.it@uniontextile.example", contact_phone: "+18645550122" },
    { site_name: "Overlook Senior Living", address: "300 Ridge Ct, Boise, ID", contact_email: "admin@overlookliving.example", contact_phone: "+12085550164" },
  ];

  const materials = ["CRT Glass", "Circuit Boards", "Aluminum", "Steel", "Plastics", "Batteries", "Copper Wire"];
  const statuses = ["Scheduled", "Completed", "Completed", "Completed", "Cancelled"]; // weighted toward completed
  const drivers = ["R. Alvarez", "T. Nguyen", "M. Okafor", "S. Patel"];

  function rnd(a, b) { return Math.round((a + Math.random() * (b - a)) * 100) / 100; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  const siteIds = [];
  for (const s of sites) {
    const { data, error } = await write(T.client_sites, s);
    log("record_write(client_sites:" + s.site_name + ")", !error, error || { id: data });
    if (!error) siteIds.push({ id: data, name: s.site_name });
  }

  const pickupRows = [];
  let pickupCounter = 1000;
  for (let i = 0; i < 30; i++) {
    const site = pick(siteIds);
    const status = pick(statuses);
    const pickup_ref = "PU-" + pickupCounter++;
    const scheduled_date = new Date(2026, 7, 1 + Math.floor(Math.random() * 45)).toISOString().slice(0, 10);
    const service_fee_usd = status === "Cancelled" ? 0 : rnd(85, 640);
    const driver = pick(drivers);
    const data = {
      pickup_ref,
      client_site_name: site.name,
      scheduled_date,
      status,
      service_fee_usd,
      driver,
    };
    const { data: id, error } = await write(T.pickups, data);
    log("record_write(pickups:" + pickup_ref + ")", !error, error || { id });
    if (!error) pickupRows.push({ id, pickup_ref, status, service_fee_usd, site: site.name });
  }

  const completed = pickupRows.filter((p) => p.status === "Completed");
  const weightRows = [];
  for (const p of completed) {
    const nMaterials = 2 + Math.floor(Math.random() * 3);
    const usedMaterials = [...materials].sort(() => Math.random() - 0.5).slice(0, nMaterials);
    let totalForPickup = 0;
    for (const material of usedMaterials) {
      const weight_lbs = rnd(8, 420);
      totalForPickup += weight_lbs;
      const { data: id, error } = await write(T.weights_by_material, {
        material,
        weight_lbs,
        pickup_ref_link: p.pickup_ref,
      });
      log("record_write(weights:" + p.pickup_ref + "/" + material + ")", !error, error || { id });
      if (!error) weightRows.push({ id, pickup_ref: p.pickup_ref, material, weight_lbs });
    }
    // Manual total (the real ROLLUP field type could not be declared — see
    // REAL-DATA-LIMITS.md). Written back onto the pickup so the number the
    // practitioner sees still adds up across tables.
    const { error: updErr } = await client.schema("custom").rpc("record_update", {
      p_organization_id: orgId,
      p_record_id: p.id,
      p_patch: { total_weight_lbs_manual: Math.round(totalForPickup * 100) / 100 },
    });
    log("record_update(pickups.total_weight_lbs_manual:" + p.pickup_ref + ")", !updErr, updErr || {});
  }

  let certSerial = 500;
  const certRows = [];
  for (const p of completed) {
    const myWeights = weightRows.filter((w) => w.pickup_ref === p.pickup_ref);
    const total = Math.round(myWeights.reduce((s, w) => s + w.weight_lbs, 0) * 100) / 100;
    const serial_number = "COD-2026-" + String(certSerial++).padStart(5, "0");
    const { data: id, error } = await write(T.certificates, {
      serial_number,
      pickup_ref_link: p.pickup_ref,
      issued_date: p.scheduled_date || "2026-08-15",
      total_weight_destroyed_lbs: total,
    });
    log("record_write(cert:" + serial_number + ")", !error, error || { id });
    if (!error) certRows.push({ id, serial_number, pickup_ref: p.pickup_ref, total });
  }

  // Money adding up: sum(pickups.service_fee_usd) across all pickups for a
  // site should equal that site's own manually-summed total (the ROLLUP
  // field itself could not be declared — see limitation log).
  const billingBySite = {};
  for (const p of pickupRows) {
    billingBySite[p.site] = (billingBySite[p.site] || 0) + p.service_fee_usd;
  }

  fs.writeFileSync(
    "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/erecycle_data_log.json",
    JSON.stringify({ LOG, billingBySite, counts: { sites: siteIds.length, pickups: pickupRows.length, weights: weightRows.length, certs: certRows.length } }, null, 2),
  );
  console.log("\nCounts:", { sites: siteIds.length, pickups: pickupRows.length, weights: weightRows.length, certs: certRows.length });
  console.log("Billing by site (sum of service fees, should equal each site's manual total):", billingBySite);
  const failed = LOG.filter((l) => !l.ok);
  console.log(failed.length + " failed step(s) of " + LOG.length);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
