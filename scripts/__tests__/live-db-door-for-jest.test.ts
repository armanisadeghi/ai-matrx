/**
 * @jest-environment node
 *
 * THE LIVE DATABASE HAS A DOOR FOR JEST TOO (lane INTEG-SERVER, 2026-09-24).
 *
 * A developer's env files name the LIVE database (the server runs on it), and the live jest suites
 * read them: `accessDeniedContext.rlsCeiling.test.ts` runs a migration file inside a transaction
 * and `cvxAudienceDerivesFromLane.test.ts` scans `chat.conversation` — on production, whenever they
 * ran. `scripts/lib/direct-db-env.ts` `testDbEnvFrom` is now the ONE door every live suite takes:
 * a live connection is repointed to `MATRX_TEST_DATABASE_URL` (e.g. the dev clone), else
 * `SUPABASE_BRANCH_DATABASE_URL`, else REFUSED (unmeasured is a failure, never a pass); reaching
 * live on purpose needs `MATRX_LIVE_DB=1` and `MATRX_LIVE_DB_REASON` inside 1–4 AM Pacific. A
 * non-live connection (a local Postgres, the branch, the clone) is untouched. `pnpm db:apply` and
 * the other operator tools keep `loadDbEnvFrom` — they are not tests.
 *
 * Every clause builds a throwaway root whose `.env` carries the live database's IDENTITY with an
 * unusable password — nothing here ever connects.
 */
import { describe, expect, it } from "@jest/globals";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { loadDbEnvFrom, testDbEnvFrom } from "../lib/direct-db-env";

const LIVE_USER = "postgres.brsgrqvjdzwihsvnfqkf";
const CLONE_URL =
  "postgresql://postgres.jxhgzalwckuarngvsdyq:not-a-real-password@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
const AT_NOON = new Date("2026-09-24T19:00:00Z"); // 12:00 Pacific — outside the window
const AT_TWO = new Date("2026-09-24T09:00:00Z"); // 02:00 Pacific — inside

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

const noEnv: NodeJS.ProcessEnv = { NODE_ENV: "test" };

describe("the live-database door for jest", () => {
  it("the operator loader still answers the live database (db:apply is not a test)", () => {
    const got = loadDbEnvFrom(liveRoot(), noEnv);
    expect("user" in got && got.user).toBe(LIVE_USER);
  });

  it("a live env is repointed to the declared test target", () => {
    const got = testDbEnvFrom(liveRoot(), { env: { NODE_ENV: "test", MATRX_TEST_DATABASE_URL: CLONE_URL }, now: AT_NOON });
    expect(got.user).toBe("postgres.jxhgzalwckuarngvsdyq");
    expect(got.from).toMatch(/MATRX_TEST_DATABASE_URL/);
  });

  it("the branch URL in the env files is the default target", () => {
    const got = testDbEnvFrom(liveRoot(`SUPABASE_BRANCH_DATABASE_URL=${CLONE_URL}`), { env: noEnv, now: AT_NOON });
    expect(got.user).toBe("postgres.jxhgzalwckuarngvsdyq");
  });

  it("with no target the run is REFUSED, never sent to production", () => {
    expect(() => testDbEnvFrom(liveRoot(), { env: noEnv, now: AT_NOON })).toThrow(/REFUSED/);
  });

  it("live on purpose needs a reason and the 1–4 AM Pacific window", () => {
    expect(() => testDbEnvFrom(liveRoot(), { env: { NODE_ENV: "test", MATRX_LIVE_DB: "1" }, now: AT_TWO })).toThrow(/REASON/);
    expect(() =>
      testDbEnvFrom(liveRoot(), { env: { NODE_ENV: "test", MATRX_LIVE_DB: "1", MATRX_LIVE_DB_REASON: "rehearsal" }, now: AT_NOON }),
    ).toThrow(/Pacific/);
    const live = testDbEnvFrom(liveRoot(), {
      env: { NODE_ENV: "test", MATRX_LIVE_DB: "1", MATRX_LIVE_DB_REASON: "rehearsal" },
      now: AT_TWO,
    });
    expect(live.user).toBe(LIVE_USER);
  });

  it("a non-live connection is never touched", () => {
    const root = mkdtempSync(join(tmpdir(), "live-db-door-"));
    const got = testDbEnvFrom(root, {
      env: {
        NODE_ENV: "test",
        SUPABASE_MATRIX_HOST: "127.0.0.1",
        SUPABASE_MATRIX_PORT: "55432",
        SUPABASE_MATRIX_USER: "postgres",
        SUPABASE_MATRIX_PASSWORD: "postgres",
        SUPABASE_MATRIX_DATABASE_NAME: "postgres",
      },
      now: AT_NOON,
    });
    expect([got.host, got.port]).toEqual(["127.0.0.1", 55432]);
  });

  it("every live jest suite takes the door, not a loader of its own", () => {
    const root = resolve(__dirname, "../..");
    for (const suite of [
      "features/access-gate/service/accessDeniedContext.rlsCeiling.test.ts",
      "features/ai-work/conversations/cvxAudienceDerivesFromLane.test.ts",
    ]) {
      const text = readFileSync(join(root, suite), "utf8");
      expect({ suite, door: /testDbEnvFrom\(/.test(text) }).toEqual({ suite, door: true });
      expect({ suite, ownLoader: /SUPABASE_MATRIX_\[A-Z_\]\+/.test(text) }).toEqual({ suite, ownLoader: false });
    }
  });
});
