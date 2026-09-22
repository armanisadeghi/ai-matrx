#!/usr/bin/env npx tsx
/**
 * Soft-delete vs unique indexes — can a removed thing still hold its name?
 *
 * THE CLASS. `deleted_at IS NULL` means live (db-rules FEATURE.md §8) and every
 * screen filters on it, so a removed row is gone everywhere a person can look.
 * A unique index that does NOT carry `WHERE deleted_at IS NULL` still counts
 * that row. The user removes "Region", creates "Region" again, and gets
 *     duplicate key value violates unique constraint "unique_type_per_org"
 * naming a row nobody can see — with no way out from the UI, because the name is
 * held forever by an invisible row.
 *
 * PROVEN ON THE LIVE DATABASE 2026-09-11, three times, each in a rolled-back
 * transaction (create X → set deleted_at → create X again): `unique_type_per_org`
 * on context.scope_types, `idx_scope_unique_top` and `idx_scope_unique_nested` on
 * context.scopes. All three are fixed by
 * migrations/soft_delete_partial_unique_indexes_context.sql.
 *
 * WHY A FROZEN CENSUS AND NOT A BLANKET FAIL. At the time of writing 257 unique
 * indexes across 222 registered soft-deletable tables have no such predicate, and
 * they are NOT all defects: an idempotency key, a provider handle, or an external
 * system's id must stay unique forever, removed or not. Each one needs a person
 * to read it and decide. So this gate does not judge the existing population — it
 * FREEZES it, and fails on anything NEW. That is the ratchet: the class cannot
 * grow while it is being worked down.
 *
 * 🚨 THE BASELINE ONLY EVER SHRINKS. `--update-baseline` refuses to add an entry
 * once the file exists. There is no way to silence a finding by editing the
 * census: the only way to clear a NEW index is to give it the predicate (or, if
 * it genuinely must count removed rows, to say so in its own migration and bring
 * the ruling here by hand, with the reason). An entry that disappears because it
 * was fixed is removed with `--update-baseline`.
 *
 * WHY A LIVE PULL AND NOT A SOURCE SCAN: the index is in the catalog. A migration
 * file on disk proves nothing about what the database has (db-rules §1).
 *
 *   pnpm check:soft-delete-unique              # loud, exit 0
 *   pnpm check:soft-delete-unique:strict       # exit 1 on any NEW index (CI)
 *   pnpm check:soft-delete-unique -- --update-baseline   # remove fixed entries
 *   pnpm check:soft-delete-unique -- --self-test         # the identity exclusion, RED then GREEN
 *
 * 🚨 UNMEASURED IS NOT PASSED — a run that could not reach the database says so
 * and, under --strict, exits 1.
 *
 * Exit codes: 0 clean (or findings in advisory mode) · 1 new index / unmeasured
 *             AND --strict · 2 the script itself crashed
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { unwrapRows } from "../lib/integrity/unwrap";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = resolve(ROOT, "scripts/soft-delete-unique-baseline.json");
const STRICT = process.argv.includes("--strict");
const UPDATE = process.argv.includes("--update-baseline");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};
const TAG = {
  info: `${C.cyan}[INFO]${C.reset} `,
  warn: `${C.yellow}[WARN]${C.reset} `,
  fail: `${C.red}[FAIL]${C.reset} `,
  ok: `${C.green}[ OK ]${C.reset} `,
};

/**
 * Every UNIQUE index (primary keys excluded — a surrogate `id` is unique by
 * construction and never collides with a removed row) on a table that BOTH has a
 * `deleted_at` column AND is a registered entity, whose predicate does not
 * mention `deleted_at is null`.
 */
const QUERY = `
  with soft as (
    select c.oid, n.nspname, c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_attribute a
      on a.attrelid = c.oid and a.attname = 'deleted_at'
     and a.attnum > 0 and not a.attisdropped
    where c.relkind = 'r'
  )
  select s.nspname || '.' || s.relname || ':' || i.relname as key,
         et.token,
         pg_catalog.pg_get_indexdef(ix.indexrelid) as def,
         (select coalesce(array_agg(a2.attname::text order by k.ord), '{}')
            from unnest(ix.indkey) with ordinality as k(attnum, ord)
            join pg_catalog.pg_attribute a2 on a2.attrelid = s.oid and a2.attnum = k.attnum) as key_columns
  from soft s
  join pg_catalog.pg_index ix
    on ix.indrelid = s.oid and ix.indisunique and not ix.indisprimary
  join pg_catalog.pg_class i on i.oid = ix.indexrelid
  join platform.entity_types et
    on et.schema_name = s.nspname and et.table_name = s.relname
  where coalesce(pg_catalog.pg_get_expr(ix.indpred, ix.indrelid), '')
        not ilike '%deleted_at is null%'
  order by 1
`;

