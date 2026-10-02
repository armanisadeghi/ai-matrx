#!/usr/bin/env node
/**
 * CHAIR (Unified Data System v6) — THE TEMPLATE FAMILY'S FOUR GUARDS, on the dev clone, as the person.
 * Migration: migrations/campaign/chair_tf_one_template_family_one_install_door.sql.
 *
 * One transaction, ROLLED BACK at the end (nothing it makes survives). A small realistic template
 * (Brightwater Family Dental: Patients, Appointments related to them, rows, a board, an intake form,
 * a dashboard) is declared for the platform by the runner role, then every call is made as
 * test@test.com through role `authenticated` with the 8 s statement ceiling a browser has:
 *
 *   G1 install twice = one footprint   the install runs to `installed`; a second install answers
 *                                       already=true with the SAME install id, and the organization
 *                                       holds one install row and one set of tables
 *   G2 uninstall archives everything   after template_uninstall runs to done, no table, field, view,
 *                                       form, dashboard or Home the install made is live, and no row of
 *                                       its tables is live; template_restore brings every one back
 *   G3 the organization wall           test@test.com installing into an organization she is not in is
 *                                       refused 42501 AND leaves no install row there
 *   G4 cards, never rows               custom.templates answers only the card keys — no spec, no plan,
 *                                       no rows — and the card count equals the templates she may see
 *
 *   node scripts/campaign-tests/chairtf_template_family_guards.mjs [--plant <name>]
 * Plants (each turns its guard RED; a body rewritten in this rolled-back transaction, never committed):
 *   install_twice_makes_two   template_install forgets an existing install          → G1 red
 *   uninstall_skips_tables    template_uninstall leaves tables alone                → G2 red
 *   install_skips_the_wall    template_install drops its two organization checks    → G3 red
 *   card_leaks_the_spec       custom.templates adds the spec to every card           → G4 red
 */
import { dsnFor, pgClient } from "../lib/pooled-db.mjs";

const TEST = "4060701e-706a-4c76-b3ca-0bbc69fa5a14"; // test@test.com
const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04"; // Cedar Ridge Physical Therapy (test is a member)
const FOREIGN = "892e144f-66b2-4013-94f6-eabe0053c341"; // Bayside Orthodontics (test is not)
const CARD_KEYS = ["audience", "business", "catalogue_id", "footprint", "id", "industry", "install_door", "installed", "job",
  "name", "owner_organization_id", "persona", "preview_image", "requires", "scope", "strengths", "teaches", "vertical", "version"];

const plant = (() => { const i = process.argv.indexOf("--plant"); return i > 0 ? process.argv[i + 1] : null; })();
const PLANTS = {
  install_twice_makes_two: ["custom.template_install(uuid,uuid,integer)", "if found and v_i.state in ('installed', 'uninstalling') then", "if false then"],
  uninstall_skips_tables: ["custom.template_uninstall(uuid,uuid,integer)", "when 'table' then", "when 'table (planted)' then"],
  install_skips_the_wall: ["custom.template_install(uuid,uuid,integer)", "perform custom.assert_client_may_reach(p_organization_id, 'custom.template_install');", "null;"],
  card_leaks_the_spec: ["custom.templates(jsonb)", "'install_door', 'custom.template_install',", "'install_door', 'custom.template_install', 'spec', p.spec,"],
};
if (plant && !PLANTS[plant]) { console.error(`unknown plant ${plant}; one of ${Object.keys(PLANTS).join(", ")}`); process.exit(2); }

