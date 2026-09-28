// scripts/__tests__/check-target.test.ts
//
// WHERE A CHECK RUNS (scripts/lib/check-target.ts), proven without a database: the target flag,
// the CLONE-REF pointer (including `promoted`), the connection half of the clone's identity
// (production presented as the clone is refused), the server half (the quarantine facts), the
// [TARGET] line, and the live gate ceiling in scripts/lib/gate-db.ts. The live half — that a run
// on the clone leaves nothing on live — was measured on 2026-09-28 (see the lane report).

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CheckTargetRefusal,
  assertConnectionIsClone,
  assertQuarantined,
  ceilingFor,
  cloneAge,
  parseCheckTarget,
  parsePromoted,
  resolveCheckDb,
  targetBanner,
} from "../lib/check-target";
import { GATE_DB_LIMITS, GateDbRefusal, resolveCeiling } from "../lib/gate-db";
import { loadCloneRef } from "../lib/migration-target";

const CLONE = "hykobnqyuxspbcijrodb";
const PROD = "brsgrqvjdzwihsvnfqkf";

function writeCloneRef(extra = "", passwordFile = "/nonexistent/clone-password.txt"): string {
  const dir = mkdtempSync(join(tmpdir(), "check-target-"));
  const path = join(dir, "CLONE-REF");
  writeFileSync(
    path,
    [
      "# a comment line is ignored",
      `clone_ref         = ${CLONE}`,
      "clone_name        = clone-20260926",
      `parent_ref        = ${PROD}`,
      "pooler_host       = aws-0-us-east-1.pooler.supabase.com",
      "pooler_port       = 6543",
      `pooler_user       = postgres.${CLONE}`,
      "database          = postgres",
      "system_identifier        = 7642734024280108049",
      "parent_system_identifier = 7642734024280108049",
      `password_file     = ${passwordFile}`,
      "password_env_var  = CLONE_DATABASE_URL",
      extra,
    ].join("\n"),
  );
  return path;
}

describe("parseCheckTarget", () => {
  it("defaults to the fallback when no flag is given", () => {
    expect(parseCheckTarget([], "clone")).toEqual({ target: "clone", explicit: false });
    expect(parseCheckTarget(["--strict"], "production")).toEqual({ target: "production", explicit: false });
  });
  it("reads both spellings", () => {
    expect(parseCheckTarget(["--target", "production"], "clone")).toEqual({ target: "production", explicit: true });
    expect(parseCheckTarget(["--target=clone"], "production")).toEqual({ target: "clone", explicit: true });
  });
  it("refuses anything else, the retired branch included, and never coerces", () => {
    expect(() => parseCheckTarget(["--target", "branch"], "clone")).toThrow(CheckTargetRefusal);
    expect(() => parseCheckTarget(["--target"], "clone")).toThrow(/not a check target/);
    expect(() => parseCheckTarget(["--target=live"], "clone")).toThrow(CheckTargetRefusal);
  });
});

describe("the CLONE-REF pointer", () => {
  it("parses every identity plus `promoted`", () => {
    const ref = loadCloneRef("/", writeCloneRef("promoted          = 2026-09-26T12:50:59Z"));
    expect(ref.cloneRef).toBe(CLONE);
    expect(ref.parentRef).toBe(PROD);
    expect(ref.poolerUser).toBe(`postgres.${CLONE}`);
    expect(ref.poolerPort).toBe(6543);
    expect(ref.promoted).toBe("2026-09-26T12:50:59Z");
  });
  it("carries an empty `promoted` when the file says nothing, and the age says so", () => {
    const ref = loadCloneRef("/", writeCloneRef());
    expect(ref.promoted).toBe("");
    expect(cloneAge(ref.promoted)).toMatch(/promotion time unknown/);
  });
  it("refuses a file missing a required identity", () => {
    const dir = mkdtempSync(join(tmpdir(), "check-target-"));
    const path = join(dir, "CLONE-REF");
    writeFileSync(path, `clone_ref = ${CLONE}\n`);
    expect(() => loadCloneRef("/", path)).toThrow(/missing/);
  });
  it("ages the clone from `promoted`", () => {
    const now = new Date("2026-09-28T06:53:00Z");
    expect(parsePromoted("2026-09-26T12:50:59Z")?.toISOString()).toBe("2026-09-26T12:50:59.000Z");
    expect(parsePromoted("yesterday-ish")).toBeNull();
    expect(cloneAge("2026-09-26T12:50:59Z", now)).toBe("1d 18h old");
    expect(cloneAge("2026-09-28T01:00:00Z", now)).toBe("5h old");
  });
});