interface LiveRow {
  readonly key: string;
  readonly token: string;
  readonly def: string;
  /** The index's key columns, in order — `{}` for an expression-only index. */
  readonly key_columns: readonly string[];
}

/**
 * THE IDENTITY EXCLUSION (2026-09-18). The defect this guard exists for needs a NATURAL key — a
 * value a person re-types ("Region", a slug, an email). A unique index whose key carries the
 * row's own base-contract `id` (db-rules §2) can never be held by a removed row, because an id is
 * minted once and never re-typed: `(id)` beside a text primary key (platform.retrofit_entity's
 * uuid identity, e.g. extend.wbx_demo) and `(id, organization_id)` (a composite FK target, e.g.
 * workbench.note_folders) are the two live shapes. This is the same reason the query already
 * excludes primary keys; it was narrower than that reason, and two identity indexes were reported
 * as the name-collision defect they cannot cause. Proven failing-then-passing by `--self-test`.
 */
export function isIdentityImpliedIndex(keyColumns: readonly string[]): boolean {
  return keyColumns.includes("id");
}

interface Baseline {
  readonly why: string;
  readonly frozen_at: string;
  readonly indexes: string[];
  /**
   * 🚨 THE RULING LIST (CI-FIX-2, 2026-09-22). The header has always sanctioned
   * one escape from the ratchet — "if it genuinely must count removed rows, say
   * so in its own migration and bring the ruling here BY HAND, with the reason"
   * — but the file had nowhere to put the reason, so the only way to take that
   * escape was to drop the key into `indexes` where it became indistinguishable
   * from the 248 entries a person has yet to read. That is silencing, not
   * ruling.
   *
   * `deliberate` is that escape made LOUDER than the thing it excuses:
   *   • every entry carries a reason, and a reason under 40 characters is
   *     REFUSED — the run fails naming the entry, so "ok" is not a ruling;
   *   • every entry is PRINTED on every run, green, with its sentence, so a
   *     ruling can never go quiet the way a census line does;
   *   • `--update-baseline` never writes here and still refuses to add to
   *     `indexes`, so the only way in is a person typing the sentence;
   *   • an entry whose index is no longer live is reported as stale and must be
   *     removed, exactly like a census entry.
   */
  readonly deliberate?: readonly DeliberateRuling[];
}

interface DeliberateRuling {
  /** `schema.table:index_name`, the same key shape as `indexes`. */
  readonly index: string;
  /** Why this index must stay unique across removed rows. */
  readonly reason: string;
  /** Who ruled, and when. */
  readonly ruled: string;
}

/** A ruling with no real sentence is not a ruling. */
const MIN_RULING_CHARS = 40;

function loadEnv(): { url: string; key: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let key = process.env.SUPABASE_SECRET_KEY ?? "";
  if (!url || !key) {
    for (const f of [".env.local", ".env.production.local", ".env.production", ".env"]) {
      const p = resolve(ROOT, f);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
        if (!url && m[1] === "NEXT_PUBLIC_SUPABASE_URL") url = v;
        if (!key && m[1] === "SUPABASE_SECRET_KEY") key = v;
      }
      if (url && key) break;
    }
  }
  return url && key ? { url, key } : null;
}

function readBaseline(): Baseline | null {
  if (!existsSync(BASELINE)) return null;
  const parsed: unknown = JSON.parse(readFileSync(BASELINE, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Baseline).indexes)
  ) {
    throw new Error(`${BASELINE} is not {why, frozen_at, indexes[]}`);
  }
  return parsed as Baseline;
}

function unmeasured(reason: string): never {
  console.log("");
  console.log(
    `${TAG.warn}${C.bold}${C.yellow}LIVE PULL FAILED — soft-delete unique indexes are UNMEASURED${C.reset}`,
  );
  console.log(`  ${C.dim}${reason}${C.reset}`);
  console.log(
    `  ${C.dim}Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY. Nothing was checked — that is NOT a pass.${C.reset}`,
  );
  console.log("");
  exitAfterDrain(STRICT ? 1 : 0);
}

const SELF_TEST = process.argv.includes("--self-test");

