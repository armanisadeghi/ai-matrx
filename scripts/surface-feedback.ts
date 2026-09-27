/**
 * scripts/surface-feedback.ts
 *
 * Read back the feedback agents filed about a surface through the platform
 * `surface_feedback` write target (features/surfaces/runtime/surface-feedback.ts).
 * Rows live in `users.user_feedback` with metadata.source =
 * 'surface_agent_feedback'. Read them before updating a surface.
 *
 * Cloud sessions have no direct DB credentials, so this PRINTS a read-only SQL
 * query to run through the Supabase MCP (project brsgrqvjdzwihsvnfqkf), the
 * same way `pnpm surface:census --sql` does.
 *
 *   pnpm surface:feedback --surface matrx-user/education-classes
 *   pnpm surface:feedback --surface matrx-user/education-classes --status all
 *   pnpm surface:feedback --all          # counts per surface
 */

const OPEN_STATUSES_EXCLUDED = ["resolved", "closed", "wont_fix", "split"];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function usage(message?: string): never {
  if (message) console.error(message);
  console.error(
    "Usage: pnpm surface:feedback --surface <name> [--status open|all]\n" +
      "       pnpm surface:feedback --all",
  );
  process.exit(1);
}

const openFilter = `f.status not in (${OPEN_STATUSES_EXCLUDED.map(lit).join(", ")})`;

if (process.argv.includes("--all")) {
  console.log(`-- Agent feedback per surface (read-only). Run through the Supabase MCP.
select f.metadata->>'surface_name' as surface,
       count(*) filter (where ${openFilter}) as open,
       count(*) as total,
       max(f.created_at) as latest
from users.user_feedback f
where f.metadata->>'source' = 'surface_agent_feedback'
  and f.deleted_at is null
group by 1
order by open desc, latest desc;`);
} else {
  const surface = arg("--surface");
  if (!surface || surface.startsWith("--")) usage("--surface <name> is required (or pass --all).");
  const status = arg("--status") ?? "open";
  if (status !== "open" && status !== "all") usage(`--status must be open or all, not "${status}".`);
  console.log(`-- Agent feedback for ${surface} (${status}), newest first (read-only). Run through the Supabase MCP.
select f.id,
       f.created_at,
       f.metadata->>'kind' as kind,
       f.metadata->>'target_or_value' as target_or_value,
       regexp_replace(f.description, '^\\[surface feedback\\][^\\n]*\\n\\n', '') as message,
       f.status
from users.user_feedback f
where f.metadata->>'source' = 'surface_agent_feedback'
  and f.metadata->>'surface_name' = ${lit(surface)}
  and f.deleted_at is null${status === "open" ? `\n  and ${openFilter}` : ""}
order by f.created_at desc;`);
}
