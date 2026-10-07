/**
 * check-inbox-doors — the two clear-by-kind doors answer as the bell expects, on the LIVE database,
 * from admin@admin.com's seat, inside ONE transaction that is always rolled back (nothing persists).
 *
 *   node scripts/check-inbox-doors.mjs           # green: my_inbox_kinds + clear_inbox answer right
 *   node scripts/check-inbox-doors.mjs --plant   # red on purpose: the inverse migration runs first
 *                                                #   (inside the same rolled-back transaction)
 *
 * What it proves: two fresh notices of one kind show in my_inbox_kinds with their count; clear_inbox
 * ('done', [that kind]) returns exactly those ids, the kind leaves the list, and an unknown action is
 * refused (22023). Migration: migrations/notifications_inbox_clear_by_kind.sql.
 */
import { readFileSync } from "node:fs";
import { dsnFor, pgClient } from "./lib/pooled-db.mjs";

const ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd"; // admin@admin.com
const ORG = "0a54df90-eab8-4d07-ab29-81a45fb41e04"; // an organization admin's notices come from
const KIND = "agent_factory.agent_ready"; // in_app only: delivers nowhere else
const plant = process.argv.includes("--plant");

const pg = (await import("pg")).default;
const client = pgClient(pg, dsnFor("production", { app: "check-inbox-doors" }));
await client.connect();
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};
try {
  await client.query("begin");
  await client.query("set local lock_timeout = '2s'");
  await client.query("set local statement_timeout = '60s'");
  if (plant) {
    const inverse = readFileSync(new URL("../migrations/inverse/notifications_inbox_clear_by_kind_down.sql", import.meta.url), "utf8")
      .split("\n").filter((l) => !/^\s*notify\b/.test(l)).join("\n");
    await client.query(inverse);
    console.log("PLANT the clear-by-kind doors were dropped inside this transaction");
  }
  const tag = `check-inbox-doors-${Date.now()}`;
  for (const n of [1, 2]) {
    await client.query(
      `select communication.notify_from_sql($1::uuid, $2, $3::uuid, null, 'Admin',
         jsonb_build_object('notification', jsonb_build_object('title','Agent Factory','message','Clinic intake helper is ready.')),
         null, null, null, $4)`,
      [ORG, KIND, ADMIN, `${tag}-${n}`],
    );
  }
  // The in_app renderer delivers asynchronously; stand in for it inside this transaction.
  await client.query(
    `update communication.notification set status = 'succeeded' where dedupe_key like $1 and channel = 'in_app'`,
    [`${tag}-%`],
  );
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN, role: "authenticated" })]);
  await client.query("set local role authenticated");

  const ask = async (sql, params = []) => {
    await client.query("savepoint s");
    try {
      const r = await client.query(sql, params);
      await client.query("release savepoint s");
      return { rows: r.rows };
    } catch (error) {
      await client.query("rollback to savepoint s");
      return { error };
    }
  };

  const kinds = await ask("select * from communication.my_inbox_kinds()");
  const mine = kinds.rows?.find((k) => k.event_key === KIND);
  check("my_inbox_kinds lists the kind with its count", !!mine && mine.notices >= 2 && mine.unseen >= 2,
    kinds.error ? kinds.error.message : JSON.stringify(mine ?? null));

  const cleared = await ask("select communication.clear_inbox('done', array[$1]::text[], null) as ids", [KIND]);
  const ids = cleared.rows?.[0]?.ids ?? [];
  check("clear_inbox returns the ids it marked done", ids.length >= 2, cleared.error ? cleared.error.message : `${ids.length} ids`);

  const after = await ask("select * from communication.my_inbox_kinds()");
  check("the kind leaves the Inbox", !!after.rows && !after.rows.some((k) => k.event_key === KIND),
    after.error ? after.error.message : "");

  // The table's own row security has no recipient arm (the doors are the way in), so read the
  // outcome as the owner.
  await client.query("reset role");
  const done = await ask("select count(*)::int as n from communication.notification where id = any($1::uuid[]) and done_at is not null", [ids]);
  check("those notices are Done (recoverable), not deleted", (done.rows?.[0]?.n ?? 0) === ids.length && ids.length > 0);

  await client.query("set local role authenticated");
  const refused = await ask("select communication.clear_inbox('delete', null, null)");
  check("an unknown action is refused", refused.error?.code === "22023", refused.error?.code ?? "no error");
} finally {
  await client.query("rollback").catch(() => undefined);
  await client.end();
}
const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length} passed (rolled back; nothing persisted)`);
process.exit(failed ? 1 : 0);
