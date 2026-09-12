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
         pg_catalog.pg_get_indexdef(ix.indexrelid) as def
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
}

interface Baseline {
  readonly why: string;
  readonly frozen_at: string;
  readonly indexes: string[];
}

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
  process.exit(STRICT ? 1 : 0);
}

async function main(): Promise<number> {
  const env = loadEnv();
  if (!env) unmeasured("no Supabase URL/secret key in env or .env* files");

  const supabase = createClient(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let live: LiveRow[];
  try {
    const { data, error } = await supabase.rpc("execute_admin_query", { query: QUERY });
    if (error) throw new Error(error.message);
    live = unwrapRows(data) as unknown as LiveRow[];
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

  const known = new Set(baseline.indexes);
  const fresh = live.filter((r) => !known.has(r.key));
  const fixed = baseline.indexes.filter((k) => !liveKeys.includes(k));

  console.log(
    `${C.dim}       ${live.length} live · ${baseline.indexes.length} in the frozen census (${baseline.frozen_at}) · ${fixed.length} since fixed${C.reset}`,
  );

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
  (code) => process.exit(code),
  (err) => {
    console.error(`${TAG.fail}check-soft-delete-unique crashed:`, err);
    process.exit(2);
  },
);
