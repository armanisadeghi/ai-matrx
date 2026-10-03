/**
 * @jest-environment node
 *
 * THE LIVE DATABASE IS WHERE TESTS RUN (owner ruling, Arman, 2026-10-03).
 *
 * `scripts/lib/direct-db-env.ts` `testDbEnvFrom` is the ONE door every live jest suite takes, and it
 * answers the same live connection the operator tools (`pnpm db:apply`) resolve — nothing repoints
 * it to the clone, and no clock window gates it. The nightly clone is only for rehearsing
 * destructive migrations and long-locking jobs: a suite's DDL part asks `rehearsalDbEnvFrom`, which
 * reads ONLY the process environment and refuses a URL that names live.
 *
 * Every clause builds a throwaway root whose `.env` carries the live database's IDENTITY with an
 * unusable password — nothing here ever connects.
 */
import { describe, expect, it } from "@jest/globals";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { loadDbEnvFrom, rehearsalDbEnvFrom, testDbEnvFrom } from "../lib/direct-db-env";

const LIVE_USER = "postgres.brsgrqvjdzwihsvnfqkf";
const CLONE_URL =
  "postgresql://postgres.jxhgzalwckuarngvsdyq:not-a-real-password@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
const LIVE_URL = `postgresql://${LIVE_USER}:never-used@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

function liveRoot(extra = ""): string {
  const root = mkdtempSync(join(tmpdir(), "live-db-door-"));
  writeFileSync(
    join(root, ".env"),
    [
      "SUPABASE_MATRIX_HOST=aws-0-us-east-1.pooler.supabase.com",
      "SUPABASE_MATRIX_PORT=6543",
      `SUPABASE_MATRIX_USER=${LIVE_USER}`,
      "SUPABASE_MATRIX_PASSWORD=never-used",
      "SUPABASE_MATRIX_DATABASE_NAME=postgres",
      extra,
    ].join("\n"),
  );
  return root;
}

const noEnv: NodeJS.ProcessEnv = { NODE_ENV: "test", AIDREAM_DIR: "/nonexistent-aidream" };

describe("the live-database door for jest", () => {
  it("a test gets the same live connection the operator loader answers", () => {
    const root = liveRoot();
    const op = loadDbEnvFrom(root, noEnv);
    const test = testDbEnvFrom(root, { env: noEnv });
    expect("user" in op && op.user).toBe(LIVE_USER);
    expect(test.user).toBe(LIVE_USER);
  });

  it("a clone URL saved in the env files never repoints a test (the clone is rehearsal-only)", () => {
    const root = liveRoot(`MATRX_TEST_DATABASE_URL=${CLONE_URL}\nSUPABASE_BRANCH_DATABASE_URL=${CLONE_URL}\nCLONE_DATABASE_URL=${CLONE_URL}`);
    expect(testDbEnvFrom(root, { env: noEnv }).user).toBe(LIVE_USER);
  });

  it("no clock window: any hour reaches live without a flag or a reason", () => {
    expect(testDbEnvFrom(liveRoot(), { env: noEnv }).from).not.toMatch(/LIVE on purpose/);
  });

  it("missing variables are UNMEASURED — thrown, never a silent pass", () => {
    const root = mkdtempSync(join(tmpdir(), "live-db-door-"));
    expect(() => testDbEnvFrom(root, { env: noEnv })).toThrow(/UNMEASURED/);
  });

  it("a rehearsal target comes only from this run's environment and never names live", () => {
    expect(rehearsalDbEnvFrom({ env: noEnv })).toBeNull();
    expect(rehearsalDbEnvFrom({ env: { ...noEnv, CLONE_DATABASE_URL: CLONE_URL } })?.user).toBe(
      "postgres.jxhgzalwckuarngvsdyq",
    );
    expect(() => rehearsalDbEnvFrom({ env: { ...noEnv, CLONE_DATABASE_URL: LIVE_URL } })).toThrow(/REFUSED/);
  });

  it("every live jest suite takes the door, not a loader of its own", () => {
    const root = resolve(__dirname, "../..");
    for (const suite of [
      "features/access-gate/service/accessDeniedContext.rlsCeiling.test.ts",
      "features/access-gate/service/aStrangerIsToldWhatAMissingIdIsTold.test.ts",
      "features/ai-work/conversations/cvxAudienceDerivesFromLane.test.ts",
    ]) {
      const text = readFileSync(join(root, suite), "utf8");
      expect({ suite, door: /testDbEnvFrom\(/.test(text) }).toEqual({ suite, door: true });
      expect({ suite, ownLoader: /SUPABASE_MATRIX_\[A-Z_\]\+/.test(text) }).toEqual({ suite, ownLoader: false });
    }
  });
});
