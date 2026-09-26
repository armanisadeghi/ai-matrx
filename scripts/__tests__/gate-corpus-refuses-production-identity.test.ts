/**
 * THE GATE CORPUS REFUSES PRODUCTION BY THE SERVER'S OWN IDENTITY.
 *
 * ATTACK-9 finding 34: rules 24 and 31 both depend on `.env.local`, "which the
 * gate reads and points wherever it points", and the stated protection is an
 * instruction — *"lanes point their OWN process at the branch and never touch
 * the shared file"* — with no guard underneath it. One lane that exports a
 * production DSN in a shell another process inherits reproduces exactly the
 * failure rule 31 describes, and nothing would say a word.
 *
 * The runners already read `pg_control_system().system_identifier` and compare
 * it to `plan/BRANCH-REF`, which is the right judgment: both databases are named
 * `postgres`, both connect as `postgres`, and both sit behind the same
 * `aws-N-us-east-1.pooler.supabase.com` Supavisor name, so nothing in a DSN can
 * tell them apart — only the control file can. What did NOT exist was a proof
 * that the judgment BITES, and `scripts/gate-corpus/seed-contract.ts` covered
 * only `run.ts`, never `branch-api.ts`.
 *
 * So this file asserts two different things, because a text check and a
 * behavioural check each catch what the other cannot:
 *
 *   A. BEHAVIOUR — the real `assertServerMatchesTarget`, handed PRODUCTION's own
 *      system_identifier (read from `plan/BRANCH-REF`, not invented here) while
 *      the caller asked for `--target branch`, must throw and must name
 *      production. The only thing stubbed is the socket — the fake `query` hands
 *      back the string a real production server would hand back. The function
 *      under test is the real one.
 *
 *   B. SHAPE — BOTH files that open a connection in `scripts/gate-corpus/` route
 *      through that function. A behavioural proof of a function nobody calls is
 *      worth nothing.
 *
 * NO CREDENTIAL, NO CONNECTION, so this runs in CI on every commit.
 */

import { describe, expect, it } from "@jest/globals";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  assertConfiguredHostMatchesTarget,
  assertServerMatchesTarget,
  branchIsRetired,
  loadBranchDbEnv,
  loadBranchRef,
} from "../lib/migration-target";
import { RUNNERS, checkFiles } from "../gate-corpus/seed-contract";

const ROOT = resolve(__dirname, "..", "..");
const GATE = join(ROOT, "scripts", "gate-corpus");
// The real BRANCH-REF names no branch since the rehearsal branch was deleted 2026-09-26
// (section R below). The judgment is still tested on a FIXTURE branch whose parent is
// production's REAL identity, read from the real file.
const realRef = loadBranchRef(ROOT);
const fixtureDir = mkdtempSync(join(tmpdir(), "branch-ref-fixture-"));
writeFileSync(
  join(fixtureDir, "BRANCH-REF"),
  [
    "branch_ref = fixturebranchrefxxxxx",
    `parent_ref = ${realRef.parentRef}`,
    "pooler_host = aws-0-us-east-1.pooler.supabase.com",
    "pooler_port = 5432",
    "pooler_user = postgres.fixturebranchrefxxxxx",
    "database = postgres",
    "password_env_var = FIXTURE_BRANCH_DATABASE_URL",
    "system_identifier = 1111111111111111111",
    `parent_system_identifier = ${realRef.parentSystemIdentifier}`,
  ].join("\n"),
);
const ref = loadBranchRef(ROOT, join(fixtureDir, "BRANCH-REF"));

describe("R. the real BRANCH-REF is retired", () => {
  it("names no branch, keeps production's identity, and a branch connection refuses", () => {
    expect(branchIsRetired(realRef)).toBe(true);
    expect(realRef.parentSystemIdentifier).toBeTruthy();
    expect(() => loadBranchDbEnv(ROOT, realRef)).toThrow(/operations\/clone\/CURRENT\.md/);
  });

  it("an empty branch ref never makes production look like a branch", () => {
    expect(() =>
      assertConfiguredHostMatchesTarget(
        {
          user: `postgres.${realRef.parentRef}`,
          host: "aws-0-us-east-1.pooler.supabase.com",
          port: 6543,
          database: "postgres",
          from: "test",
        },
        "production",
        realRef,
      ),
    ).not.toThrow();
  });
});

