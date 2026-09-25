#!/usr/bin/env npx tsx
/**
 * THE ANON COLUMN-SURFACE GUARD — which COLUMNS a signed-out visitor can read
 * on a relation we deliberately made anon-readable (DD-182).
 *
 * WHY THIS EXISTS
 * ---------------
 * `scripts/check-db-guards.ts` asks which RELATIONS `anon` can reach. Neither of
 * its arms asks which COLUMNS, and a table can be correctly public row-wise while
 * carrying a column that is nobody's business. Measured live on 2026-09-13:
 * `public.catalog_entries` — which the matrx-local desktop app MUST read before
 * anyone signs in — served `updated_by`, a platform admin's user uuid, to the
 * publishable key over HTTPS, while the SAME feature's other public path
 * (aidream's unauthenticated `GET /api/catalogs/{app}`) stripped that column on
 * purpose. Two public paths of one feature, disagreeing, with every existing
 * detector green.
 *
 * And it widened again the same morning with nobody deciding anything: the DD-173
 * base retrofit added `organization_id`, `created_by`, `metadata`, `version` and
 * `visibility` to that table, and a client asking `select=*` published all five
 * the moment they existed. Adding a column to an anon-readable table IS a
 * publishing decision. This guard is what makes it one.
 *
 * WHAT IT COMPARES
 * ----------------
 * `ANON_COLUMN_SURFACE` in `lib/security/public-exposure.ts` — the one register,
 * never a copy — against the live column privileges of `anon`, and fails on a
 * difference in EITHER direction:
 *   - EXTRA   (live, undeclared): a column a signed-out visitor can read and
 *             nobody said they could. That is the leak.
 *   - MISSING (declared, not live): a column the register promises and the grant
 *             does not give. That is a client about to take a 42501 that nobody
 *             predicted — a guard that only looked for leaks would let a broken
 *             desktop app ship silently.
 *
 * WHY GRANTS AND NOT POLICIES. RLS filters rows and cannot express a column at
 * all. The column privilege is the only layer that can, and it is the durable one
 * here: `iam.apply_rls` issues no GRANT of any kind, so a regeneration cannot
 * quietly undo a column bound.
 *
 * UNMEASURED IS A FAILURE, NEVER A PASS — with no database credentials it exits 1
 * and says which five variables it wanted and where it looked.
 *
 *   pnpm check:anon-column-surface              # the comparison
 *   pnpm check:anon-column-surface --self-test  # RED then GREEN against the real database
 */
import { openGateDb } from "./lib/gate-db";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";
import {
  ANON_COLUMN_SURFACE,
  ANON_COLUMN_SURFACE_QUERY,
  POSTGREST_EXPOSED_SCHEMAS,
  classifyAnonColumns,
  classifyReasonExposure,
  type LiveAnonColumn,
} from "../lib/security/public-exposure";


