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
});
