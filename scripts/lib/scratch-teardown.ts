/**
 * SCRATCH TEARDOWN — a live self-test that builds scratch objects removes them on every exit path,
 * and when it cannot, says so LOUDLY: by name, with the error, with the exact remedy, and with a
 * failing exit code. It never swallows.
 *
 * WHY THIS EXISTS (DC-027 #8, 2026-09-15)
 * ---------------------------------------
 * `check:staff-door --self-test` registered `zz_staff_door_selftest_mu0wnnb1_token` and its schema at
 * 2026-09-14 07:12:11Z. At 07:12:57Z every teardown statement on `platform.entity_types` failed with
 * `permission denied for table entity_types` (postgres_logs). The teardown read:
 *
 *     try { await door(delete row) } catch { }      // swallowed
 *     try { await door(drop schema) } catch { }     // swallowed
 *     const left = await door(count leftovers)      // threw OUT of `finally`
 *
 * so the run died as a generic "crashed: 400 permission denied" that named nothing and gave no
 * remedy. The leftover then went into `@ai-matrx/associations` (aidream f1b781fb2 → 0.9.15) and
 * every client installed a test artifact. Four sibling self-tests (`check:row-visibility`,
 * `check:rls-on`, `check:definer-class`, `check:list-scope`) carried the same swallowed shape.
 *
 * THE CONTRACT
 *   - Every step runs, in order, even after an earlier step fails (a failed row delete must not
 *     skip the schema drop that may still succeed).
 *   - Every declared leftover is then PROBED; a probe that itself fails is reported as UNVERIFIED,
 *     never assumed clean.
 *   - Anything failed, present or unverified → the report names each object, the error, and the
 *     remedy SQL to put in a migration applied with `pnpm db:apply`; `ok` is false and the caller
 *     fails the run.
 *   - `teardownScratch` never throws — a teardown that can throw past its own report is the defect.
 *   - SIGINT/SIGTERM do not run `finally`. `armScratchSignals` runs the same teardown on those, then
 *     exits non-zero through the drain helper.
 *
 * Scratch names stay recognisable: `zz_<guard>_selftest_<run>`. `pnpm check:entity-types` and the
 * aidream vocabulary generator both refuse any `zz_` registration, so a leftover cannot ship
 * silently even if this report is ignored.
 */
import { exitAfterDrain } from "./exit-after-drain";

export interface ScratchStep {
  /** What the step removes, by exact name — printed on failure. */
  what: string;
  run: () => Promise<unknown>;
}

export interface ScratchLeftover {
  /** The object, by exact name — printed when present or unverifiable. */
  what: string;
  /** Resolves true when the object still exists. May throw; that is reported as UNVERIFIED. */
  present: () => Promise<boolean>;
}

export interface ScratchPlan {
  /** The guard and mode that created the scratch, e.g. `check:staff-door --self-test`. */
  owner: string;
  steps: ScratchStep[];
  leftovers: ScratchLeftover[];
  /** The idempotent SQL that removes everything this plan creates. */
  remedySql: string[];
}

export interface ScratchTeardownReport {
  ok: boolean;
  failedSteps: Array<{ what: string; error: string }>;
  present: string[];
  unverified: Array<{ what: string; error: string }>;
  lines: string[];
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 400);

export async function teardownScratch(
  plan: ScratchPlan,
  log: (line: string) => void = (line) => console.error(line),
): Promise<ScratchTeardownReport> {
  const failedSteps: ScratchTeardownReport["failedSteps"] = [];
  const present: string[] = [];
  const unverified: ScratchTeardownReport["unverified"] = [];

  for (const step of plan.steps) {
    try {
      await step.run();
    } catch (e) {
      failedSteps.push({ what: step.what, error: errText(e) });
    }
  }
  for (const leftover of plan.leftovers) {
    try {
      if (await leftover.present()) present.push(leftover.what);
    } catch (e) {
      unverified.push({ what: leftover.what, error: errText(e) });
    }
  }

  const ok = failedSteps.length === 0 && present.length === 0 && unverified.length === 0;
  const lines: string[] = [];
  if (!ok) {
    lines.push(`  \x1b[31m✗ SCRATCH LEFT BEHIND by ${plan.owner}\x1b[0m — its teardown did not finish, and this run FAILS for it.`);
    for (const f of failedSteps) lines.push(`    teardown step FAILED: ${f.what} — ${f.error}`);
    for (const p of present) lines.push(`    still PRESENT: ${p}`);
    for (const u of unverified) lines.push(`    UNVERIFIED (the leftover check itself failed): ${u.what} — ${u.error}`);
    lines.push(
      "    Remedy: fix the cause above, then remove the scratch through the sanctioned path — a migration",
      "    carrying exactly these idempotent statements, applied with `pnpm db:apply migrations/<file>.sql`:",
      ...plan.remedySql.map((s) => `      ${s.trim().replace(/;?$/, ";")}`),
      "    Until then `pnpm check:entity-types` fails on any registered `zz_` token, and the aidream vocabulary",
      "    generator refuses to publish it.",
    );
    for (const line of lines) log(line);
  }
  return { ok, failedSteps, present, unverified, lines };
}

