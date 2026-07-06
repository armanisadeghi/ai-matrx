#!/usr/bin/env node
/**
 * db-table-refs — find every reference to a DB table (and its fields) across
 * this repo, IN EVERY NAME FORMAT.
 *
 * Companion to the `db-change` / `db-graveyard-table` / `db-move-table-schema`
 * skills. Before you graveyard, move, or drop a column of a table you MUST find
 * every consumer — a missed reference is how data loss / 404s / silent-wrong
 * values ship. Import-graph tools miss lazy/mid-file imports and never see
 * raw-SQL strings; this greps the raw text (via `git grep`, respecting
 * .gitignore) for the table AND its Pascal/camel/plural variants, plus any
 * fields you pass, and buckets the hits — including a dedicated bucket for the
 * compiler-INVISIBLE ones (raw SQL / `.from("str")` / `getattr(row,"field")`).
 *
 * Usage:
 *   node scripts/db-table-refs.mjs <table_name> [token] [--fields f1,f2,...]
 *   node scripts/db-table-refs.mjs skill_resource skill_resource --fields is_public,user_id,version
 *
 * Exit code 0 always (it's a report). "0 actionable" outside generated types +
 * migrations is the signal a table is safe to retire — but STILL open every hit
 * and verify RPCs/views/functions in the DB (they aren't in this repo).
 */
import { execSync } from "node:child_process";

const argv = process.argv.slice(2);
const fieldsArgIdx = argv.findIndex((a) => a === "--fields");
let fields = [];
if (fieldsArgIdx !== -1) {
  fields = (argv[fieldsArgIdx + 1] || "").split(",").map((s) => s.trim()).filter(Boolean);
  argv.splice(fieldsArgIdx, 2);
}
const [table, token] = argv;
if (!table) {
  console.error(
    "usage: node scripts/db-table-refs.mjs <table_name> [token] [--fields f1,f2,...]",
  );
  process.exit(2);
}

// ── name-format variants ────────────────────────────────────────────────────
const toPascal = (s) =>
  s.split(/[_\s]+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : "")).join("");
const toCamel = (s) => {
  const p = toPascal(s);
  return p ? p[0].toLowerCase() + p.slice(1) : p;
};
const singular = (s) =>
  s.endsWith("ies") ? s.slice(0, -3) + "y" : s.endsWith("ss") ? s : s.endsWith("s") ? s.slice(0, -1) : s;
const plural = (s) =>
  s.endsWith("y") ? s.slice(0, -1) + "ies" : s.endsWith("s") ? s : s + "s";

/** All the ways a snake_case identifier shows up in code. */
function variantsOf(snake) {
  const stems = new Set([snake, singular(snake), plural(snake)]);
  const out = new Set();
  for (const stem of stems) {
    out.add(stem); // snake_case
    out.add(toPascal(stem)); // PascalCase
    out.add(toCamel(stem)); // camelCase
  }
  return [...out].filter(Boolean);
}

function grep(term) {
  try {
    // -n line numbers, -I skip binary, -F fixed string, -w word-boundary
    const out = execSync(`git grep -nIFw -- ${JSON.stringify(term)}`, {
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    });
    return out.split("\n").filter(Boolean);
  } catch (e) {
    if (e.status === 1) return []; // git grep exits 1 on no matches
    throw e;
  }
}

// One search term → many matching lines, each tagged with the variant that hit.
function search(terms) {
  const seen = new Map(); // "path:line" -> { line, variants:Set }
  for (const term of terms) {
    for (const line of grep(term)) {
      const key = line;
      if (!seen.has(key)) seen.set(key, { line, variants: new Set() });
      seen.get(key).variants.add(term);
    }
  }
  return [...seen.values()];
}