const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.argv.includes("--self-test");
const C = { b: "\x1b[1m", d: "\x1b[2m", r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m", x: "\x1b[0m" };

const DB_VARS = [
  "SUPABASE_MATRIX_USER",
  "SUPABASE_MATRIX_PASSWORD",
  "SUPABASE_MATRIX_HOST",
  "SUPABASE_MATRIX_PORT",
  "SUPABASE_MATRIX_DATABASE_NAME",
] as const;

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

function resolveDbEnv(): Record<string, string> {
  const looked: string[] = [];
  const take = (bag: Record<string, string | undefined>) =>
    DB_VARS.every((k) => bag[k]) ? (Object.fromEntries(DB_VARS.map((k) => [k, bag[k]!])) as Record<string, string>) : null;

  const fromProcess = take(process.env);
  if (fromProcess) return fromProcess;

  for (const path of [
    resolve(ROOT, ".env.local"),
    resolve(ROOT, ".env"),
    resolve(process.env.AIDREAM_DIR ?? resolve(ROOT, "..", "aidream"), ".env"),
  ]) {
    if (!existsSync(path)) continue;
    looked.push(relative(ROOT, path));
    const hit = take(parseEnvFile(path));
    if (hit) return hit;
  }
  console.error(
    `${C.r}FAIL${C.x} the anon column surface could not be MEASURED — unmeasured is a failure, never a pass.\n` +
      `     Wanted ${DB_VARS.join(", ")} in the environment or in: ${looked.join(", ") || "(no env file found)"}, ../aidream/.env`,
  );
  exitAfterDrain(1);
}

async function connect() {
  const env = resolveDbEnv();
  // The gate database helper (scripts/lib/gate-db.ts): transaction-local limits, two sessions max.
  const client = await openGateDb(
    {
      host: env.SUPABASE_MATRIX_HOST,
      port: Number(env.SUPABASE_MATRIX_PORT),
      user: env.SUPABASE_MATRIX_USER,
      password: env.SUPABASE_MATRIX_PASSWORD,
      database: env.SUPABASE_MATRIX_DATABASE_NAME,
    },
    { gate: "check:anon-column-surface" },
  );
  // Supavisor pools in transaction mode: a server connection can arrive with a
  // non-LOCAL SET ROLE another client left behind. Reading privileges as the
  // wrong role is a wrong answer that looks like a right one.
  await client.query("set role none");
  return client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function measure(client: any): Promise<LiveAnonColumn[]> {
  // The WHOLE surface, not just the declared relations — an undeclared relation
  // is itself a finding (DD-186).
  const { rows } = await client.query(ANON_COLUMN_SURFACE_QUERY, [[...POSTGREST_EXPOSED_SCHEMAS]]);
  return rows as LiveAnonColumn[];
}

function report(live: LiveAnonColumn[]): number {
  const drift = classifyAnonColumns(live);
  const relations = new Set(live.map((l) => l.relation));

  console.log(
    `${C.b}Anon column surface${C.x} ${C.d}(every column a signed-out visitor can read, across the ` +
      `${POSTGREST_EXPOSED_SCHEMAS.length} schemas PostgREST exposes)${C.x}\n` +
      `  ${relations.size} relation(s) live, ${ANON_COLUMN_SURFACE.length} declared, ` +
      `${live.length} readable column(s).`,
  );

  if (!drift.length) {
    console.log(`${C.g}OK${C.x}   every anon-readable relation publishes exactly the columns it declares.`);
    return 0;
  }

  for (const d of drift) {
    if (d.undeclared) {
      console.log(
        `${C.r}FAIL${C.x} ${d.relation} is readable by ${C.b}anon${C.x} and NOTHING DECLARES IT.\n` +
          `     ${d.extra.length} column(s): ${d.extra.join(", ")}\n` +
          `     A signed-out visitor with the publishable key can read them today. Either revoke the\n` +
          `     grant (revoke select on ${d.relation} from anon;) or add a row to ANON_COLUMN_SURFACE\n` +
          `     in lib/security/public-exposure.ts naming the columns AND the reader that needs them.`,
      );
      continue;
    }
    if (d.extra.length) {
      console.log(
        `${C.r}FAIL${C.x} ${d.relation} publishes ${d.extra.length} column(s) nobody declared: ${C.b}${d.extra.join(", ")}${C.x}\n` +
          `     A signed-out visitor with the publishable key can read them today.\n` +
          `     Either revoke them (revoke select on ${d.relation} from anon;\n` +
          `                          grant select (<the declared list>) on ${d.relation} to anon;)\n` +
          `     or add them to ANON_COLUMN_SURFACE in lib/security/public-exposure.ts WITH a reason.`,
      );
    }
    if (d.missing.length) {
      console.log(
        `${C.y}FAIL${C.x} ${d.relation} declares ${d.missing.length} column(s) anon cannot read: ${C.b}${d.missing.join(", ")}${C.x}\n` +
          `     Every client asking for one is getting 42501 permission denied right now.\n` +
          `     Either re-grant them or delete them from ANON_COLUMN_SURFACE — the register must not promise what the grant refuses.`,
      );
    }
  }
  return drift.length;
}

/**
 * ARM 4 — REASON/EXPOSURE AGREEMENT (DD-230, 2026-09-14).
 *
 * The two lists in lib/security/public-exposure.ts describe the SAME signed-out
 * visitor. Nothing compared them, so DD-186's copy-pasted "No signed-out reader
 * was found for it in the four-repository census" sat on TWENTY relations whose
 * own exposure row, a few hundred lines above in the same file, said the
 * opposite — `billing.price` ("public pricing page renders prices before
 * sign-in"), `iam.industries` ("the sign-up form, before an account exists"),
 * `ui.ui_surface`, `tool.executor` — and on NINE more whose reader B-116 had
 * itself named. Twenty-nine contradictions, three weeks, zero signal.
 *
 * This arm needs no database: it is a statement about the register's own prose,
 * which is what the next lane reads before it decides whether to revoke a grant.
 */
function reportReasonExposure(): number {
  const conflicts = classifyReasonExposure();
  if (!conflicts.length) {
    console.log(
      `${C.g}OK${C.x}   no bound claims "no signed-out reader" — every reason names what was measured.`,
    );
    return 0;
  }
  for (const c of conflicts) {
    if (c.kind === "claims-no-reader-but-is-exposed") {
      console.log(
        `${C.r}FAIL${C.x} ${c.relation} contradicts itself inside one file.\n` +
          `     ANON_COLUMN_SURFACE says:      ${c.why.replace(/\s+/g, " ").slice(0, 140)}\n` +
          `     PUBLIC_EXPOSURE_ALLOWED says:  ${(c.exposureWhy ?? "").slice(0, 140)}\n` +
          `     One of the two is false. MEASURE the reader (a signed-out browser on production, and\n` +
          `     Supabase edge_logs grouped by path x role x status with the verbatim select=), then\n` +
          `     write what you measured — or revoke the grant and delete the row.`,
      );
    } else {
      console.log(
        `${C.r}FAIL${C.x} ${c.relation} publishes columns to anon while its own reason says nobody\n` +
          `     signed-out reads it: ${c.why.replace(/\s+/g, " ").slice(0, 140)}\n` +
          `     DD-222 settled which half is wrong: the grant. Revoke it, or name the reader.`,
      );
    }
  }
  return conflicts.length;
}

/**
 * ARM 5 — RLS-PREDICATE REACH (DD-230, 2026-09-14).
 *
 * A policy's references to its OWN table's columns are evaluated by the system
 * and need no column privilege. A SUBQUERY inside a policy, against ANOTHER
 * relation, runs with the CALLER's privileges. So a column no page renders can
 * still be load-bearing, and revoking it kills a DIFFERENT table.
 *
 * That is not hypothetical: bounding `content_ir.kind_definition` to the ten
 * columns its readers name dropped `visibility`, and `kind_component`,
 * `kind_edge`, `kind_example` and `kind_surface` — whose pub_read policies each
 * evaluate `SELECT p.id FROM content_ir.kind_definition p WHERE p.deleted_at IS
 * NULL AND p.visibility = 'public'` — all began answering 42501 naming the
 * PARENT table. A browser capture can never show you this column.
 *
 * The arm reads every anon-reachable policy's USING expression, finds the
 * relations it names other than its own, and checks that `anon` holds SELECT on
 * every column of those relations that the expression mentions.
 */
const RLS_REACH_QUERY = `
  select n.nspname || '.' || cl.relname as relation,
         p.polname                      as policy,
         pg_get_expr(p.polqual, p.polrelid) as using_expr
    from pg_policy p
    join pg_class cl     on cl.oid = p.polrelid
    join pg_namespace n  on n.oid  = cl.relnamespace
   where n.nspname = any($1::text[])
     and (p.polroles = '{0}'::oid[]
          or 'anon' = any(select rolname from pg_roles where oid = any(p.polroles)))
     and p.polqual is not null
     and exists (
       select 1 from pg_attribute a
        where a.attrelid = cl.oid and a.attnum > 0 and not a.attisdropped
          and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT'))
`;

/** `schema.table` → the columns `anon` may SELECT on it. */
const ANON_COLS_QUERY = `
  select n.nspname || '.' || cl.relname as relation, a.attname as column_name
    from pg_class cl
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_attribute a on a.attrelid = cl.oid and a.attnum > 0 and not a.attisdropped
   where cl.relkind in ('r','v','m','p','f')
     and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT')
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function reportRlsReach(client: any): Promise<number> {
  const [{ rows: pols }, { rows: cols }] = await Promise.all([
    client.query(RLS_REACH_QUERY, [[...POSTGREST_EXPOSED_SCHEMAS]]),
    client.query(ANON_COLS_QUERY),
  ]);
  const anonCols = new Map<string, Set<string>>();
  for (const c of cols as { relation: string; column_name: string }[]) {
    if (!anonCols.has(c.relation)) anonCols.set(c.relation, new Set());
    anonCols.get(c.relation)!.add(c.column_name);
  }
  // Only relations that actually APPEAR in a subquery matter, and only the
  // columns qualified by that subquery's alias. Parse `FROM <rel> <alias>` and
  // then every `<alias>.<column>`.
  const gaps: string[] = [];
  for (const p of pols as { relation: string; policy: string; using_expr: string }[]) {
    const expr = p.using_expr ?? "";
    for (const m of expr.matchAll(
      /\bFROM\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s+([a-z_][a-z0-9_]*)/gi,
    )) {
      const rel = m[1]!.toLowerCase();
      const alias = m[2]!;
      if (rel === p.relation) continue;
      const held = anonCols.get(rel);
      const wanted = new Set<string>();
      for (const c of expr.matchAll(new RegExp(`\\b${alias}\\.([a-z_][a-z0-9_]*)\\b`, "g"))) {
        wanted.add(c[1]!);
      }
      for (const w of wanted) {
        if (!held || !held.has(w)) {
          gaps.push(
            `${C.r}FAIL${C.x} ${p.relation} is unreadable by ${C.b}anon${C.x} — its policy ${p.policy} evaluates\n` +
              `     ${rel}.${w} through a subquery, and anon may not SELECT that column. Every anonymous\n` +
              `     read of ${p.relation} answers 42501 naming ${rel}, not ${p.relation}.\n` +
              `     A column another table's RLS reads is part of this relation's bound, however little\n` +
              `     any page renders it: grant select (${w}) on ${rel} to anon, and say so in its row.`,
          );
        }
      }
    }
  }
  if (!gaps.length) {
    console.log(
      `${C.g}OK${C.x}   every anon policy's cross-table subquery reads columns anon may select.`,
    );
    return 0;
  }
  for (const g of gaps) console.log(g);
  return gaps.length;
}

