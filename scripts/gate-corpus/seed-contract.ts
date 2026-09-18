/**
 * THE GATE CORPUS'S CONTRACT WITH THE RESTORED GRAPH — four properties of
 * `seed.sql` and `run.ts` that no database can be asked about, because by the
 * time a database could answer, the damage is done.
 *
 * WHY THIS FILE EXISTS (ATTACK-8 findings 1 and 3, measured 2026-09-16).
 * `W0-CORPUS` runs immediately after `W0-DATA`, on top of the copy of
 * production's graph, and wave zero could not get past it:
 *
 *   · `seed.sql` § 0 refused unless `iam.organizations` and `auth.users` held
 *     nothing but corpus rows — the exact state the restore destroys. On the
 *     rehearsal branch the guard's own expressions read 422 and 478, and the file
 *     raised. Lane 3 of 47, at H+3.50, before any DDL.
 *   · Its teardown deleted by TYPE — `scope`, `rulebook`, `seo_starter_pack` —
 *     which are PRODUCTION's tokens, not the corpus's. Simply removing the guard
 *     would have taken 3 `platform.entity_types` rows, 183 restored
 *     `platform.reachability` rows and 2 `platform.shareable_resource_registry`
 *     rows out of the copy `T1`, `CUT-3` and `CUT-5` diff against.
 *   · `run.ts` refused every DSN containing `aws-0-us-east-1.pooler.supabase.com`
 *     as "the production database". That is the REHEARSAL BRANCH'S OWN pooler
 *     host, so `W0-CORPUS`'s named command could not reach the branch at all.
 *
 * These are file-shape properties with no credential and no connection, so they
 * can be a test that runs in CI on every commit. The RED proof is the previous
 * revision of the two files: `checkSeedContract` returns all three violations for
 * the file as it stood at `3027f152d5`.
 */
import { readFileSync } from "node:fs";

export interface Violation {
  readonly code: string;
  readonly detail: string;
}

/** The type tokens the corpus borrows from production and therefore may not delete by. */
export const SHARED_TOKENS: readonly string[] = ["scope", "rulebook", "seo_starter_pack"];

/** Comments carry the explanation of what was wrong; only the statements are judged. */
export function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

/** `delete from <table> … ;` — one entry per statement, whitespace-collapsed. */
export function deleteStatements(sql: string): string[] {
  const out: string[] = [];
  const re = /\bdelete\s+from\b[\s\S]*?;/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) out.push(m[0].replace(/\s+/g, " ").trim());
  return out;
}

export function checkSeedContract(seedSql: string): Violation[] {
  const sql = stripSqlComments(seedSql);
  const v: Violation[] = [];

  // 1. Nothing is deleted by a type the corpus does not own.
  for (const stmt of deleteStatements(sql)) {
    const hit = SHARED_TOKENS.filter((t) => new RegExp(`'${t}'`).test(stmt));
    if (hit.length > 0) {
      v.push({
        code: "teardown-deletes-by-shared-type",
        detail:
          `a teardown statement is keyed on ${hit.map((h) => `'${h}'`).join(", ")}, ` +
          `which production owns: ${stmt.slice(0, 160)}`,
      });
    }
  }

  // 2. The guard refuses PRODUCTION, not a populated branch.
  if (/count\(\*\)\s+into\s+v_orgs/i.test(sql) || /count\(\*\)\s+into\s+v_users/i.test(sql)) {
    v.push({
      code: "guard-demands-an-empty-branch",
      detail:
        "section 0 counts non-corpus organizations or users and raises on them, which is the " +
        "state W0-DATA creates — the corpus seeds ON TOP of the restored graph.",
    });
  }
  if (!/pg_control_system\(\)/i.test(sql)) {
    v.push({
      code: "guard-does-not-refuse-production-by-identity",
      detail:
        "section 0 must refuse production by pg_control_system().system_identifier — the one " +
        "identity read from the server rather than from the caller's arguments.",
    });
  }
  if (!/platform\.reachability[\s\S]{0,400}?raise exception/i.test(sql)) {
    v.push({
      code: "guard-does-not-assert-the-restored-graph",
      detail:
        "section 0 must refuse when the restored graph is absent, so a corpus seeded beside an " +
        "empty graph cannot be mistaken for one seeded on top of the real one.",
    });
  }

  // 3. The pair cache is rebuilt for the corpus's own containers only.
  const derive = sql.match(/insert into platform\.reachability[\s\S]*?;/i)?.[0] ?? "";
  if (derive && !/b0000000-%/.test(derive)) {
    v.push({
      code: "derivation-is-not-corpus-scoped",
      detail:
        "the pair-cache rebuild walks every container in platform.containment_edges, including " +
        "production's restored graph.",
    });
  }

  return v;
}

export function checkRunnerContract(runTs: string): Violation[] {
  const v: Violation[] = [];
  if (/FORBIDDEN_HOSTS/.test(runTs)) {
    v.push({
      code: "runner-judges-by-hostname-substring",
      detail:
        "a hostname blocklist cannot tell the branch from production — both sit behind " +
        "aws-N-us-east-1.pooler.supabase.com — and this one refused the branch's own host.",
    });
  }
  if (!/assertServerMatchesTarget/.test(runTs)) {
    v.push({
      code: "runner-does-not-read-the-server-identity",
      detail:
        "the runner must refuse on pg_control_system().system_identifier against plan/BRANCH-REF, " +
        "the same judgment both migration runners make.",
    });
  }
  return v;
}

/**
 * THE SAME CONTRACT, FOR EVERY RUNNER — not just `run.ts`.
 *
 * ATTACK-9 finding 34: rules 24 and 31 both rest on `.env.local`, which "points
 * wherever it points", and the protection is an instruction to lanes with no
 * guard underneath it. `run.ts` and `branch-api.ts` are the two files that open a
 * socket from this directory, and only `run.ts` was covered — so a lane that
 * exported a production DSN into its own shell was refused by one and, if the
 * assertion were ever dropped from the other, waved through by the other. The
 * file that opens the connection is the one that must judge it, so BOTH are held
 * to the same two codes, and a third runner added here later joins them by being
 * listed in `RUNNERS`.
 *
 * This is a file-shape check and it is deliberately not the whole proof: it can
 * tell you the call is PRESENT, never that it BITES. That half is
 * `gate-corpus-refuses-production-identity.test.ts`, which drives the real
 * `assertServerMatchesTarget` with production's own system_identifier out of
 * `plan/BRANCH-REF` and requires the refusal to name production.
 */
export const RUNNERS: readonly string[] = ["run.ts", "branch-api.ts"];

export function checkFiles(
  seedPath: string,
  runPath: string,
  ...otherRunnerPaths: string[]
): Violation[] {
  const runners = [runPath, ...otherRunnerPaths];
  return [
    ...checkSeedContract(readFileSync(seedPath, "utf8")),
    ...runners.flatMap((p) =>
      checkRunnerContract(readFileSync(p, "utf8")).map((v) => ({
        ...v,
        detail: `${p.split("/").pop()}: ${v.detail}`,
      })),
    ),
  ];
}
