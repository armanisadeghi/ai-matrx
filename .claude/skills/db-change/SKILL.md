---
name: db-change
description: Entry point and shared SOP for the 2026 Matrx DB transition — any structural change to the live Supabase database (Matrx Main) during downtime. Use whenever the task is to move a table to the graveyard, move a table to another schema, canonicalize a table/feature onto the platform standard, or drop / merge tables or change DB logic. Triggers on "graveyard <table>", "move <table> to <schema>", "canonicalize <feature/table>", "retire/drop/merge <table>", "bring <X> onto the platform base entity", or any DDL on project txzxabzwovsujtloxrus. Holds the zero-data-loss law, the cross-repo apply order (Supabase MCP → pnpm db-types/sync-types → aidream db/generate.py → both repos commit), the constants, and routes to the specific change skills. Read this and TOOLKIT.md first; the per-change skills assume it.
---

# DB Change — the transition SOP (read first)

Structural changes to **Matrx Main** (`txzxabzwovsujtloxrus`) during scheduled downtime. Apply DDL directly via the Supabase MCP — migration files are a convenience for the ledger, **not** a canonical system (a file changes nothing until applied + verified live). Execute end-to-end without stalling; over-chunking prolongs the outage.

**Before any change, read [`TOOLKIT.md`](./TOOLKIT.md)** (verified live signatures, registry shapes, constants, gotchas) and [`docs/db_rebuild/SCHEMA_MAP.md`](../../../docs/db_rebuild/SCHEMA_MAP.md) (what each schema is FOR — where a table belongs). TOOLKIT is the source of truth; the design doc `docs/db_rebuild/db-core-standards-and-automation.md` is aspirational and has drifted in places.

## Propose first — for multi-table, data-migrating, or consumer-facing changes
A change is rarely one table. Before executing anything risky (a cluster, a data migration, a schema move, a retire/drop), **do the homework and fill [`PROPOSAL_TEMPLATE.md`](./PROPOSAL_TEMPLATE.md)** — scope the whole cluster, quantify the repoint cost across both repos (+ extend/local) with the `db-table-refs` helpers, list the decisions with recommendations — save it to `docs/db_rebuild/proposals/<slug>.md`, and get a **`go`** before mutating. A single-column tweak or an obviously-safe additive step doesn't need one; anything that could lose data or break a production consumer does.

## THE LAW: zero data loss, always

