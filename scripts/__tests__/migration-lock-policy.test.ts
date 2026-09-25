/**
 * LOCK-QUEUE (2026-09-25): a migration waits <= 3 s per lock attempt and the runner retries.
 *
 * A file's own `set lock_timeout = '30s'` beats the runner's 2 s, and while that DDL waits for
 * ACCESS EXCLUSIVE every later reader of the table queues behind it (auth.users,
 * iam.permissions). The twin suite is aidream/db/tests/test_migration_lock_policy.py; the two
 * policies must answer the same.
 */
import {
  LOCK_RETRY_CAP_SECONDS,
  backoffSeconds,
  isLockTimeout,
  parseDurationMs,
  timeoutOverrideFindings,
} from "../lib/migration-lock-policy";

const CEIL = 600_000;
const found = (sql: string) => timeoutOverrideFindings(sql, CEIL).map((f) => [f.line, f.text]);

describe("the lock-wait refusal", () => {
  it("refuses the 2026-09-25 shape and names its line", () => {
    const sql = "-- census\nset lock_timeout = '30s';\ndrop trigger if exists t on auth.users;\n";
    expect(found(sql)).toEqual([[2, "set lock_timeout = '30s'"]]);
  });

  it.each([
    "set local lock_timeout = '5s';",
    "SET LOCAL lock_timeout TO '4s';",
    "set lock_timeout = 3001;",
    "set lock_timeout = 0;",
    "set lock_timeout = default;",
    "reset lock_timeout;",
    "select set_config('lock_timeout', '30s', true);",
    "do $$ begin set local lock_timeout = '10s'; end $$;",
    "set statement_timeout = '20min';",
    "set statement_timeout = 0;",
  ])("refuses %s", (stmt) => {
    expect(found(stmt)).toHaveLength(1);
  });

  it.each([
    "set local lock_timeout = '2s';",
    "set lock_timeout = '3s';",
    "set lock_timeout = '1500ms';",
    "set statement_timeout = '600s';",
    "insert into t values ('SET lock_timeout = ''5s'' and call provision again');",
    "-- set lock_timeout = '30s'\nselect 1;",
    "alter role postgres set lock_timeout = '5s';",
    "create or replace function f() returns int language sql set lock_timeout = '9s' as $$ select 1 $$;",
    "create function g() returns void language plpgsql as $$ begin set local lock_timeout = '60s'; end $$;",
  ])("allows %s", (sql) => {
    expect(found(sql)).toEqual([]);
  });

  it("parses Postgres duration units", () => {
    expect(parseDurationMs("'2s'")).toBe(2000);
    expect(parseDurationMs("1500")).toBe(1500);
    expect(parseDurationMs("'1min'")).toBe(60_000);
    expect(parseDurationMs("default")).toBeNull();
    expect(() => parseDurationMs("'soon'")).toThrow();
  });
});

describe("the retry", () => {
  it("backs off with bounded jitter", () => {
    expect(backoffSeconds(1, () => 0)).toBeCloseTo(0.25);
    expect(backoffSeconds(1, () => 1)).toBeCloseTo(0.5);
    expect(backoffSeconds(20, () => 1)).toBe(LOCK_RETRY_CAP_SECONDS);
  });

  it("retries only lock_not_available", () => {
    expect(isLockTimeout({ code: "55P03" })).toBe(true);
    expect(isLockTimeout({ code: "42601" })).toBe(false);
    expect(isLockTimeout(new Error("x"))).toBe(false);
  });
});
