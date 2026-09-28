// scripts/__tests__/production-guard.test.ts
//
// THE PRODUCTION GUARD (scripts/lib/production-guard.ts) — incident 2026-09-26, the 49-minute
// REPEATABLE READ transaction. Every loosening is refused before it is sent, and the limits ride
// every transaction shape (recorder client). Routing through `connectDirect` and the live stamp
// are proven against real servers in scripts/lib/production-guard.selftest.mts
// (`pnpm check:production-guard:self-test`) — jest cannot load direct-db.ts (import.meta).

import {
  PRODUCTION_LIMITS_MS,
  ProductionGuardRefusal,
  governProduction,
  productionLimitsSql,
  productionRefusalFor,
} from "../lib/production-guard";

const REFUSED = [
  "set local statement_timeout = '900s'", // the incident, verbatim
  "SET statement_timeout TO 60000",
  "set session lock_timeout = '30s'",
  "set local idle_in_transaction_session_timeout = 0",
  "set transaction_timeout = '1h'",
  "set local transaction_timeout = default",
  "set local lock_timeout = default",
  "reset statement_timeout",
  "RESET ALL",
  "select set_config('statement_timeout', '0', true)",
  "select set_config('transaction_timeout', '20min', false)",
  "alter role postgres set transaction_timeout = 0",
  "set transaction isolation level repeatable read",
  "BEGIN ISOLATION LEVEL SERIALIZABLE",
  "start transaction isolation level repeatable read, read only",
  "set session characteristics as transaction isolation level serializable",
  "set default_transaction_isolation = 'repeatable read'",
  "select set_config('transaction_isolation', 'serializable', true)",
  "/* sneaky */ set local\n  statement_timeout = '15min'; select 1",
];

const ALLOWED = [
  "select * from chat.conversation_summary where id = $1",
  "set local statement_timeout = '5s'",
  "set local lock_timeout = '2s'",
  "set local idle_in_transaction_session_timeout = '30s'",
  "select set_config('statement_timeout', '10000ms', true)",
  "begin read only",
  "set transaction isolation level read committed",
  "-- set local statement_timeout = '900s'\nselect 1",
];

describe("productionRefusalFor", () => {
  it.each(REFUSED)("refuses %s and names the clone", (sql) => {
    const why = productionRefusalFor(sql);
    expect(why).toMatch(/PRODUCTION GUARD REFUSED/);
    expect(why).toMatch(/CLONE/);
    expect(why).toMatch(/CURRENT\.md/);
  });
  it.each(ALLOWED)("allows %s", (sql) => {
    expect(productionRefusalFor(sql)).toBeNull();
  });
});

function recorder() {
  const sent: string[] = [];
  return {
    sent,
    query: async (...args: unknown[]) => {
      sent.push(typeof args[0] === "string" ? args[0] : (args[0] as { text: string }).text);
      return { rows: [] };
    },
    end: async () => undefined,
  };
}

describe("governProduction", () => {
  it("stamps all four limits on the transaction a BEGIN opens", async () => {
    const c = governProduction(recorder(), "t");
    await c.query("begin read only");
    expect(c.sent[0]).toBe("begin read only");
    for (const [g, ms] of Object.entries(PRODUCTION_LIMITS_MS)) expect(c.sent[1]).toContain(`('${g}', '${ms}ms')`);
  });

  it("runs a bare statement inside its own stamped transaction", async () => {
    const c = governProduction(recorder(), "t");
    await c.query("select 1", []);
    expect(c.sent).toEqual(["begin", productionLimitsSql("t"), "select 1", "commit"]);
  });

  it("refuses a raise before anything is sent", async () => {
    const c = governProduction(recorder(), "t");
    await expect(c.query("set local statement_timeout = '900s'")).rejects.toBeInstanceOf(ProductionGuardRefusal);
    await expect(c.query("begin isolation level repeatable read")).rejects.toBeInstanceOf(ProductionGuardRefusal);
    expect(c.sent).toEqual([]);
  });

  it("refuses a rolled-back proof transaction before anything is sent (incident 2026-09-27)", async () => {
    const c = governProduction(recorder(), "t");
    await expect(
      c.query("create temp table proof(step text, what text, val text) on commit drop; grant all on proof to authenticated"),
    ).rejects.toThrow(/ACCESS EXCLUSIVE/);
    expect(c.sent).toEqual([]);
  });
});

// Rule 3 — no DDL on live, ever, rollback or not (incident 2026-09-27 22:26–22:46 PT: a rolled-back
// agent "proof" — `create temp table proof(...) on commit drop; grant all on proof to authenticated;
// ...` — held Supabase's policy_grants locks on auth/storage/realtime 15–27 s; Realtime waited 7–14 s).
const DDL_REFUSED = [
  "create temp table proof(step text, what text, val text) on commit drop;\ngrant all on proof to authenticated;\n-- BEFORE, as test\nselect 1",
  "set local lock_timeout='3s';\ncreate temp table proof(step text, what text, val text) on commit drop;",
  "CREATE TEMPORARY TABLE _door_name_probe (idx int) ON COMMIT DROP",
  "create table if not exists ops.run_ledger (id int)",
  "create or replace function public.zz() returns int language sql as $$ select 1 $$",
  "grant execute on function context.write_context_value(uuid) to authenticated",
  "revoke all on public.t from anon",
  "select 1; /* then */ grant usage on schema x to authenticated",
  "do $$ begin create temp table t(x int); end $$",
  "do $$ begin execute 'grant all on t to authenticated'; end $$",
  "do $$ begin execute format('create table %I (x int)', 'z'); end $$",
];

const DDL_ALLOWED = [
  "select created_at, grantee from information_schema.role_table_grants limit 1",
  "select 'create temp table x' as note",
  "select * from iam.permissions where permission_level = 'grant'",
  "-- create temp table x(y int)\nselect 1",
  "insert into ops.notes(body) values ('please grant all on x to y')",
];

describe("productionRefusalFor — DDL", () => {
  it.each(DDL_REFUSED)("refuses %s and names the clone", (sql) => {
    const why = productionRefusalFor(sql);
    expect(why).toMatch(/PRODUCTION GUARD REFUSED/);
    expect(why).toMatch(/ACCESS EXCLUSIVE/);
    expect(why).toMatch(/CLONE/);
    expect(why).toMatch(/CURRENT\.md/);
  });
  it.each(DDL_ALLOWED)("allows %s", (sql) => {
    expect(productionRefusalFor(sql)).toBeNull();
  });
});