/** A SQL runner: the guard's own door, e.g. `(sql) => door(env, sql)`. */
export type ScratchSqlRunner = (sql: string) => Promise<Array<Record<string, unknown>>>;

async function countProbe(run: ScratchSqlRunner, sql: string): Promise<boolean> {
  const rows = await run(sql);
  const n = (rows[0] as { n?: unknown } | undefined)?.n;
  // A probe that does not come back as a count is not "zero" — it is unmeasured.
  if (typeof n !== "number") throw new Error(`leftover probe returned no count (${JSON.stringify(rows).slice(0, 120)})`);
  return n > 0;
}

const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/**
 * The plan every registry self-test needs: its own extra rows first (relationships, door rows),
 * then its `platform.entity_types` tokens (the `sql_drop` event trigger flags registered tables, so
 * rows go before the schema), then the schema. Each piece is probed afterwards.
 */
export function registeredScratchPlan(opts: {
  owner: string;
  run: ScratchSqlRunner;
  schema: string;
  tokens?: string[];
  extraRows?: Array<{ what: string; deleteSql: string; countSql: string }>;
}): ScratchPlan {
  const { owner, run, schema, tokens = [], extraRows = [] } = opts;
  for (const name of [schema, ...tokens]) {
    if (!name.startsWith("zz_") || !/^[a-z0-9_]+$/.test(name)) {
      throw new Error(`scratch name "${name}" must be lower-case and start with "zz_" so a leftover is recognisable and guarded`);
    }
  }
  const tokenList = tokens.map(lit).join(", ");
  const deleteTokens = `delete from platform.entity_types where token in (${tokenList})`;
  const dropSchema = `drop schema if exists ${schema} cascade`;
  return {
    owner,
    steps: [
      ...extraRows.map((r) => ({ what: r.what, run: () => run(r.deleteSql) })),
      ...(tokens.length ? [{ what: `platform.entity_types rows ${tokens.join(", ")}`, run: () => run(deleteTokens) }] : []),
      { what: `schema ${schema}`, run: () => run(dropSchema) },
    ],
    leftovers: [
      ...extraRows.map((r) => ({ what: r.what, present: () => countProbe(run, r.countSql) })),
      ...tokens.map((t) => ({
        what: `platform.entity_types token ${t}`,
        present: () => countProbe(run, `select count(*)::int as n from platform.entity_types where token = ${lit(t)}`),
      })),
      {
        what: `schema ${schema}`,
        present: () => countProbe(run, `select count(*)::int as n from pg_namespace where nspname = ${lit(schema)}`),
      },
    ],
    remedySql: [...extraRows.map((r) => r.deleteSql), ...(tokens.length ? [deleteTokens] : []), dropSchema],
  };
}

const armed = new Set<ScratchPlan>();
let signalsInstalled = false;

async function onSignal(signal: NodeJS.Signals): Promise<void> {
  const plans = [...armed];
  armed.clear();
  console.error(`\n  ! ${signal} received — tearing down ${plans.length} scratch plan(s) before exiting`);
  for (const plan of plans) await teardownScratch(plan);
  exitAfterDrain(signal === "SIGINT" ? 130 : 143);
}

/**
 * Arm a plan for SIGINT/SIGTERM, which skip `finally`. Returns the disarm function; call it at the
 * top of your `finally`, right before `teardownScratch(plan)`.
 */
export function armScratchSignals(plan: ScratchPlan): () => void {
  armed.add(plan);
  if (!signalsInstalled) {
    signalsInstalled = true;
    process.once("SIGINT", (s) => void onSignal(s));
    process.once("SIGTERM", (s) => void onSignal(s));
  }
  return () => {
    armed.delete(plan);
  };
}
