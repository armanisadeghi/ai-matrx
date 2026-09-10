# Canonical Associations — Recipe C (canonicalize a table reference)

Companion to [`SKILL.md`](./SKILL.md) — read it first: the load-bearing boundary, the token rule, and the edge-direction rule govern every step here.

## Recipe C — Canonicalize a table reference (kills PGRST205 / 42703)

The 2026 reorg moved tables out of `public` into domain schemas. A bare `supabase.from("tasks")` now resolves to `public.tasks` → **PGRST205** (or a wrong-column **42703**).

1. **Find the canonical home.** Resolve the schema via the entity registry (`getEntityInfo(token).schema`/`.table`) or, for sharing-domain reads, the shareable registry (`getShareableResource(type).schemaName`/`.physicalTable`). Confirm live with a Supabase MCP `execute_sql` against `information_schema` if unsure — never guess a schema.
2. **Qualify the read/write:** `supabase.schema("workspace").from("tasks")`, `supabase.schema("files").from("files")`, etc. (Reads/writes go DIRECT to Postgres — never route a plain DB op through Python or a Next.js API route.)
3. **Register the move** in `scripts/dead-relations.json` (+ run the guard) so the old bare name lights up red until every callsite is repointed.
4. **Verify:** `pnpm check:schema` (live-schema diff: `direct-from-schema` + `dead-relations`) and `pnpm check:dead-relations` (fast offline subset, on every commit). `:strict` variants exit non-zero for CI.
