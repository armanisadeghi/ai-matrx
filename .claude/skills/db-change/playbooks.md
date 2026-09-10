# DB Change — playbooks for changes without their own skill

## Drop a table (hard removal — rare, gated)
Only after: graveyarded through the soak, `v_deprecated_table_access`/grep show **0** consumers in both repos, inbound FKs resolved, PITR/backup confirmed. Then `DROP TABLE graveyard.<t>`. Record it. If unsure whether something still reads it, you are not ready to drop — leave it in graveyard.

## Merge two tables into one
Additive pipeline: pick/confirm the survivor → add any missing columns to it → `INSERT … SELECT` the source rows (dedupe on the natural key; map ids and keep an id-map if other tables FK the source) → repoint inbound FKs + all code to the survivor → verify counts (survivor_after = survivor_before + migrated, 0 orphans) → **graveyard the source** (never drop yet). Document the key mapping and any dropped/coalesced columns.

## Modify logic (function / RPC / trigger / policy)
`CREATE OR REPLACE` (idempotent); keep the signature stable or you break callers — if the signature must change, add the new overload, repoint callers, then drop the old. RLS policy changes go through `iam.apply_rls` only (never hand-edit canonical policies). Re-verify dependent RPCs and run `iam.verify_canonical` if a canonical table's policies were touched. Regenerate types if a return shape changed.

## Find stragglers (tables left behind when their batch moved)
Run [`STRAGGLER_DETECTOR.sql`](./STRAGGLER_DETECTOR.sql) via `execute_sql` — four detectors: (A) same name in `public` + a domain schema, (B) legacy-prefix tables still in `public`, (C) empty canonical table whose live old sibling holds the data (the `org_module` pattern), (D) leftover compat VIEWS in `public` over a moved schema. **A–C scan tables only — always run D**; the #1 shim is a view. **A hit is a candidate, not a verdict** — characterize (rows, inbound FKs, function refs via `pg_get_functiondef ~* name`, code grep) before acting; a name collision can be 3 legitimately-distinct tables (e.g. `public.category` vs `app.category` vs `skill.category`). The detectors MISS renamed moves (`org_module_settings`→`org_module_config`, different base names) — those still need a manual domain audit.

## Anything else (split, partition, rename, backfill-only)
Same law: additive, verify counts, repoint, retire-not-destroy, finalize cross-repo, document what you did in the [DB changeover board](../../../../common-docs/operations/db-changeover-board.md) Done log (+ the feature's `FEATURE.md`).
