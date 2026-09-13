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
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  ANON_COLUMN_SURFACE,
  ANON_COLUMN_SURFACE_QUERY,
  classifyAnonColumns,
  type LiveAnonColumn,
} from "../lib/security/public-exposure";

const require_ = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pg: any = require_("pg");

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
  process.exit(1);
}

async function connect() {
  const env = resolveDbEnv();
  const client = new pg.Client({
    host: env.SUPABASE_MATRIX_HOST,
    port: Number(env.SUPABASE_MATRIX_PORT),
    user: env.SUPABASE_MATRIX_USER,
    password: env.SUPABASE_MATRIX_PASSWORD,
    database: env.SUPABASE_MATRIX_DATABASE_NAME,
    ssl: { rejectUnauthorized: false },
    application_name: "check-anon-column-surface",
    connectionTimeoutMillis: 20000,
  });
  await client.connect();
  // Supavisor pools in transaction mode: a server connection can arrive with a
  // non-LOCAL SET ROLE another client left behind. Reading privileges as the
  // wrong role is a wrong answer that looks like a right one.
  await client.query("set role none");
  return client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function measure(client: any): Promise<LiveAnonColumn[]> {
  const relations = ANON_COLUMN_SURFACE.map((d) => d.relation);
  const { rows } = await client.query(ANON_COLUMN_SURFACE_QUERY, [relations]);
  return rows as LiveAnonColumn[];
}

function report(live: LiveAnonColumn[]): number {
  const drift = classifyAnonColumns(live);
  const byRelation = new Map<string, string[]>();
  for (const l of live) byRelation.set(l.relation, [...(byRelation.get(l.relation) ?? []), l.column]);

  console.log(
    `${C.b}Anon column surface${C.x} ${C.d}(which columns a signed-out visitor can read on a deliberately public relation)${C.x}`,
  );
  for (const d of ANON_COLUMN_SURFACE) {
    const actual = byRelation.get(d.relation) ?? [];
    console.log(`  ${d.relation} ${C.d}— ${actual.length} live column(s), ${d.columns.length} declared${C.x}`);
  }

  if (!drift.length) {
    console.log(`${C.g}OK${C.x}   every declared relation publishes exactly the columns it declares.`);
    return 0;
  }

  for (const d of drift) {
    if (d.extra.length) {
      console.log(
        `${C.r}FAIL${C.x} ${d.relation} publishes ${d.extra.length} column(s) nobody declared: ${C.b}${d.extra.join(", ")}${C.x}\n` +
          `     A signed-out visitor with the publishable key can read them today.\n` +
          `     Either revoke them (revoke select on <relation> from anon; grant select (<the declared list>) ... to anon)\n` +
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

async function main() {
  const client = await connect();
  try {
    if (!SELF_TEST) {
      process.exit(report(await measure(client)) ? 1 : 0);
    }

    // ── THE SELF-TEST: a guard nobody has seen fail is not a guard. ──────────
    // Both directions are forced against the REAL database inside a transaction
    // that is ALWAYS rolled back, so the live grant is never left changed.
    const target = ANON_COLUMN_SURFACE[0];
    if (!target) {
      console.error(`${C.r}FAIL${C.x} ANON_COLUMN_SURFACE is empty — there is nothing to self-test against.`);
      process.exit(1);
    }
    console.log(`${C.b}--self-test${C.x} ${C.d}forcing both drift directions on ${target.relation}${C.x}\n`);

    const baseline = report(await measure(client));
    if (baseline !== 0) {
      console.error(
        `\n${C.r}FAIL${C.x} the self-test needs a GREEN starting point and the live surface already drifts (above).\n` +
          `     Fix the drift first; a RED proof on top of a RED baseline proves nothing.`,
      );
      process.exit(1);
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
        process.exit(1);
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
        process.exit(1);
      }
      reds++;
      console.log(`${C.g}RED 2 proven${C.x} ${C.d}(anon lost ${target.relation}.${gone} → ${n} finding(s))${C.x}\n`);
    } finally {
      await client.query("rollback");
    }

    // GREEN again — the rollbacks really put the live grant back.
    const after = report(await measure(client));
    if (after !== 0) {
      console.error(`\n${C.r}FAIL${C.x} the self-test did not restore the live column grants. THIS IS A LIVE DEFECT — fix the grants by hand now.`);
      process.exit(1);
    }
    console.log(`${C.g}GREEN${C.x} teardown verified: ${reds} RED proof(s), live grants unchanged.`);
    process.exit(0);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
