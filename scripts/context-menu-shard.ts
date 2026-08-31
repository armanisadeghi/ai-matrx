#!/usr/bin/env npx tsx
/**
 * context-menu-shard — turn the census into N disjoint agent assignments.
 *
 * 🚨 WHY SHARDING IS THE WHOLE SAFETY MODEL. The rollout runs dozens of agents
 * against ONE shared checkout. There is no lease, no lock, and no claim table —
 * and there does not need to be, PROVIDED no two agents can ever be handed the
 * same file. That is this script's only real job: a deterministic partition, so
 * contention is structurally impossible rather than merely unlikely.
 *
 * Two agents on one file is not a merge conflict, it is worse: both wrap the
 * same pane and the app ends up with NESTED menus, where the inner trigger
 * silently wins and the outer one never opens. That failure looks like success
 * in a screenshot.
 *
 * GROUPING BEATS ROUND-ROBIN. Files are grouped by directory before being dealt
 * out, because sibling files usually show the SAME identity — four scheduling
 * tables, five CX dashboard tables. One agent holding the whole group is the
 * agent that notices "this identity appears on 2+ surfaces" and extracts ONE
 * shared builder instead of writing four inline copies. Splitting a directory
 * across agents actively produces the duplication the registry exists to stop.
 *
 * Shared builders are the one file agents legitimately co-edit (THE GROWTH
 * STEP). That is a normal git conflict on a small file, not a wrapper race.
 *
 * Usage:
 *   npx tsx scripts/context-menu-shard.ts --agents 8 --population tables
 *   npx tsx scripts/context-menu-shard.ts --agents 12 --population tables --json
 */

import { execFileSync } from "node:child_process";

const ARGV = process.argv.slice(2);
const arg = (name: string, fallback: string): string =>
  ARGV.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ??
  (ARGV.includes(`--${name}`) ? ARGV[ARGV.indexOf(`--${name}`) + 1] : undefined) ??
  fallback;

const AGENTS = Math.max(1, Number(arg("agents", "8")));
const POPULATION = arg("population", "tables");
const JSON_OUT = ARGV.includes("--json");

interface Row {
  population: string;
  file: string;
  detail: string;
}

function census(): Row[] {
  const out = execFileSync(
    "npx",
    ["tsx", "scripts/check-context-menu.ts", "--json", `--population=${POPULATION}`],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  // The script prints only JSON on --json, but be defensive about a stray line.
  const start = out.indexOf("{");
  return (JSON.parse(out.slice(start)) as { rows: Row[] }).rows ?? [];
}

/** Directory key — the grouping unit, and the reason this beats round-robin. */
function groupKey(file: string): string {
  const parts = file.split("/");
  parts.pop();
  return parts.join("/");
}

function main() {
  const rows = census();
  if (rows.length === 0) {
    console.log(`Nothing left in "${POPULATION}". The population is clear.`);
    return;
  }

  // Group, then deal whole groups to the emptiest agent (longest-processing-time
  // first): keeps sibling files together AND keeps the shards even.
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    const k = groupKey(r.file);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r.file);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  const shards: Array<{ agent: number; files: string[]; groups: string[] }> =
    Array.from({ length: AGENTS }, (_, i) => ({ agent: i + 1, files: [], groups: [] }));

  for (const [dir, files] of ordered) {
    const lightest = shards.reduce((a, b) => (a.files.length <= b.files.length ? a : b));
    lightest.files.push(...files);
    lightest.groups.push(dir);
  }

  const used = shards.filter((s) => s.files.length > 0);

  if (JSON_OUT) {
    console.log(JSON.stringify({ population: POPULATION, total: rows.length, shards: used }, null, 2));
    return;
  }

  console.log(
    `\n${rows.length} files in "${POPULATION}" → ${used.length} shards (grouped by directory)\n`,
  );
  for (const s of used) {
    console.log(`── agent ${s.agent} — ${s.files.length} files`);
    for (const f of s.files) console.log(`   ${f}`);
    console.log("");
  }
  // The invariant this script exists to guarantee, asserted rather than assumed.
  const all = used.flatMap((s) => s.files);
  const dupes = all.filter((f, i) => all.indexOf(f) !== i);
  console.log(
    dupes.length === 0
      ? `✓ partition is disjoint — no file is assigned twice`
      : `🚨 OVERLAP (${dupes.length}): ${dupes.join(", ")}`,
  );
}

main();