/**
 * B-110 measured this class here first (2026-09-14): piped, this guard printed
 * THREE FAIL lines and only ONE arrived, because `process.exit()` ends the
 * process with whatever is still in the stdout pipe buffer. The local copy of
 * the remedy that lived here is gone — every `scripts/check-*.ts` now exits
 * through the ONE helper, `scripts/lib/exit-after-drain.ts` (DD-232), which
 * carries the measurements and both belts. Do not re-grow a local one.
 */

async function main() {
  const client = await connect();
  try {
    if (!SELF_TEST) {
      const bad =
        report(await measure(client)) +
        reportReasonExposure() +
        (await reportRlsReach(client));
      exitAfterDrain(bad ? 1 : 0);
    }

    // ── THE SELF-TEST: a guard nobody has seen fail is not a guard. ──────────
    // Both directions are forced against the REAL database inside a transaction
    // that is ALWAYS rolled back, so the live grant is never left changed.
    const target = ANON_COLUMN_SURFACE[0];
    if (!target) {
      console.error(`${C.r}FAIL${C.x} ANON_COLUMN_SURFACE is empty — there is nothing to self-test against.`);
      exitAfterDrain(1);
    }
    console.log(`${C.b}--self-test${C.x} ${C.d}forcing both drift directions on ${target.relation}${C.x}\n`);

    const baseline = report(await measure(client));
    if (baseline !== 0) {
      console.error(
        `\n${C.r}FAIL${C.x} the self-test needs a GREEN starting point and the live surface already drifts (above).\n` +
          `     Fix the drift first; a RED proof on top of a RED baseline proves nothing.`,
      );
      exitAfterDrain(1);
    }
    console.log(`${C.g}GREEN${C.x} baseline: the live surface matches the register.\n`);

    let reds = 0;

    // RED 1 — a column appears that nobody declared.
    await client.query("begin");
    try {
      const extra = (
        await client.query(
          `select a.attname from pg_attribute a
            where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped
              and not (a.attname = any($2::text[])) limit 1`,
          [target.relation, target.columns],
        )
      ).rows[0]?.attname as string | undefined;
      if (!extra) throw new Error(`${target.relation} has no undeclared column to grant — cannot force RED 1.`);
      await client.query(`grant select (${extra}) on ${target.relation} to anon`);
      const n = report(await measure(client));
      if (n === 0) {
        console.error(`\n${C.r}FAIL${C.x} granting anon SELECT on ${target.relation}.${extra} did NOT fail the guard. It cannot see a leak.`);
        exitAfterDrain(1);
      }
      reds++;
      console.log(`${C.g}RED 1 proven${C.x} ${C.d}(anon granted ${target.relation}.${extra} → ${n} finding(s))${C.x}\n`);
    } finally {
      await client.query("rollback");
    }

    // RED 2 — a declared column stops being readable.
    await client.query("begin");
    try {
      const gone = target.columns[0];
      await client.query(`revoke select (${gone}) on ${target.relation} from anon`);
      const n = report(await measure(client));
      if (n === 0) {
        console.error(`\n${C.r}FAIL${C.x} revoking anon SELECT on ${target.relation}.${gone} did NOT fail the guard. It cannot see a broken client.`);
        exitAfterDrain(1);
      }
      reds++;
      console.log(`${C.g}RED 2 proven${C.x} ${C.d}(anon lost ${target.relation}.${gone} → ${n} finding(s))${C.x}\n`);
    } finally {
      await client.query("rollback");
    }

    // RED 3 — a relation nobody declared becomes anon-readable.
    await client.query("begin");
    try {
      const declared = ANON_COLUMN_SURFACE.map((d) => d.relation);
      const victim = (
        await client.query(
          `select n.nspname || '.' || c.relname as rel
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where c.relkind in ('r','p') and n.nspname = any($1::text[])
              and not (n.nspname || '.' || c.relname = any($2::text[]))
            order by 1 limit 1`,
          [[...POSTGREST_EXPOSED_SCHEMAS], declared],
        )
      ).rows[0]?.rel as string | undefined;
      if (!victim) throw new Error("no undeclared relation to grant — cannot force RED 3.");
      await client.query(`grant select on ${victim} to anon`);
      const n = report(await measure(client));
      if (n === 0) {
        console.error(`\n${C.r}FAIL${C.x} granting anon SELECT on the undeclared ${victim} did NOT fail the guard. It cannot see a new door.`);
        exitAfterDrain(1);
      }
      reds++;
      console.log(`${C.g}RED 3 proven${C.x} ${C.d}(anon granted the undeclared ${victim} → ${n} finding(s))${C.x}\n`);
    } finally {
      await client.query("rollback");
    }

    // GREEN again — the rollbacks really put the live grant back.
    const after = report(await measure(client));
    if (after !== 0) {
      console.error(`\n${C.r}FAIL${C.x} the self-test did not restore the live column grants. THIS IS A LIVE DEFECT — fix the grants by hand now.`);
      exitAfterDrain(1);
    }
    console.log(`${C.g}GREEN${C.x} teardown verified: ${reds} RED proof(s), live grants unchanged.`);
    exitAfterDrain(0);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  exitAfterDrain(1);
});