// The template, as templateDeclaration(spec) in @ai-matrx/records produces it (card + install plan).
const ex = (token, name, fields) => ({ business: "Brightwater Family Dental", tables: [{ token, name, labelSingular: name.replace(/s$/, ""), labelPlural: name, type: "entity", fields, rows: [] }] });
const DECLARATION = {
  catalogueId: "TG001", version: 1, specVersion: 1, id: "brightwater-family-dental-guard",
  card: { name: "Dental practice", persona: "Dana Ruiz runs the front desk at Brightwater Family Dental and books every cleaning from one board.",
          business: "Brightwater Family Dental", vertical: "Dental practice", industry: "healthcare", job: "scheduling", audience: "organization",
          teaches: "kanban", strengths: ["S3"], requires: [], footprint: { line: "2 tables · 1 view · 1 form · 1 dashboard" }, previewImage: null },
  installPlan: {
    planVersion: 1, timezone: "America/Los_Angeles",
    agent: { platformAgent: { id: "4383174d-aae9-4bb8-a2ea-0498f3cc47a3", name: "Chief of Staff" }, name: "Brightwater Front Desk", bindings: [{ variable: "person_profile", tableToken: "appointment", describes: "The day's appointments." }] },
    steps: [
      { label: "home.kernel", door: "person_kernel_id", args: {}, save: { "kernel.person": [] } },
      { label: "home", door: "record_write", args: { p_organization_id: "${org}", p_table_id: "${ref:kernel.person}", p_data: { name: "Brightwater Family Dental Home" } }, save: { home: [] }, made: [{ kind: "record", ref: "home", title: "Brightwater Family Dental Home" }] },
      { label: "tables.patient", door: "table_from_example", args: { p_organization_id: "${org}", p_home_id: "${ref:home}", p_example: ex("patient", "Patients", [
          { key: "full_name", label: "Full name", parityType: "text", required: true }, { key: "phone", label: "Phone", parityType: "phone" }]) },
        saveEach: { array: ["tables"], key: ["token"], value: ["table_id"], prefix: "tables." }, made: [{ kind: "table", ref: "tables.patient", title: "Patients" }] },
      { label: "tables.appointment", door: "table_from_example", args: { p_organization_id: "${org}", p_home_id: "${ref:home}", p_example: ex("appointment", "Appointments", [
          { key: "title", label: "Visit", parityType: "text", required: true }, { key: "starts_at", label: "Starts", parityType: "datetime" },
          { key: "status", label: "Status", parityType: "select", choices: ["Booked", "Confirmed", "Seen"] }]) },
        saveEach: { array: ["tables"], key: ["token"], value: ["table_id"], prefix: "tables." }, made: [{ kind: "table", ref: "tables.appointment", title: "Appointments" }] },
      { label: "relations.appointment.patient", door: "field_declare", args: { p_organization_id: "${org}", p_table_id: "${ref:tables.appointment}", p_spec: { key: "patient", label: "Patient", type: "relation", relation_target: "${ref:tables.patient}" } },
        save: { "fields.appointment.patient": [] }, made: [{ kind: "field", ref: "fields.appointment.patient", table: "tables.appointment" }] },
      { label: "rows.patient", door: "record_write_many", args: { p_organization_id: "${org}", p_table_id: "${ref:tables.patient}",
          p_rows: [{ full_name: "Rosa Delgado", phone: "(805) 555-0142" }, { full_name: "Marcus Lee", phone: "(805) 555-0177" }, { full_name: "Priya Natarajan", phone: "(805) 555-0119" }],
          p_ids: ["${new:row.patient.rosa}", "${new:row.patient.marcus}", "${new:row.patient.priya}"] } },
      { label: "rows.appointment", door: "record_write_many", args: { p_organization_id: "${org}", p_table_id: "${ref:tables.appointment}",
          p_rows: [{ title: "Cleaning", starts_at: "${date:@today+1d 09:30}", status: "Booked", patient: "${new:row.patient.rosa}" },
                   { title: "Crown fitting", starts_at: "${date:@today+2d 14:00}", status: "Confirmed", patient: "${new:row.patient.marcus}" },
                   { title: "New patient exam", starts_at: "${date:@today-1d 11:00}", status: "Seen", patient: "${new:row.patient.priya}" }],
          p_ids: ["${new:row.appt.1}", "${new:row.appt.2}", "${new:row.appt.3}"] } },
      { label: "views.board", door: "view_declare", args: { p_organization_id: "${org}", p_table_id: "${ref:tables.appointment}", p_spec: { name: "Front desk board", definition: { layout: "kanban", group_field: "status" } } },
        save: { "views.board": [] }, made: [{ kind: "view", ref: "views.board", title: "Front desk board", table: "tables.appointment" }] },
      { label: "forms.intake", door: "form_declare", args: { p_organization_id: "${org}", p_table_id: "${ref:tables.patient}", p_title: "New patient intake",
          p_questions: [{ field: "full_name", ask: "What is your full name?", required: true }, { field: "phone", ask: "What is the best number to reach you?" }], p_presentation: {} },
        save: { "forms.intake": [] }, made: [{ kind: "form", ref: "forms.intake", title: "New patient intake", table: "tables.patient" }] },
      { label: "dashboards.week", door: "dashboard_declare", args: { p_organization_id: "${org}", p_table_id: "${ref:tables.appointment}", p_name: "This week", p_blocks: [{ title: "Visits by status", kind: "bar", group_by: "status" }] },
        save: { "dashboards.week": [] }, made: [{ kind: "dashboard", ref: "dashboards.week", title: "This week" }] },
    ],
  },
};

