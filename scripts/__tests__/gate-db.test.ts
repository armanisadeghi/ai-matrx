// scripts/__tests__/gate-db.test.ts
//
// THE GATE DATABASE RULES, proven without a database. What is faked is the pg CLIENT (a
// recorder of statements); what is exercised is the helper's own control flow — which
// statements it refuses, which limits it wraps around each transaction, and how many sessions
// one gate may hold. The live half (that Supavisor drops startup parameters and inherits a
// session SET) was measured on the clone on 2026-09-25 and is recorded in scripts/lib/gate-db.ts.

import {
  GATE_DB_LIMITS,
  GateDbRefusal,
  gateSessionCap,
  governClient,
  openGateSessions,
  refusalFor,
  reserveGateSession,
  tryGateLock,
} from "../lib/gate-db";

function recorder() {
  const sent: string[] = [];
  const client = {
    sent,
    query: async (...args: unknown[]) => {
      const text = typeof args[0] === "string" ? args[0] : (args[0] as { text: string }).text;
      sent.push(text);
      if (text.includes(";\nselect 1; select 2")) return [{ rows: [] }, { rows: [1] }, { rows: [2] }];
      if (text.includes("pg_try_advisory_xact_lock")) return { rows: [{ got: false }] };
      return { rows: [{ text }] };
    },
    end: async () => undefined,
  };
  return client;
}

describe("refusalFor", () => {
  const ceiling = GATE_DB_LIMITS.statementTimeoutMs;

  it("refuses a session-level SET of any timeout (it leaks onto a pooled backend)", () => {
    expect(refusalFor("set statement_timeout = '180s'", ceiling)).toMatch(/session-level/);
    expect(refusalFor("SET SESSION lock_timeout TO 5000", ceiling)).toMatch(/session-level/);
    expect(refusalFor("select 1; set idle_in_transaction_session_timeout = 0", ceiling)).toMatch(/session-level/);
    expect(refusalFor("select set_config('statement_timeout', '5s', false)", ceiling)).toMatch(/session-level/);
  });

  it("refuses a local statement_timeout above the ceiling, and zero", () => {
    expect(refusalFor("set local statement_timeout = '900s'", ceiling)).toMatch(/above this gate's ceiling/);
    expect(refusalFor("set local statement_timeout = 0", ceiling)).toMatch(/no limit/);
    expect(refusalFor("select set_config('statement_timeout', '2min', true)", ceiling)).toMatch(/ceiling/);
  });

  it("refuses a lock_timeout above 3 s and an idle-in-transaction timeout above 60 s", () => {
    expect(refusalFor("set local lock_timeout = '20s'", ceiling)).toMatch(/lock_timeout 20000 ms/);
    expect(refusalFor("set local idle_in_transaction_session_timeout = '5min'", ceiling)).toMatch(/idle/);
  });

  it("allows what is within the limits, and ignores comments", () => {
    expect(refusalFor("set local statement_timeout = '60s'", ceiling)).toBeNull();
    expect(refusalFor("set local statement_timeout = 6000", ceiling)).toBeNull();
    expect(refusalFor("set local lock_timeout = '1500ms'", ceiling)).toBeNull();
    expect(refusalFor("-- set statement_timeout = '900s'\nselect 1", ceiling)).toBeNull();
    expect(refusalFor("set role none", ceiling)).toBeNull();
    expect(refusalFor("set local statement_timeout = '900s'", 900_000)).toBeNull();
  });
});

describe("governClient", () => {
  it("wraps a bare statement in its own transaction carrying every limit", async () => {
    const c = recorder();
    governClient(c, { gate: "check:demo" });
    await c.query("select 1", []);
    expect(c.sent[0]).toBe("begin");
    expect(c.sent[1]).toMatch(/set_config\('statement_timeout', '60000ms', true\)/);
    expect(c.sent[1]).toMatch(/set_config\('lock_timeout', '3000ms', true\)/);
    expect(c.sent[1]).toMatch(/set_config\('idle_in_transaction_session_timeout', '60000ms', true\)/);
    expect(c.sent[1]).toMatch(/set_config\('application_name', 'gate:check:demo', true\)/);
    expect(c.sent.slice(2)).toEqual(["select 1", "commit"]);
  });

  it("applies the limits right after a gate's own BEGIN and passes the transaction through", async () => {
    const c = recorder();
    governClient(c, { gate: "check:demo" });
    await c.query("begin");
    await c.query("select 2");
    await c.query("rollback");
    await c.query("select 3");
    expect(c.sent[0]).toBe("begin");
    expect(c.sent[1]).toMatch(/^select set_config/);
    expect(c.sent[2]).toBe("select 2");
    expect(c.sent[3]).toBe("rollback");
    expect(c.sent[4]).toBe("begin"); // select 3 is bare again, so it gets its own
  });

  it("heads a multi-statement batch with the limits and hides that extra result", async () => {
    const c = recorder();
    governClient(c, { gate: "check:demo" });
    const out = (await c.query("select 1; select 2")) as unknown[];
    expect(c.sent[0]).toMatch(/^select set_config[\s\S]*;\nselect 1; select 2$/);
    expect(out).toEqual([{ rows: [1] }, { rows: [2] }]);
  });

  it("refuses before sending anything", async () => {
    const c = recorder();
    governClient(c, { gate: "check:demo" });
    await expect(c.query("set statement_timeout = '180s'")).rejects.toBeInstanceOf(GateDbRefusal);
    expect(c.sent).toEqual([]);
  });

  it("refuses a raised ceiling that names no reason, and accepts one that does", () => {
    expect(() => governClient(recorder(), { gate: "g", statementTimeoutMs: 180_000 })).toThrow(/no statementTimeoutReason/);
    expect(() =>
      governClient(recorder(), { gate: "g", statementTimeoutMs: 180_000, statementTimeoutReason: "a census" }),
    ).not.toThrow();
  });
});

describe("sessions", () => {
  it("holds at most two sessions per gate process, and a closed one frees its slot", async () => {
    const start = openGateSessions();
    expect(start).toBe(0);
    reserveGateSession("g");
    const a = governClient(recorder(), { gate: "g" });
    reserveGateSession("g");
    const b = governClient(recorder(), { gate: "g" });
    expect(() => reserveGateSession("g")).toThrow(/at most 2/);
    await a.end();
    expect(openGateSessions()).toBe(1);
    reserveGateSession("g");
    await b.end();
    await b.end(); // idempotent: a double end never frees a slot it does not hold
    expect(openGateSessions()).toBe(1);
  });

  it("caps a requested worker count at the session ceiling", () => {
    expect(gateSessionCap(6, "g")).toBe(2);
    expect(gateSessionCap(1, "g")).toBe(1);
    expect(gateSessionCap(0, "g")).toBe(1);
  });
});

describe("tryGateLock", () => {
  it("asks for a TRANSACTION-scoped advisory lock (safe through the pooler) and reports a miss", async () => {
    const c = recorder();
    const got = await tryGateLock(c as never, "census:x");
    expect(got).toBe(false);
    expect(c.sent[0]).toMatch(/pg_try_advisory_xact_lock/);
  });
});
