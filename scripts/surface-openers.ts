/**
 * scripts/surface-openers.ts — how often agents on a surface START by looking
 * things up.
 *
 * Arman's scorecard (2026-09-27): once a surface is set up, check how agents
 * behave on it. If most runs open with `context` lookups — especially of the
 * same value — the surface is not giving them what they need up front (see the
 * inline policy on `SurfaceValue.inlineUpTo`).
 *
 * Conversations do not record which surface they ran on yet, so this is an
 * ESTIMATE: it counts conversations whose FIRST tool call is a `context` get
 * of one of this surface's own value names, and shows which values are fetched
 * most. Value names shared with other surfaces (`content`, `selection`, …) are
 * left out so they cannot be miscounted.
 *
 * Prints read-only SQL to run through the Supabase MCP (project
 * brsgrqvjdzwihsvnfqkf):
 *
 *   pnpm surface:openers --surface matrx-user/education-classes [--days 14]
 */
import { getAllManifests, getManifest } from "@/features/surfaces/manifests/registry";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const surface = arg("--surface");
const days = Number(arg("--days") ?? "14");
if (!surface || !getManifest(surface)) {
  console.error("Usage: pnpm surface:openers --surface <client/name> [--days 14]");
  process.exit(1);
}

// Names that belong to this surface alone.
const counts = new Map<string, number>();
for (const m of getAllManifests())
  for (const v of m.values) counts.set(v.name, (counts.get(v.name) ?? 0) + 1);
const own = getManifest(surface)!
  .values.map((v) => v.name)
  .filter((n) => counts.get(n) === 1);
if (own.length === 0) {
  console.error(`${surface} has no value names unique to it; the estimate cannot tell its runs apart.`);
  process.exit(1);
}
const q = (n: string) => `'${n.replace(/'/g, "''")}'`;
const list = own.map(q).join(", ");
const targetCounts = new Map<string, number>();
for (const m of getAllManifests())
  for (const t of m.writeTargets ?? []) targetCounts.set(t.name, (targetCounts.get(t.name) ?? 0) + 1);
const ownTargets = (getManifest(surface)!.writeTargets ?? [])
  .map((t) => t.name)
  .filter((n) => targetCounts.get(n) === 1);
const targetClause = ownTargets.length
  ? `\n     or (tool_name = 'apply_surface_write' and arguments->>'target' in (${ownTargets.map(q).join(", ")}))`
  : "";

console.log(`-- ${surface}: agent runs that OPEN with a lookup of this surface's values (last ${days} days).
-- Read: runs_opening_with_lookup / runs_touching_surface is the share to drive toward 0.
with calls as (
  select conversation_id, tool_name, arguments, arguments->>'key' as key, created_at,
         row_number() over (partition by conversation_id order by created_at) as n
  from chat.tool_call
  where created_at > now() - interval '${days} days'
),
touching as (
  select distinct conversation_id from calls
  where (tool_name = 'context' and key in (${list}))${targetClause}
),
openers as (
  select c.conversation_id, c.key from calls c join touching t using (conversation_id)
  where c.n = 1 and c.tool_name = 'context' and c.key in (${list})
)
select (select count(*) from touching) as runs_touching_surface,
       (select count(*) from openers) as runs_opening_with_lookup,
       (select json_agg(x) from (select key, count(*) as runs from openers group by key order by 2 desc) x) as first_lookup_by_value;`);