// A line the type-checker / ORM CANNOT catch — raw SQL string, dynamic
// .from("str"), or getattr-with-default (silently returns default when the
// column is gone). These are the recurring silent misses.
const COMPILER_INVISIBLE =
  /\b(select|from|join|update|insert\s+into|delete\s+from)\b|\.(from|schema|rpc)\s*\(\s*["'`]|\.(eq|neq|is|filter|order|select|update|upsert|insert)\s*\(\s*["'`]|getattr\s*\(|filter_items\s*\(/i;

const buckets = {
  "🔴 COMPILER-INVISIBLE (raw SQL / dynamic .from / getattr — the silent misses; CHECK EACH)": [],
  "supabase data calls (.from / .rpc — REPOINT THESE)": [],
  "generated (regenerate: pnpm db-types / gen:entity-types — never hand-edit)": [],
  "migrations (history — informational)": [],
  "other references (READ EACH — types, constants, comments, lazy imports, services)": [],
};

function bucketize(hits) {
  for (const { line, variants } of hits) {
    const path = line.slice(0, line.indexOf(":"));
    const tag = ` «${[...variants].join(",")}»`;
    const tagged = line + tag;
    if (COMPILER_INVISIBLE.test(line))
      buckets[Object.keys(buckets)[0]].push(tagged);
    else if (
      path === "types/database.types.ts" ||
      path.startsWith("types/generated/")
    )
      buckets["generated (regenerate: pnpm db-types / gen:entity-types — never hand-edit)"].push(tagged);
    else if (path.startsWith("migrations/"))
      buckets["migrations (history — informational)"].push(tagged);
    else if (/\.(from|rpc|schema)\s*\(/.test(line))
      buckets["supabase data calls (.from / .rpc — REPOINT THESE)"].push(tagged);
    else
      buckets["other references (READ EACH — types, constants, comments, lazy imports, services)"].push(tagged);
  }
}

const tableVariants = variantsOf(table);
bucketize(search(tableVariants));

const CAP = 200;
let total = 0;
console.log(`\n=== references to "${table}" in matrx-frontend ===`);
console.log(`    table variants searched: ${tableVariants.join(", ")}`);
if (fields.length)
  console.log(
    `    field variants searched: ${fields.map((f) => variantsOf(f).join("/")).join("  ·  ")}`,
  );
for (const [name, lines] of Object.entries(buckets)) {
  total += lines.length;
  console.log(`\n## ${name} — ${lines.length}`);
  lines.slice(0, CAP).forEach((l) => console.log("  " + l));
  if (lines.length > CAP) console.log(`  …and ${lines.length - CAP} more`);
}

if (fields.length) {
  console.log(`\n=== FIELD references (open every one — a dropped column breaks these) ===`);
  for (const f of fields) {
    const fv = variantsOf(f);
    const hits = search(fv);
    console.log(`\n## field "${f}" (${fv.join(", ")}) — ${hits.length}`);
    hits.slice(0, CAP).forEach(({ line, variants }) =>
      console.log(
        `  ${COMPILER_INVISIBLE.test(line) ? "🔴 " : "   "}${line} «${[...variants].join(",")}»`,
      ),
    );
    if (hits.length > CAP) console.log(`  …and ${hits.length - CAP} more`);
  }
}

if (token) {
  const t = grep(token);
  console.log(
    `\n## token "${token}" (entity_types / permissions / associations / shareable_resource_registry) — ${t.length}`,
  );
  t.slice(0, CAP).forEach((l) => console.log("  " + l));
  if (t.length > CAP) console.log(`  …and ${t.length - CAP} more`);
}

const invisible = buckets[Object.keys(buckets)[0]].length;
const actionable =
  total -
  buckets["generated (regenerate: pnpm db-types / gen:entity-types — never hand-edit)"].length -
  buckets["migrations (history — informational)"].length;
console.log(`\n=== ${total} total hits · ${actionable} actionable · ${invisible} compiler-invisible ===`);
console.log(
  actionable === 0
    ? "→ No actionable code references. Likely safe to retire — STILL open every hit above and verify RPCs/views/functions in the DB (they are not in this repo; see the skill's discovery SQL).\n"
    : "→ Repoint/remove every actionable reference — ESPECIALLY the 🔴 compiler-invisible ones — before retiring or moving. `type-check` is the LAST-step backstop, not the search.\n",
);