/** A server that answers pg_control_system() with whatever identity we hand it. */
const serverSaying = (sysid: string) => async (_sql: string) => ({
  rows: [{ sysid }],
});

describe("A. the refusal bites when the connection IS production", () => {
  it("BRANCH-REF really does name two different clusters", () => {
    // If these were ever equal the whole judgment would be vacuous and every
    // assertion below would pass for the wrong reason.
    expect(ref.systemIdentifier).toBeTruthy();
    expect(ref.parentSystemIdentifier).toBeTruthy();
    expect(ref.systemIdentifier).not.toEqual(ref.parentSystemIdentifier);
  });

  it("refuses --target branch on a server whose identity is PRODUCTION's, and names it", async () => {
    await expect(
      assertServerMatchesTarget(
        serverSaying(ref.parentSystemIdentifier),
        "branch",
        ref,
        "gate-corpus/run.ts",
      ),
    ).rejects.toThrow(/production/i);
  });

  it("the refusal prints both identifiers, so the reader can tell WHICH cluster answered", async () => {
    // The function RESOLVES with the identity it accepted and REJECTS with the
    // refusal, so the union here is `string | Error` — and a resolved string
    // would mean the guard did not bite at all. Narrow by proving it threw,
    // rather than asserting the type away: `as Error` on a resolved value
    // would have let this test read the identity string's own `.message`
    // (undefined) and pass nothing.
    const err: string | Error = await assertServerMatchesTarget(
      serverSaying(ref.parentSystemIdentifier),
      "branch",
      ref,
      "gate-corpus/branch-api.ts",
    ).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));

    if (!(err instanceof Error)) {
      throw new Error(
        `assertServerMatchesTarget ACCEPTED production's own system_identifier on --target branch; it returned ${err}`,
      );
    }
    expect(err.message).toContain(ref.parentSystemIdentifier);
    expect(err.message).toContain(ref.systemIdentifier);
    expect(err.message).toContain("gate-corpus/branch-api.ts");
  });

  it("refuses an UNKNOWN cluster too — an identity it recognises is not the test", async () => {
    await expect(
      assertServerMatchesTarget(serverSaying("1"), "branch", ref, "run.ts"),
    ).rejects.toThrow(/UNKNOWN cluster/);
  });

  it("refuses a server that will not answer at all, rather than falling back to something weaker", async () => {
    await expect(
      assertServerMatchesTarget(async () => ({ rows: [] }), "branch", ref, "run.ts"),
    ).rejects.toThrow(/did not answer pg_control_system/i);
  });

  it("ACCEPTS the branch — the guard is a judgment, not a blanket refusal", async () => {
    await expect(
      assertServerMatchesTarget(serverSaying(ref.systemIdentifier), "branch", ref, "run.ts"),
    ).resolves.toEqual(ref.systemIdentifier);
  });

  it("refuses BEFORE any socket when the CONFIGURED host is not the branch", () => {
    // Finding 34's actual shape: an inherited env var pointing at production.
    expect(() =>
      assertConfiguredHostMatchesTarget(
        {
          user: "postgres.brsgrqvjdzwihsvnfqkf",
          host: "aws-1-us-east-1.pooler.supabase.com",
          port: 6543,
          database: "postgres",
          from: "an inherited shell export (rule 31's failure)",
        },
        "branch",
        ref,
      ),
    ).toThrow(/not the rehearsal branch/i);
  });
});

describe("B. every runner that opens a connection makes that judgment", () => {
  it("run.ts and branch-api.ts are BOTH held to the contract, and both pass", () => {
    expect(
      checkFiles(
        join(GATE, "seed.sql"),
        join(GATE, "run.ts"),
        join(GATE, "branch-api.ts"),
      ),
    ).toEqual([]);
  });

  it.each(RUNNERS)("%s reads the server's own identity, not the flag", (runner) => {
    const src = readFileSync(join(GATE, runner), "utf8");
    expect(src).toMatch(/assertServerMatchesTarget/);
    expect(src).not.toMatch(/FORBIDDEN_HOSTS/);
  });

  it("RUNNERS lists every file in scripts/gate-corpus/ that constructs a pg Client", () => {
    // The census, so a third runner added later cannot quietly skip the judgment.
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const opensASocket = readdirSync(GATE)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /new Client\s*\(/.test(readFileSync(join(GATE, f), "utf8")));
    expect(opensASocket.sort()).toEqual([...RUNNERS].sort());
  });
});
