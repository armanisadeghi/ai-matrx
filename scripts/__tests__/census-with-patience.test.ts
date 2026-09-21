// scripts/__tests__/census-with-patience.test.ts
//
// THE POLICY, proven. Census 12 of `pnpm check:store-doors-decide` takes 79-98 s against
// the live database and died twice on `55P03 canceling statement due to lock timeout`
// during lane DOORS-GREEN's runs before completing on the third. A guard that is
// intermittently red for a reason that is not a door is a guard people stop reading — and
// the wrong repair is to swallow the error, which turns "we could not look" into "we
// looked and it was fine".
//
// What is mocked here is the CLIENT, not the census: the SQL and the live run are
// untouched, and what these cases exercise is the one thing that is pure control flow —
// how many times we ask, how long we wait, and what we say when contention wins.

import { censusWithPatience, CONTENTION_BACKOFF } from "../lib/census-with-patience";

type Script = Array<{ throwCode?: string; rows?: unknown[] }>;

/** A client that answers the given script, one entry per census attempt. */
function clientRunning(script: Script) {
  const statements: string[] = [];
  let attempt = 0;
  return {
    statements,
    attempts: () => attempt,
    query: async (sql: string) => {
      statements.push(sql);
      if (sql === "begin" || sql === "rollback" || sql.startsWith("set local")) {
        return { rows: [] };
      }
      const step = script[attempt++];
      if (!step) throw new Error(`the census was asked ${attempt} times; the script has ${script.length}`);
      if (step.throwCode) {
        const err = new Error("canceling statement due to lock timeout") as Error & { code?: string };
        err.code = step.throwCode;
        throw err;
      }
      return { rows: step.rows ?? [] };
    },
  };
}

/**
 * The real waits are 5 s and 15 s; a test that actually waited them would be a 20-second
 * test of a `setTimeout`. The NUMBER of attempts is the policy and it is unchanged — the
 * helper takes its waits as a parameter for exactly this, and nothing but a test passes one.
 */
const NO_WAITING = [0, 0] as const;

describe("a census that hits lock contention", () => {
  it("is asked again, and its rows are the real rows when it finally lands", async () => {
    const client = clientRunning([
      { throwCode: "55P03" },
      { throwCode: "55P03" },
      { rows: [{ function_name: "read_record", identity_args: "x" }] },
    ]);
    const result = await censusWithPatience(client, "census 12", "select 1", "900s", NO_WAITING);
    expect(result.unmeasured).toBeNull();
    expect(result.rows).toHaveLength(1);
    expect(client.attempts()).toBe(3);
  });

  it("says NOT MEASURED rather than returning an empty green when every attempt dies", async () => {
    const client = clientRunning([
      { throwCode: "55P03" },
      { throwCode: "55P03" },
      { throwCode: "55P03" },
    ]);
    const result = await censusWithPatience(client, "census 12", "select 1", "900s", NO_WAITING);
    // The two halves that matter: no rows AND a reason. Rows alone would be a false green.
    expect(result.rows).toEqual([]);
    expect(result.unmeasured).toContain("55P03");
    expect(result.unmeasured).toContain("census 12");
    expect(client.attempts()).toBe(NO_WAITING.length + 1);
    // and the shipped policy is the same shape: three attempts, not one.
    expect(CONTENTION_BACKOFF.length + 1).toBe(3);
  });

  it("never hides a failure that is not contention", async () => {
    // A statement timeout, a permission refusal or a syntax error is a REAL failure and
    // retrying it would only make the guard slower at being wrong.
    const client = clientRunning([{ throwCode: "57014" }]);
    await expect(censusWithPatience(client, "census 12", "select 1", "900s", NO_WAITING)).rejects.toThrow(
      /lock timeout/,
    );
    expect(client.attempts()).toBe(1);
  });

  it("always ends its transaction, on every path", async () => {
    const client = clientRunning([{ throwCode: "55P03" }, { rows: [] }]);
    await censusWithPatience(client, "census 12", "select 1", "900s", NO_WAITING);
    const begins = client.statements.filter((s) => s === "begin").length;
    const rollbacks = client.statements.filter((s) => s === "rollback").length;
    expect(begins).toBe(2);
    expect(rollbacks).toBe(2);
  });
});