/**
 * The identity exclusion must find the two live shapes and must NOT excuse a natural key.
 * RED first: the pre-2026-09-18 classifier (every non-primary unique index is a suspect) is run
 * over the same fixtures and must disagree, or this test proves nothing.
 */
function selfTest(): number {
  const fixtures: ReadonlyArray<readonly [string, readonly string[], boolean]> = [
    ["extend_wbx_demo_id_key (id) — retrofit_entity's uuid identity beside a text PK", ["id"], true],
    ["note_folders_id_organization_unique (id, organization_id) — a composite FK target", ["id", "organization_id"], true],
    ["note_folders_organization_created_by_name_unique — a NAME a person re-types", ["organization_id", "created_by", "name"], false],
    ["unique_type_per_org (organization_id, key) — the 2026-09-11 proven defect", ["organization_id", "key"], false],
    ["an expression-only index (no key columns)", [], false],
  ];
  const legacy = (_cols: readonly string[]): boolean => false; // the old classifier excused nothing
  let bad = 0;
  console.log(`${C.bold}SELF-TEST${C.reset} ${C.dim}(identity-implied indexes leave the census; natural keys stay)${C.reset}`);
  for (const [name, cols, expected] of fixtures) {
    const got = isIdentityImpliedIndex(cols);
    const ok = got === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? TAG.ok : TAG.fail}${name} → identity-implied=${got}`);
  }
  const redThenGreen = fixtures.filter(([, cols, exp]) => exp && legacy(cols) !== isIdentityImpliedIndex(cols)).length;
  if (redThenGreen !== 2) {
    bad++;
    console.log(`  ${TAG.fail}the old classifier must disagree on exactly the two identity shapes (RED before, GREEN after); it disagreed on ${redThenGreen}`);
  } else {
    console.log(`  ${TAG.ok}the old classifier flagged both identity shapes; the new one excuses exactly those two`);
  }
  console.log(bad === 0 ? `${TAG.ok}${C.bold}the classifier fails when it should and passes when it should${C.reset}` : `${TAG.fail}${C.bold}the classifier is not trustworthy${C.reset}`);
  return bad === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  if (SELF_TEST) return selfTest();
  const env = loadEnv();
  if (!env) unmeasured("no Supabase URL/secret key in env or .env* files");

  const supabase = createClient(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let live: LiveRow[];
  try {
    const { data, error } = await supabase.rpc("execute_admin_query", { query: QUERY });
    if (error) throw new Error(error.message);
    live = (unwrapRows(data) as unknown as LiveRow[]).filter(
      (r) => !isIdentityImpliedIndex(r.key_columns ?? []),
    );
  } catch (err) {
    unmeasured(`execute_admin_query failed — ${String(err)}`);
  }

  const liveKeys = live.map((r) => r.key);
  const baseline = readBaseline();

  if (UPDATE) {
    if (!baseline) {
      const next: Baseline = {
        why: "Frozen census of unique indexes on registered soft-deletable tables that do NOT carry `WHERE deleted_at IS NULL`. This list only ever SHRINKS: a new index here is a defect, and the only way to remove an entry is to give the index the predicate. See scripts/check-soft-delete-unique.ts.",
        frozen_at: new Date().toISOString().slice(0, 10),
        indexes: [...liveKeys].sort(),
      };
      writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
      console.log(`${TAG.ok}Baseline created with ${next.indexes.length} entries — ${BASELINE}`);
      return 0;
    }
    const additions = liveKeys.filter((k) => !baseline.indexes.includes(k));
    if (additions.length) {
      console.log(
        `${TAG.fail}--update-baseline REFUSED: it would ADD ${additions.length} entr(y/ies).`,
      );
      for (const a of additions) console.log(`     ${a}`);
      console.log(
        `${C.dim}       The baseline only shrinks. Give the index \`WHERE deleted_at IS NULL\` in a migration.${C.reset}`,
      );
      return 1;
    }
    const kept = baseline.indexes.filter((k) => liveKeys.includes(k));
    const removed = baseline.indexes.filter((k) => !liveKeys.includes(k));
    writeFileSync(
      BASELINE,
      `${JSON.stringify({ ...baseline, indexes: kept }, null, 2)}\n`,
    );
    console.log(
      `${TAG.ok}Baseline shrunk by ${removed.length} — ${kept.length} left.`,
    );
    for (const r of removed) console.log(`     fixed: ${r}`);
    return 0;
  }

  console.log("");
  console.log(
    `${C.bold}Soft-delete vs unique indexes${C.reset} ${C.dim}(a removed row must not hold its key)${C.reset}`,
  );

  if (!baseline) {
    console.log(
      `${TAG.fail}No baseline at ${BASELINE} — run \`pnpm check:soft-delete-unique -- --update-baseline\` once to freeze the census.`,
    );
    return STRICT ? 1 : 0;
  }

  const rulings = baseline.deliberate ?? [];
  const ruledKeys = new Set(rulings.map((r) => r.index));
  const known = new Set([...baseline.indexes, ...ruledKeys]);
  const fresh = live.filter((r) => !known.has(r.key));
  const fixed = baseline.indexes.filter((k) => !liveKeys.includes(k));

  // A ruling with no sentence, or one nobody signed, is refused BY NAME — and
  // so is a ruling for an index that is no longer there.
  const badRulings: string[] = [];
  for (const r of rulings) {
    if (!r.reason || r.reason.trim().length < MIN_RULING_CHARS) {
      badRulings.push(
        `${r.index} — the ruling has no reason (under ${MIN_RULING_CHARS} characters). Say why this index must stay unique across removed rows, or give it \`WHERE deleted_at IS NULL\`.`,
      );
    }
    if (!r.ruled || !r.ruled.trim()) {
      badRulings.push(`${r.index} — the ruling is unsigned; name who ruled and when.`);
    }
    if (!liveKeys.includes(r.index)) {
      badRulings.push(
        `${r.index} — ruled deliberate but no longer live; remove the ruling.`,
      );
    }
  }

  console.log(
    `${C.dim}       ${live.length} live · ${baseline.indexes.length} in the frozen census (${baseline.frozen_at}) · ${rulings.length} ruled deliberate · ${fixed.length} since fixed${C.reset}`,
  );

  // EVERY ruling, EVERY run. The escape is louder than the census it leaves.
  for (const r of rulings) {
    console.log(`  ${TAG.ok}RULED ${r.index} ${C.dim}(${r.ruled})${C.reset}`);
    console.log(`        ${C.dim}${r.reason}${C.reset}`);
  }
  for (const b of badRulings) {
    console.log(`  ${TAG.fail}RULING REFUSED ${b}`);
  }

  for (const r of fresh) {
    console.log(`  ${TAG.fail}NEW  ${r.key} ${C.dim}(${r.token})${C.reset}`);
    console.log(`        ${C.dim}${r.def}${C.reset}`);
  }
  for (const k of fixed) {
    console.log(
      `  ${TAG.info}fixed ${k} ${C.dim}— remove it: pnpm check:soft-delete-unique -- --update-baseline${C.reset}`,
    );
  }

  console.log("");
  if (badRulings.length) {
    console.log(
      `${TAG.fail}${C.bold}${C.red}${badRulings.length} ruling(s) in ${BASELINE} are not rulings.${C.reset}`,
    );
    console.log(
      `  ${C.dim}An entry under \`deliberate\` buys an index out of the ratchet, so it costs a${C.reset}`,
    );
    console.log(
      `  ${C.dim}real sentence and a signature. Write one, or give the index the predicate.${C.reset}`,
    );
    console.log("");
    if (!fresh.length) return STRICT ? 1 : 0;
  }
  if (!fresh.length) {
    console.log(
      `${TAG.ok}No new unique index counts soft-deleted rows.`,
    );
    console.log("");
    return 0;
  }
  console.log(
    `${TAG.fail}${C.bold}${C.red}${fresh.length} NEW unique index(es) count rows the user cannot see.${C.reset}`,
  );
  console.log(
    `  ${C.dim}Remove a thing, create it again with the same name, and the database refuses${C.reset}`,
  );
  console.log(
    `  ${C.dim}naming a row nobody can find. Fix: add \`WHERE deleted_at IS NULL\` to the index in${C.reset}`,
  );
  console.log(
    `  ${C.dim}a migration (pattern: migrations/soft_delete_partial_unique_indexes_context.sql).${C.reset}`,
  );
  console.log(
    `  ${C.dim}If it genuinely must stay unique across removed rows (an idempotency key, an${C.reset}`,
  );
  console.log(
    `  ${C.dim}external system's id), say so in that migration and add the entry here BY HAND${C.reset}`,
  );
  console.log(
    `  ${C.dim}with the reason — --update-baseline will not do it for you.${C.reset}`,
  );
  console.log("");
  return STRICT ? 1 : 0;
}

main().then(
  (code) => exitAfterDrain(code),
  (err) => {
    console.error(`${TAG.fail}check-soft-delete-unique crashed:`, err);
    exitAfterDrain(2);
  },
);
