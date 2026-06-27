#!/usr/bin/env node
/**
 * db-table-refs — find every reference to a DB table across this repo.
 *
 * Companion to the `db-change` / `db-graveyard-table` / `db-move-table-schema`
 * skills. Before you graveyard or move a table you MUST find every consumer —
 * a missed reference is how data loss / 404s happen. This greps the repo (via
 * `git grep`, so it respects .gitignore) and buckets the hits so you can see at
 * a glance what still points at the table.
 *
 * Usage:
 *   node scripts/db-table-refs.mjs <table_name> [token]
 *   node scripts/db-table-refs.mjs cx_conversation conversation
 *
 * Exit code 0 always (it's a report). "0 references" outside generated types +
 * migrations is the signal a table is safe to retire — but verify manually.
 */
import { execSync } from "node:child_process";

const [, , table, token] = process.argv;
if (!table) {
  console.error("usage: node scripts/db-table-refs.mjs <table_name> [token]");
  process.exit(2);
}

function grep(term) {
  try {
    // -n line numbers, -I skip binary, -F fixed string, -w word-boundary
    const out = execSync(`git grep -nIFw -- ${JSON.stringify(term)}`, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return out.split("\n").filter(Boolean);
  } catch (e) {
    // git grep exits 1 when there are no matches — that's not an error here.
    if (e.status === 1) return [];
    throw e;
  }
}

const buckets = {
  "supabase data calls (.from / .rpc — REPOINT THESE)": [],
  "generated types (regenerate via `pnpm db-types`, never hand-edit)": [],
  "migrations (history — informational)": [],
  "other references (read each — types, constants, comments, services)": [],
};

for (const line of grep(table)) {
  const path = line.slice(0, line.indexOf(":"));
  if (path === "types/database.types.ts") buckets["generated types (regenerate via `pnpm db-types`, never hand-edit)"].push(line);
  else if (path.startsWith("migrations/")) buckets["migrations (history — informational)"].push(line);
  else if (/\.(from|rpc|schema)\s*\(/.test(line)) buckets["supabase data calls (.from / .rpc — REPOINT THESE)"].push(line);
  else buckets["other references (read each — types, constants, comments, services)"].push(line);
}

const CAP = 120;
let total = 0;
console.log(`\n=== references to "${table}" in matrx-frontend ===`);
for (const [name, lines] of Object.entries(buckets)) {
  total += lines.length;
  console.log(`\n## ${name} — ${lines.length}`);
  lines.slice(0, CAP).forEach((l) => console.log("  " + l));
  if (lines.length > CAP) console.log(`  …and ${lines.length - CAP} more`);
}

if (token) {
  const t = grep(token);
  console.log(`\n## token "${token}" (entity_types / permissions / associations / shareable_resource_registry) — ${t.length}`);
  t.slice(0, CAP).forEach((l) => console.log("  " + l));
  if (t.length > CAP) console.log(`  …and ${t.length - CAP} more`);
}

const actionable = total
  - buckets["generated types (regenerate via `pnpm db-types`, never hand-edit)"].length
  - buckets["migrations (history — informational)"].length;
console.log(`\n=== ${total} total hits · ${actionable} actionable (excl. generated types + migrations) ===`);
console.log(actionable === 0
  ? "→ No actionable code references. Likely safe to retire — still verify RPCs/views in the DB (see the skill's discovery SQL).\n"
  : "→ Repoint/remove the actionable references before retiring or moving the table.\n");
