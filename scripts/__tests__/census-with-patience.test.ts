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

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { censusWithPatience, CONTENTION_BACKOFF, describeHolder } from "../lib/census-with-patience";

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

describe("single flight (2026-09-25, the live database freeze; 2026-09-27, name and wait)", () => {
  /**
   * A client whose advisory lock is held for the first `heldFor` tries, by a backend the
   * server names. `holder: null` is a holder that let go before it could be asked.
   */
  function lockClient(heldFor: number, holder: { pid: number; application_name: string; held_s: number } | null = {
    pid: 4242,
    application_name: "census 12#93355@lane-mac",
    held_s: 75,
  }) {
    const statements: string[] = [];
    let tries = 0;
    return {
      statements,
      tries: () => tries,
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ got: tries++ >= heldFor }] };
        if (sql.includes("pg_locks")) return { rows: holder ? [holder] : [] };
        return { rows: sql === "select census" ? [{ n: 1 }] : [] };
      },
    };
  }
  const NO_PAUSE = { pollMs: 0, shareDir: null } as const;

  it("a second caller never starts a second copy: while the lock is held it does not run the census", async () => {
    const c = lockClient(Number.POSITIVE_INFINITY);
    const out = await censusWithPatience(c, "census 12", "select census", "540s", [], "census:x", {
      lockWaitMs: 0,
      ...NO_PAUSE,
    });
    expect(out.rows).toEqual([]);
    expect(c.statements).not.toContain("select census");
    expect(c.statements.at(-1)).toBe("rollback");
  });

  it("when it gives up, the UNMEASURED line NAMES the holder - pid, application name, how long", async () => {
    const c = lockClient(Number.POSITIVE_INFINITY);
    const out = await censusWithPatience(c, "census 12", "select census", "540s", [], "census:x", {
      lockWaitMs: 0,
      ...NO_PAUSE,
    });
    expect(out.unmeasured).toMatch(/SKIPPED/);
    expect(out.unmeasured).toContain("backend pid 4242");
    expect(out.unmeasured).toContain("census 12#93355@lane-mac");
  });

  it("it WAITS for the holder and then runs its own census - the lock costs it one census, not a verdict", async () => {
    const c = lockClient(3);
    const out = await censusWithPatience(c, "census 12", "select census", "540s", [], "census:x", {
      lockWaitMs: 60_000,
      ...NO_PAUSE,
    });
    expect(out.unmeasured).toBeNull();
    expect(out.rows).toEqual([{ n: 1 }]);
    expect(c.tries()).toBe(4);
    // every wait is its own short transaction: nothing is held open while it waits
    const begins = c.statements.filter((s) => s === "begin").length;
    const rollbacks = c.statements.filter((s) => s === "rollback").length;
    expect(begins).toBe(4);
    expect(rollbacks).toBe(4);
  });

  it("a holder that let go before it could be named is said so, never left blank", async () => {
    expect(describeHolder(null)).toMatch(/already let go/);
  });

  it("the caller that gets the lock runs the census inside the same transaction, stamped with who it is", async () => {
    const c = lockClient(0);
    const out = await censusWithPatience(c, "census 12", "select census", "540s", [], "census:x", {
      whoAmI: "census 12#1@here",
      shareDir: null,
    });
    expect(out.unmeasured).toBeNull();
    expect(out.rows).toEqual([{ n: 1 }]);
    const lockAt = c.statements.findIndex((s) => s.includes("pg_try_advisory_xact_lock"));
    const stampAt = c.statements.findIndex((s) => s.includes("set_config('application_name'"));
    expect(stampAt).toBeGreaterThan(c.statements.indexOf("begin"));
    expect(stampAt).toBeLessThan(lockAt);
    expect(lockAt).toBeLessThan(c.statements.indexOf("select census"));
  });

  describe("one answer per wave", () => {
    /** The holder: runs the census for real and leaves its outcome in `dir`. */
    async function holderRuns(dir: string, sql = "select census") {
      const c = lockClient(0);
      return censusWithPatience(c, "census 12", sql, "540s", [], "census:x", { whoAmI: "holder#1", shareDir: dir, pollMs: 0 });
    }

    it("a run that WAITED adopts the outcome its holder left, instead of running a second copy", async () => {
      const dir = mkdtempSync(join(tmpdir(), "census-share-"));
      const waiter = lockClient(2);
      let heldOnce = false;
      const original = waiter.query;
      // the holder finishes while the waiter is polling
      waiter.query = async (sql: string) => {
        if (sql.includes("pg_try_advisory_xact_lock") && !heldOnce) {
          heldOnce = true;
          await holderRuns(dir);
        }
        return original(sql);
      };
      const out = await censusWithPatience(waiter, "census 12", "select census", "540s", [], "census:x", {
        lockWaitMs: 60_000,
        pollMs: 0,
        shareDir: dir,
      });
      expect(out).toEqual({ rows: [{ n: 1 }], unmeasured: null });
      expect(waiter.statements).not.toContain("select census");
    });

    it("never adopts an outcome over DIFFERENT SQL, or one that landed before the run asked", async () => {
      const dir = mkdtempSync(join(tmpdir(), "census-share-"));
      await holderRuns(dir, "select an older census");
      const waiter = lockClient(1);
      const out = await censusWithPatience(waiter, "census 12", "select census", "540s", [], "census:x", {
        lockWaitMs: 60_000,
        pollMs: 0,
        shareDir: dir,
      });
      expect(out.rows).toEqual([{ n: 1 }]);
      expect(waiter.statements).toContain("select census");

      const stale = mkdtempSync(join(tmpdir(), "census-share-"));
      writeFileSync(
        join(stale, "census_x.json"),
        JSON.stringify({ sqlHash: "whatever", finishedAt: 0, by: "old", rows: [], unmeasured: null }),
      );
      const w2 = lockClient(1);
      await censusWithPatience(w2, "census 12", "select census", "540s", [], "census:x", {
        lockWaitMs: 60_000,
        pollMs: 0,
        shareDir: stale,
      });
      expect(w2.statements).toContain("select census");
    });
  });
});