1. **Never `DROP TABLE` (or `DROP COLUMN` with data) during the transition.** Retirement = `ALTER TABLE … SET SCHEMA graveyard` (reversible). Hard DROP is a separate, later, PITR-gated step.
2. **Additive-first, cut over, then retire.** Add new structure → backfill → dual-write/mirror if needed → repoint consumers → verify counts match → only then retire the old.
3. **Getting a table offline is reversible and is the first priority**; resolving every dependency is required but **must not block the move** — graveyard it, then finish the cleanup. (DROP is what's gated, not the schema move.)
4. **Verify live, not on faith.** After every DDL, `execute_sql` to confirm the object exists and `SELECT count(*)` to confirm no rows were lost. Compare pre/post counts.
5. **Loud recovery.** Any bridge/backfill/mirror you add must scream (RAISE / log) when it fires on data it shouldn't — a silent fallback hides the bug it's papering over.

## THE CUT — no silent shim (read twice; this is the #1 source of disasters)
When a table is MOVED or RETIRED, **the old name MUST stop working — abruptly.** AI agents do not reliably catch lingering references, so a "nice fallback" old table is how reads/writes silently split across two tables and burn a day to debug. **A clean cut + 15 minutes of repointing beats a silent shim every time.**

- **Default = make the old name vanish.** `SET SCHEMA workbench` / `SET SCHEMA graveyard` / rename — the data is preserved at the NEW location, but `public.<old>` no longer resolves, so every stale ref **errors loudly** (PostgREST 404 in the browser console = red; a raised exception in server logs = red). That IS the desired behavior.
- **NEVER leave a compat VIEW or a still-readable old table** that silently passes through. That is the forbidden shim. (Reconciles with Law #1: "data preserved, reversible" ≠ "old name still readable." Graveyard/move preserves data AND kills the old name.)
- **If a table genuinely can't move yet** (consumers can't all be cut in the window), do NOT leave it readable — install a **tripwire**: `select platform.deprecate_relation('public','<t>','<new.ref>','<reason>')` renames the data aside (zero loss) and replaces the old name with a view + INSTEAD-OF triggers that **RAISE on any read or write** with a message naming the new location (TOOLKIT.md §9). A shim that errors loudly is acceptable; one that silently works is not.
- **Light up the terminal RED until refs are gone.** Every move/retire MUST: (1) add the relation to **`scripts/dead-relations.json`** + `platform.deprecated_relations`, and (2) leave **`pnpm check:dead-relations`** green. It runs on pre-commit (loud) and `:strict` in CI — it scans for bare `.from("<old>")`, `public.<old>`, and `Database["public"][…]["<old>"]` and screams until every one is repointed. Add the manifest entry *before* repointing so the guard becomes your checklist. (aidream has the parallel `db/check_dead_relations.py`.)

## Pick the change (route here)

| Task | Skill |
|---|---|
| Take a table offline / retire it (no longer used) | **`db-graveyard-table`** |
| Relocate a table to another schema, references intact | **`db-move-table-schema`** |
| Bring a table/feature fully onto the platform standard (base cols, RLS, registry, satellites, versioning) | **`db-canonicalize-table`** |
| Drop / merge / modify-logic | inline below |

## Constants (full table in TOOLKIT.md §0)
- Project: **Matrx Main** · `project_id` **`txzxabzwovsujtloxrus`**.
- System org ("Matrx System"): **`39c38960-d30c-4840-b0c1-c9960de95582`** (ownerless-row fallback).
- **Exposed-schema trap:** `pnpm db-types` only pulls `public, context, files, workflow, workspace, app, skill, tool, agent, chat, ai, graveyard`. A FE-read table in any other schema needs its schema added to the `db-types` `--schema` list + PostgREST exposure, or the FE gets no types and 404s.

## Cross-repo finalize (run for EVERY change — TOOLKIT.md §8 has detail)

1. **DB** — `apply_migration` (idempotent), verify live, write `migrations/<name>.sql`, sha256 → insert `public._schema_migrations` (`source='matrx-frontend'`).
2. **Frontend** — `pnpm db-types`; update every usage; `pnpm sync-types`; fix all TS.
3. **aidream** — `python db/generate.py`; new schema → `db/matrx_orm.yaml` (`additional_schemas` + generate block); sub-package table → `aidream/package_integration.py`; `python db/detect_applied.py`; update usages; `python run.py` → clean boot.
4. **matrx-extend / matrx-local** — update if referenced; never block production.
5. **Commit + push `main`** on matrx-frontend and aidream.

## Inline playbooks

### Drop a table (hard removal — rare, gated)
Only after: graveyarded through the soak, `v_deprecated_table_access`/grep show **0** consumers in both repos, inbound FKs resolved, PITR/backup confirmed. Then `DROP TABLE graveyard.<t>`. Record it. If unsure whether something still reads it, you are not ready to drop — leave it in graveyard.

### Merge two tables into one
Additive pipeline: pick/confirm the survivor → add any missing columns to it → `INSERT … SELECT` the source rows (dedupe on the natural key; map ids and keep an id-map if other tables FK the source) → repoint inbound FKs + all code to the survivor → verify counts (survivor_after = survivor_before + migrated, 0 orphans) → **graveyard the source** (never drop yet). Document the key mapping and any dropped/coalesced columns.

### Modify logic (function / RPC / trigger / policy)
`CREATE OR REPLACE` (idempotent); keep the signature stable or you break callers — if the signature must change, add the new overload, repoint callers, then drop the old. RLS policy changes go through `iam.apply_rls` only (never hand-edit canonical policies). Re-verify dependent RPCs and run `iam.verify_canonical` if a canonical table's policies were touched. Regenerate types if a return shape changed.

### Anything else (split, partition, rename, backfill-only)
Same law: additive, verify counts, repoint, retire-not-destroy, finalize cross-repo, document what you did in the relevant `docs/db_rebuild/` tracker.

## Document as you go
Update `docs/db_rebuild/CHANGEOVER_PROGRESS.md` (and the matching `FEATURE.md` for a canonicalized feature) — what changed, counts, what's still open. A change that lives only in a chat log will be redone or broken by the next agent.