const pg = (await import("pg")).default;
const c = pgClient(pg, dsnFor("clone", { app: "chairtf-template-guards" }));
await c.connect();
const results = [];
const asTest = async () => {
  await c.query("set local role authenticated");
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: TEST, role: "authenticated", email: "test@test.com" })]);
  await c.query("set local statement_timeout = '8s'");
};
const asRunner = async () => { await c.query("reset role"); await c.query("set local statement_timeout = '120s'"); };
const one = async (sql, args = []) => (await c.query(sql, args)).rows[0];
/** Call a budgeted door until done (each call its own statement under the 8 s ceiling; a lock wait is retried). */
async function untilDone(door, org, id, max = 30) {
  let last = null;
  for (let i = 0; i < max; i++) {
    await c.query("savepoint call");
    try {
      await asTest();
      last = (await one(`select custom.${door}($1, $2) r`, [org, id])).r;
      await c.query("release savepoint call");
      if (last.done || (door === "template_install" && last.state === "refused" && !["55P03", "57014", "40P01"].includes(last.refusal?.code))) return last;
    } catch (e) {
      await c.query("rollback to savepoint call");
      if (!["57014", "55P03", "40P01"].includes(e.code)) throw e;
    }
  }
  return last;
}
const record = (guard, ok, detail) => { results.push({ guard, ok, detail }); console.log(`${ok ? "GREEN" : "RED  "} ${guard} — ${detail}`); };

