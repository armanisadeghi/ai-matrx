/**
 * THE SCRATCH TEARDOWN, RED AND GREEN (DC-027 #8).
 *
 * The break each case names:
 *   - swallow a teardown error (`catch {}`)          → case "permission denied" goes silent;
 *   - let the leftover probe throw past the report    → the same case throws instead of reporting;
 *   - treat an unreadable probe as "zero"             → case "no count" reads clean;
 *   - skip later steps after one fails                → the drop is never attempted;
 *   - report success without actually deleting        → case "no-op delete" reads clean.
 *
 * The door is a double of the DATABASE (an external dependency), modelled as an in-memory registry
 * and namespace set so a GREEN is reachable only if the plan really deletes and really probes.
 *
 * matrx-real-data:allow — every `zz_` name below quotes the REAL scratch schema/token this suite's
 * subject (`registeredScratchPlan` in scripts/lib/scratch-teardown.ts) actually produced on
 * 2026-09-14 07:12:11Z (see that file's header) and the SAME production code REQUIRES every
 * registered scratch name to start with "zz_" (it throws otherwise, asserted at line 102 below) —
 * this is a functional naming convention enforced by live code, not junk test data.
 */
import { registeredScratchPlan, teardownScratch, type ScratchSqlRunner } from "@/scripts/lib/scratch-teardown";

const SCHEMA = "zz_staff_door_selftest_mu0wnnb1"; // matrx-real-data:allow real scratch schema name; zz_ prefix is enforced by registeredScratchPlan
const TOKEN = `${SCHEMA}_token`;

function fakeDb(opts: { denyEntityTypes?: boolean; noopDelete?: boolean; probeReturnsNothing?: boolean } = {}) {
  const tokens = new Set([TOKEN]);
  const schemas = new Set([SCHEMA]);
  const seen: string[] = [];
  const run: ScratchSqlRunner = async (sql) => {
    seen.push(sql);
    if (opts.denyEntityTypes && (/entity_types/.test(sql) || /^drop schema/.test(sql))) {
      // What postgres_logs recorded at 2026-09-14 07:12:57Z. The drop fails too: its sql_drop event
      // trigger writes platform.entity_types.
      throw new Error("400: permission denied for table entity_types");
    }
    let m = sql.match(/^delete from platform\.entity_types where token in \((.*)\)$/);
    if (m) {
      if (!opts.noopDelete) for (const t of m[1].split(",")) tokens.delete(t.trim().replace(/^'|'$/g, ""));
      return [];
    }
    m = sql.match(/^drop schema if exists (\S+) cascade$/);
    if (m) { schemas.delete(m[1]); return []; }
    if (opts.probeReturnsNothing) return [];
    m = sql.match(/from platform\.entity_types where token = '(.*)'$/);
    if (m) return [{ n: tokens.has(m[1]) ? 1 : 0 }];
    m = sql.match(/from pg_namespace where nspname = '(.*)'$/);
    if (m) return [{ n: schemas.has(m[1]) ? 1 : 0 }];
    throw new Error(`unexpected SQL in fake: ${sql}`);
  };
  return { run, tokens, schemas, seen };
}

const plan = (run: ScratchSqlRunner) =>
  registeredScratchPlan({ owner: "check:staff-door --self-test", run, schema: SCHEMA, tokens: [TOKEN] });

describe("teardownScratch", () => {
  it("a teardown that is denied is REPORTED by name, with the error and the remedy — never swallowed, never thrown", async () => {
    const db = fakeDb({ denyEntityTypes: true });
    const logged: string[] = [];
    const report = await teardownScratch(plan(db.run), (l) => logged.push(l));

    expect(report.ok).toBe(false);
    expect(report.failedSteps.map((f) => f.what)).toEqual([
      "platform.entity_types rows zz_staff_door_selftest_mu0wnnb1_token",
      "schema zz_staff_door_selftest_mu0wnnb1",
    ]);
    expect(report.failedSteps[0].error).toContain("permission denied for table entity_types");
    expect(report.unverified.map((u) => u.what)).toEqual(["platform.entity_types token zz_staff_door_selftest_mu0wnnb1_token"]);
    expect(report.present).toEqual(["schema zz_staff_door_selftest_mu0wnnb1"]);
    const text = logged.join("\n");
    expect(text).toContain("SCRATCH LEFT BEHIND by check:staff-door --self-test");
    expect(text).toContain("delete from platform.entity_types where token in ('zz_staff_door_selftest_mu0wnnb1_token');");
    expect(text).toContain("drop schema if exists zz_staff_door_selftest_mu0wnnb1 cascade;");
    expect(text).toContain("pnpm db:apply");
  });

  it("every step is attempted even after an earlier one fails", async () => {
    const db = fakeDb({ denyEntityTypes: true });
    await teardownScratch(plan(db.run), () => {});
    expect(db.seen).toContain("drop schema if exists zz_staff_door_selftest_mu0wnnb1 cascade");
  });

  it("a healthy teardown really removes both objects and prints nothing", async () => {
    const db = fakeDb();
    const logged: string[] = [];
    const report = await teardownScratch(plan(db.run), (l) => logged.push(l));
    expect(report.ok).toBe(true);
    expect(logged).toEqual([]);
    expect([...db.tokens]).toEqual([]);
    expect([...db.schemas]).toEqual([]);
  });

  it("a delete that reports success but removes nothing is caught by the probe", async () => {
    const db = fakeDb({ noopDelete: true });
    const report = await teardownScratch(plan(db.run), () => {});
    expect(report.ok).toBe(false);
    expect(report.present).toEqual(["platform.entity_types token zz_staff_door_selftest_mu0wnnb1_token"]);
  });

  it("a probe that returns no count is UNVERIFIED, never read as clean", async () => {
    const db = fakeDb({ probeReturnsNothing: true });
    const report = await teardownScratch(plan(db.run), () => {});
    expect(report.ok).toBe(false);
    expect(report.unverified).toHaveLength(2);
  });

  it("refuses a scratch name without the zz_ prefix", () => {
    expect(() => registeredScratchPlan({ owner: "x", run: fakeDb().run, schema: "staff_door_probe" })).toThrow(/start with "zz_"/);
  });
});
