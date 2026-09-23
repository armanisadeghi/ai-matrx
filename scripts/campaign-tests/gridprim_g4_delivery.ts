/**
 * LANE GRID-PRIMITIVES, G4 — THE DELIVERY, END TO END, ON THE REHEARSAL BRANCH.
 *
 * THE USE CASE. Dr. Ana Whitfield (admin@admin.com) runs Cedar Ridge Veterinary Clinic and points
 * its Appointments day sheet at the clinic's reminder service. Marisol Vega (test@test.com) books
 * Clementine's visit, moves it to Thursday, cancels it and re-books it. Each of the four must
 * leave the database as a SIGNED POST, through the platform's own dispatcher
 * (files.webhook_dispatch → pg_net → files.webhook_reconcile).
 *
 * WHY IT COMMITS. pg_net sends only what was committed, and the dispatcher skips events younger
 * than five seconds, so this cannot be a rolled-back suite. It runs ONLY on the rehearsal branch
 * (refused anywhere else by the branch identity check), commits one organization named for the
 * clinic and tagged `settings.test_fixture = "gridprim_g4_delivery"`, and archives it at the end.
 * Nothing is deleted.
 *
 * THE RECEIVER. The branch's own API gateway (`<branch api_url>/rest/v1/`), because a lane may not
 * send test traffic to a third party. It answers the POST with an HTTP status — which is the
 * point: the body left the database, crossed the network and a server answered. A 2xx needs a
 * real receiver (the reminder service's own URL); the dispatcher treats any non-2xx as a failed
 * delivery to retry, exactly as it would for a customer's endpoint.
 *
 * RUN IT:  node node_modules/tsx/dist/cli.mjs scripts/campaign-tests/gridprim_g4_delivery.ts
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { branchRefOverride, loadBranchDbEnv, loadBranchRef } from "../lib/migration-target";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd";
const DANA = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const claims = (sub: string) => JSON.stringify({ sub, role: "authenticated" });

async function main() {
  const ref = loadBranchRef(ROOT, branchRefOverride(process.argv));
  const client = new pg.Client({ ...loadBranchDbEnv(ROOT, ref), ssl: { rejectUnauthorized: false }, application_name: "gridprim G4 delivery" });
  await client.connect();
  const sysid = (await client.query<{ s: string }>("select system_identifier::text as s from pg_control_system()")).rows[0]!.s;
  if (sysid !== ref.systemIdentifier) throw new Error(`not the rehearsal branch (system_identifier ${sysid})`);
  const receiver = `${ref.apiUrl ?? `https://${ref.branchRef}.supabase.co`}/rest/v1/`;
  let failures = 0;
  const clause = (name: string, ok: boolean, saw: string) => {
    if (!ok) failures++;
    console.log(`${ok ? "\x1b[32m[PASS]" : "\x1b[31m[FAIL]"}\x1b[0m ${name} \x1b[2m— ${saw}\x1b[0m`);
  };
  let org: string | null = null;
  try {
    // The dispatcher's watermark row — a fresh branch may not carry it, and without it nothing
    // is ever dispatched. It starts at the log's current end so no older event is replayed.
    await client.query(`insert into files.webhook_dispatch_state (id, last_activity_log_id)
                        values (true, coalesce((select max(id) from platform.activity_log), 0))
                        on conflict (id) do nothing`);

    // 1 — the clinic, committed, through the doors a person uses.
    await client.query("begin");
    await client.query(readFileSync(resolve(ROOT, "scripts/campaign-tests/_gridprim_clinic.sql"), "utf8").replace("on commit drop", ""));
    const gp = Object.fromEntries((await client.query<{ k: string; v: string }>("select k, v::text from gp")).rows.map((r) => [r.k, r.v]));
    org = gp.org!;
    await client.query(`update iam.organizations set settings = coalesce(settings, '{}'::jsonb) || '{"test_fixture":"gridprim_g4_delivery"}'::jsonb where id = $1`, [org]);
    await client.query("select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)", [claims(ADMIN)]);
    const hook = (await client.query<{ h: { webhook_id: string; secret: string } }>(
      "select custom.table_webhook_declare($1, $2, $3, null, 'Reminder service — Cedar Ridge (branch receiver)') as h",
      [org, gp.appts, receiver])).rows[0]!.h;
    await client.query("select set_config('request.jwt.claims', $1, true)", [claims(DANA)]);
    const rec = (await client.query<{ id: string }>(
      `select custom.record_write($1, $2, '{"patient":"Clementine (Osei)","species":"Cat","visit_status":"Scheduled","visit_on":"2026-09-24","visit_fee":142.5,"owner_phone":"(541) 290-5518"}'::jsonb) as id`,
      [org, gp.appts])).rows[0]!.id;
    await client.query("commit");
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)", [claims(DANA)]);
    await client.query(`select custom.record_update($1, $2, '{"visit_on":"2026-09-25","desk_notes":"Owner asked to move to Thursday"}'::jsonb)`, [org, rec]);
    await client.query("commit");
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)", [claims(DANA)]);
    await client.query("select custom.record_delete($1, $2)", [org, rec]);
    await client.query("commit");
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)", [claims(DANA)]);
    await client.query("select custom.record_restore($1, $2)", [org, rec]);
    await client.query("commit");

    const events = (await client.query<{ id: string; action: string }>(
      "select id::text, action from platform.activity_log where organization_id = $1 and entity_id = $2 order by id", [org, rec])).rows;
    clause("1  add / change / archive / restore are four events",
      events.map((e) => e.action).join(",") === "record.created,record.updated,record.archived,record.restored",
      events.map((e) => e.action).join(", "));

    // 2 — the platform's dispatcher (its cron is off on the branch, so it is called by hand, as
    //     the 30-second job calls it). It only takes events older than five seconds.
    await sleep(6500);
    const sent = (await client.query<{ n: number }>("select files.webhook_dispatch() as n")).rows[0]!.n;
    const deliveries = (await client.query<{ activity_log_id: string; signature: string; net_request_id: string | null }>(
      "select activity_log_id::text, signature, net_request_id::text from files.webhook_deliveries where webhook_id = $1 order by activity_log_id",
      [hook.webhook_id])).rows;
    clause("2  the dispatcher posts all four, each signed and handed to pg_net",
      deliveries.length === 4 && deliveries.every((d) => d.net_request_id && d.signature?.length === 64),
      `dispatch() sent ${sent}; ${deliveries.length} delivery rows, request ids ${deliveries.map((d) => d.net_request_id).join(", ")}`);

    // 3 — pg_net answers; the reconciler records the receiver's answer on each delivery.
    let statuses: { status: string; http_status: number | null }[] = [];
    for (let i = 0; i < 20; i++) {
      await sleep(1500);
      await client.query("select files.webhook_reconcile()");
      statuses = (await client.query<{ status: string; http_status: number | null }>(
        "select status, http_status from files.webhook_deliveries where webhook_id = $1 order by activity_log_id", [hook.webhook_id])).rows;
      if (statuses.length === 4 && statuses.every((s) => s.http_status !== null)) break;
    }
    clause("3  every POST crossed the network and a server answered it",
      statuses.length === 4 && statuses.every((s) => s.http_status !== null),
      statuses.map((s) => `${s.status} HTTP ${s.http_status ?? "—"}`).join(" · "));

    // 4 — what the receiver was sent: the event, never a value.
    const body = (await client.query<{ b: Record<string, unknown> }>(
      "select files.webhook_event_payload($1::bigint, $2::uuid) as b", [events[1]!.id, hook.webhook_id])).rows[0]!.b;
    clause("4  the change event names the table and the two changed Field ids and carries no value",
      JSON.stringify(body).includes(gp.appts!) && !JSON.stringify(body).includes("Thursday"),
      `action ${body.action}, entity_type ${body.entity_type}, metadata keys ${Object.keys((body.metadata ?? {}) as object).join("/")}`);
  } finally {
    if (org) {
      // Archived, never deleted — found again by its settings tag.
      await client.query("rollback").catch(() => {});
      await client.query("update iam.organizations set archived_at = now() where id = $1 and archived_at is null", [org]).catch(() => {});
      await client.query(`update files.webhooks set is_active = false where organization_id = $1`, [org]).catch(() => {});
      console.log(`\x1b[2mThe clinic's branch organization ${org} is archived (settings.test_fixture = gridprim_g4_delivery); its webhook is switched off.\x1b[0m`);
    }
    await client.end();
  }
  if (failures) { console.log(`\x1b[31m${failures} clause(s) failed\x1b[0m`); process.exit(1); }
  console.log("\x1b[32mG4 DELIVERY — four record changes left the database as four signed POSTs and were answered.\x1b[0m");
}

main().catch((e) => { console.error(`\x1b[31m${e instanceof Error ? e.message : String(e)}\x1b[0m`); process.exit(1); });