try {
  await c.query("begin");
  await asRunner();
  const ref = (await one("select current_setting('server_version') v, current_user u")); void ref;
  if (plant) {
    const [fn, from, to] = PLANTS[plant];
    const body = (await one("select pg_get_functiondef($1::regprocedure) d", [fn])).d;
    if (!body.includes(from)) throw new Error(`plant ${plant}: anchor not found in ${fn}`);
    await c.query(body.replace(from, to));
    console.log(`PLANTED ${plant} in ${fn} (this transaction only)`);
  }
  const tid = (await one("select custom.template_declare('platform', $1::jsonb) ->> 'template_id' t", [JSON.stringify(DECLARATION)])).t;

  // G4 — cards, never rows.
  await c.query("savepoint g4");
  try {
    await asTest();
    const r = (await one("select custom.templates('{}'::jsonb) r")).r;
    await asRunner();
    const visible = Number((await one("select count(distinct (organization_id, catalogue_id)) n from custom.template t where t.retired_at is null and (t.scope = 'platform' or iam.has_org_access_for($1, t.organization_id))", [TEST])).n);
    const keys = [...new Set(r.cards.flatMap((card) => Object.keys(card)))].sort();
    const extra = keys.filter((k) => !CARD_KEYS.includes(k));
    record("G4 cards, never rows", extra.length === 0 && r.total === visible && r.cards.some((x) => x.id === tid),
      extra.length ? `card carries ${extra.join(", ")}` : `${r.total} card(s) = ${visible} visible template(s); keys are card fields only`);
    await c.query("release savepoint g4");
  } catch (e) { await c.query("rollback to savepoint g4"); record("G4 cards, never rows", false, `${e.code} ${e.message}`); }

  // G3 — the organization wall.
  await c.query("savepoint g3");
  let refused = null;
  try { await asTest(); await one("select custom.template_install($1, $2) r", [FOREIGN, tid]); } catch (e) { refused = e.code; }
  await c.query("rollback to savepoint g3");
  await asRunner();
  const leaked = Number((await one("select count(*) n from custom.template_install where organization_id = $1 and template_id = $2", [FOREIGN, tid])).n);
  // A plant that lets the call through leaves its row: re-run it outside a rolled-back savepoint to see it.
  if (refused === null) {
    await c.query("savepoint g3b");
    try { await asTest(); await one("select custom.template_install($1, $2) r", [FOREIGN, tid]); await c.query("release savepoint g3b"); } catch { await c.query("rollback to savepoint g3b"); }
    await asRunner();
  }
  const leakedAfter = Number((await one("select count(*) n from custom.template_install where organization_id = $1 and template_id = $2", [FOREIGN, tid])).n);
  record("G3 the organization wall", refused === "42501" && leaked === 0 && leakedAfter === 0,
    refused === "42501" ? "refused 42501, no install row in the other organization" : `not refused (${refused}); ${leakedAfter} install row(s) written there`);

  // G1 — install twice = one footprint.
  const first = await untilDone("template_install", ORG, tid);
  const second = await untilDone("template_install", ORG, tid, 1);
  await asRunner();
  const installs = Number((await one("select count(*) n from custom.template_install where organization_id = $1 and catalogue_id = 'TG001'", [ORG])).n);
  const tables = Number((await one("select count(*) n from custom.template_install i, jsonb_array_elements(i.made) x where i.organization_id = $1 and i.catalogue_id = 'TG001' and x->>'kind' = 'table'", [ORG])).n);
  record("G1 install twice = one footprint",
    first?.state === "installed" && second?.already === true && second?.install_id === first?.install_id && installs === 1 && tables === 2,
    `first ${first?.state} in ${first?.calls} call(s), ${first?.ms} ms; second already=${second?.already}; ${installs} install row(s), ${tables} table(s)`);

  // G2 — uninstall archives everything the install made; restore brings it back.
  const live = async () => (await one(`
    select count(*) filter (where coalesce(
             (select r.deleted_at is null from custom.record r where r.organization_id = i.organization_id and r.id = (x->>'id')::uuid),
             (select f.deleted_at is null from custom.anon_form f where f.id = (x->>'id')::uuid),
             (select v.deleted_at is null from platform.saved_view v where v.id = (x->>'id')::uuid), false)) objects,
           (select count(*) from jsonb_array_elements(i.made) t join custom.record r
              on r.organization_id = i.organization_id and r.table_id = (t->>'id')::uuid and r.data_class = 'record' and r.deleted_at is null
             where t->>'kind' = 'table') rows_live,
           count(*) made
      from custom.template_install i, jsonb_array_elements(i.made) x
     where i.organization_id = $1 and i.catalogue_id = 'TG001'
     group by i.id`, [ORG]));
  const before = await live();
  const un = await untilDone("template_uninstall", ORG, first?.install_id);
  await asRunner();
  const after = await live();
  const back = await untilDone("template_restore", ORG, first?.install_id);
  await asRunner();
  const restored = await live();
  record("G2 uninstall archives everything",
    un?.state === "uninstalled" && Number(after.objects) === 0 && Number(after.rows_live) === 0 && back?.state === "installed" && Number(restored.objects) === Number(before.objects) && Number(restored.rows_live) === Number(before.rows_live),
    `made ${before.made}: live before ${before.objects} objects / ${before.rows_live} rows; after uninstall ${after.objects} / ${after.rows_live}; after restore ${restored.objects} / ${restored.rows_live}`);
} catch (e) {
  console.log("FATAL", e.code ?? "", e.message);
  results.push({ guard: "run", ok: false });
} finally {
  await c.query("rollback").catch(() => {});
  await c.end();
}
const red = results.filter((r) => !r.ok);
if (plant) {
  const expect = { install_twice_makes_two: "G1", uninstall_skips_tables: "G2", install_skips_the_wall: "G3", card_leaks_the_spec: "G4" }[plant];
  const hit = red.some((r) => r.guard.startsWith(expect));
  console.log(hit ? `PLANT CAUGHT: ${plant} turned ${expect} red` : `PLANT MISSED: ${plant} left ${expect} green`);
  process.exit(hit ? 0 : 1);
}
console.log(red.length ? `RED: ${red.length} guard(s)` : "GREEN: all four guards");
process.exit(red.length ? 1 : 0);