describe("the clone's identity", () => {
  const ref = loadCloneRef("/", writeCloneRef("promoted = 2026-09-26T12:50:59Z"));

  it("accepts the clone's own pooler connection", () => {
    expect(() =>
      assertConnectionIsClone({ user: `postgres.${CLONE}`, host: "aws-0-us-east-1.pooler.supabase.com" }, ref),
    ).not.toThrow();
  });
  it("REFUSES production presented as the clone (pooler user, direct host, the live URL)", () => {
    for (const env of [
      { user: `postgres.${PROD}`, host: "aws-0-us-east-1.pooler.supabase.com" },
      { user: "postgres", host: `db.${PROD}.supabase.co` },
      { user: "postgres", host: "db.matrxserver.com" },
    ]) {
      expect(() => assertConnectionIsClone(env, ref)).toThrow(/not the dev clone/);
    }
  });
  it("refuses a connection with no project ref at all", () => {
    expect(() => assertConnectionIsClone({ user: "postgres", host: "localhost" }, ref)).toThrow(CheckTargetRefusal);
  });
  it("refuses a CLONE-REF that names production as the clone", () => {
    const bad = { ...ref, cloneRef: PROD };
    expect(() => assertConnectionIsClone({ user: `postgres.${PROD}`, host: "x" }, bad)).toThrow(/its own parent/);
  });
  it("requires the quarantine facts in conjunction: production's shape is refused", () => {
    const quarantined = { pgNetInstalled: false, activeCronJobs: 0, cronTablePresent: true, quarantined: true };
    expect(() => assertQuarantined(quarantined, ref)).not.toThrow();
    expect(() =>
      assertQuarantined({ pgNetInstalled: true, activeCronJobs: 31, cronTablePresent: true, quarantined: false }, ref),
    ).toThrow(/NOT quarantined/);
    expect(() =>
      assertQuarantined({ pgNetInstalled: false, activeCronJobs: 2, cronTablePresent: true, quarantined: false }, ref),
    ).toThrow(CheckTargetRefusal);
  });
  it("resolves the clone from CLONE-REF + a DSN, and refuses a DSN that is production", () => {
    const path = writeCloneRef("promoted = 2026-09-26T12:50:59Z");
    const saved = process.env.CLONE_DATABASE_URL;
    try {
      process.env.CLONE_DATABASE_URL = `postgresql://postgres.${CLONE}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
      const ok = resolveCheckDb({ argv: [`--clone-ref=${path}`], defaultTarget: "clone", root: "/nonexistent-root" });
      expect(ok.target).toBe("clone");
      expect(ok.env.user).toBe(`postgres.${CLONE}`);
      expect(ok.cloneRef?.promoted).toBe("2026-09-26T12:50:59Z");
      process.env.CLONE_DATABASE_URL = `postgresql://postgres.${PROD}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;
      expect(() =>
        resolveCheckDb({ argv: [`--clone-ref=${path}`], defaultTarget: "clone", root: "/nonexistent-root" }),
      ).toThrow(/does not point at the dev clone/);
    } finally {
      if (saved === undefined) delete process.env.CLONE_DATABASE_URL;
      else process.env.CLONE_DATABASE_URL = saved;
    }
  });
});

describe("the [TARGET] line", () => {
  const ref = loadCloneRef("/", writeCloneRef("promoted = 2026-09-26T12:50:59Z"));
  it("names the clone, its promotion time and that it is not a live result", () => {
    const line = targetBanner("check:x", "clone", { cloneRef: ref, explicit: false }, new Date("2026-09-28T06:53:00Z"));
    expect(line).toMatch(/^\[TARGET\] check:x: the nightly CLONE hykobnqyuxspbcijrodb/);
    expect(line).toContain("promoted 2026-09-26T12:50:59Z");
    expect(line).toContain("1d 18h old");
    expect(line).toContain("not a live one");
  });
  it("names live and its ceiling", () => {
    const line = targetBanner("check:x", "production", { liveRef: PROD, explicit: true });
    expect(line).toContain(`LIVE production ${PROD} (--target production)`);
    expect(line).toContain("capped at 30 s");
  });
});

describe("the live ceiling", () => {
  it("ceilingFor holds production to 30 s and leaves the clone its clock", () => {
    expect(ceilingFor("production", 540_000)).toBe("30s");
    expect(ceilingFor("production", 5_000)).toBe("5s");
    expect(ceilingFor("clone", 540_000)).toBe("540s");
    expect(ceilingFor("clone", 1_500)).toBe("1500ms");
  });
  it("gate-db: on live the default is the live ceiling and more is REFUSED; the clone keeps its reasoned budget", () => {
    expect(resolveCeiling({ gate: "g" }, true)).toBe(GATE_DB_LIMITS.liveStatementTimeoutMs);
    expect(resolveCeiling({ gate: "g" }, false)).toBe(GATE_DB_LIMITS.statementTimeoutMs);
    expect(() =>
      resolveCeiling({ gate: "g", statementTimeoutMs: 540_000, statementTimeoutReason: "census" }, true),
    ).toThrow(GateDbRefusal);
    expect(() => resolveCeiling({ gate: "g", statementTimeoutMs: 60_000, statementTimeoutReason: "x" }, true)).toThrow(
      /--target clone/,
    );
    expect(resolveCeiling({ gate: "g", statementTimeoutMs: 540_000, statementTimeoutReason: "census" }, false)).toBe(540_000);
  });
});
