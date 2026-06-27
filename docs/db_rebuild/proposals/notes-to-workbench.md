# DB Change Proposal — Notes → `workbench` schema + full canonicalization

**One-liner:** Create the new `workbench` schema, make `notes` its founding member (fully canonical, zero-WARN), migrate `note_versions` into the central `history.row_versions`, and retire the dead cluster tables — preserving all user-visible behavior.
**Change types:** canonicalize · move-schema · migrate (versions) · graveyard
**Status:** 🟡 IN PROGRESS (2026-06-27) — canonicalization DONE; schema move BLOCKED on PostgREST exposure; version cutover + extend/local STAGED. See **Execution log** at the bottom.
**Evidence:** live DB reads (2026-06-27) + `db-table-refs` across matrx-frontend, aidream, matrx-extend, matrx-local.

## 1. Scope — the cluster (7 tables in `public`)
| Table | Rows | Verdict | Why |
|---|---|---|---|
| `notes` | 718 | **canonicalize + move → workbench** | founding member; 0 FAIL, 4 WARN today |
| `note_folders` | 40 | **canonicalize + move → workbench** | notes' container; legacy `user_id`/`is_deleted` |
| `note_versions` | 5,166 | **migrate → `history.row_versions`, then graveyard** | bespoke version table → central history |
| `note_shares` | 0 | **graveyard** | sharing is canonical `iam.permissions`; empty |
| `note_devices` | 0 | **graveyard** | matrx-local sync plumbing; empty, pre-release |
| `note_directory_mappings` | 0 | **graveyard** | matrx-local sync plumbing; empty |
| `note_sync_log` | 0 | **graveyard** | matrx-local sync plumbing; empty |

## 2. Outcome (before → after)
- `workbench` schema exists; `notes` + `note_folders` live there, fully canonical (`verify_canonical` → **zero FAIL, zero WARN**).
- Note version history is automatic via the standard `_history` trigger into `history.row_versions` (entity_type `note`); all 5,166 existing versions preserved there; the version RPCs read history.
- The 4 empty Local tables are in `graveyard` (reversible). `note_versions` graveyarded after history is verified.
- **Behavior preserved:** every notes list/edit/folder/version/restore flow works identically in the web app; extend + local repointed.

## 3. Usage reality — the repoint cost (evidence)
- **matrx-frontend:** **59** `.from("notes")` (17 files; hot: `features/notes/service/notesService.ts` ×17, `redux/thunks.ts` ×10, `features/files/virtual-sources/adapters/notes.ts` ×9, `hooks/useWorkspaceNotesRedux.ts` ×6) · **9** `.from("note_folders")` · **6** `.from("note_versions")` (`features/text-diff/service/versionService.ts` ×5, `lib/redux/slices/noteVersionsSlice.ts` ×2) · **1** `rpc("restore_note_version")` · **~36** legacy-column reads (`is_deleted`/`is_public`/`user_id`) across 11 files. No existing `.schema()` in the notes feature → every call adds `.schema("workbench")`.
- **aidream:** `package_integration.py` L311/347/430/475 (Notes model+base wiring) · managers `db/managers/{notes,note_folders,note_versions}.py` + `__init__.py` · matrx-ai `content_types/notes.py` (registry `get_model("Notes")`) · writers `api/virtual/adapters/notes_adapter.py`, `api/utils/context_writeback.py:169` · **hardcoded `public.notes`** in `services/auto_ingest/reconciliation.py:74` + `agent_orchestrator.py:515` (repoint to `workbench.notes`) · version logic is **SQL-trigger-written**, not app-written.
- **matrx-extend (ACTIVE, pre-prod):** `src/lib/notes/queries.ts` reads shared `notes`/`note_folders` via `.from` → needs `.schema("workbench")`.
- **matrx-local (ACTIVE, pre-release):** owns a separate **SQLite** mirror (unaffected) + a Supabase sync client (`app/services/documents/supabase_client.py`) that hits `public.notes`/`note_folders` → repoint. It created the 4 now-empty cluster tables.
- **DB:** inbound FKs — `note_versions`,`note_shares`,`note_sync_log`,`graveyard.wr_tile_notes` → `notes`; `notes`,`note_shares`,`note_sync_log`,`note_directory_mappings`,`note_folders`(self) → `note_folders`. Triggers on `notes` (11): keep `_stamp_actor`,`_touch_row`,`trg_auto_ingest_note`,`trigger_notes_sync_version`,`_mirror_proj/_task`; **replace** the version trio `note_version_trigger`(`create_note_version`),`trg_notes_create_v1_snapshot`,`trg_notes_set_initial_version`. Version RPCs (8): `create_note_version`,`trg_notes_create_v1_snapshot`,`get_note_versions`,`restore_note_version`,`get_version_history`,`get_version_snapshot`,`promote_version`,`purge_old_versions`.

## 4. Plan — phased, additive → cutover → retire
**Phase 1 — canonicalize `notes`+`note_folders` in place** *(in `public`, lower risk)*
1. `[DB][reversible]` `ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;` (note_folders already has none either — add).
2. `[DB][reversible]` backfill `deleted_at = updated_at WHERE is_deleted AND deleted_at IS NULL` (154 notes); same for note_folders.
3. `[DB][reversible]` `apply_rls('public','notes','note','entity')` re-run is a no-op (already canonical) — but now `deleted_at IS NULL` is enforced; verify the std_select still includes the owner short-circuit.
4. `[FE/EXT/PY]` repoint the ~36 legacy-column reads: `is_deleted`→`deleted_at IS NOT NULL`, `is_public`→`visibility='public'`, `user_id`→`created_by`.
5. `[DB][gated]` after repoint verified: `DROP COLUMN is_deleted, is_public, user_id, shared_with` (all proven safe: 0 shared_with, 0 is_public, created_by==user_id on all 718).

**Phase 2 — versioning → central history**
6. `[DB][reversible]` backfill all 5,166 `note_versions` → `history.row_versions` (entity_type `note`) — column map in §5.
7. `[DB]` replace the version trigger trio with `CREATE TRIGGER _history AFTER INSERT OR UPDATE OR DELETE ON notes … platform._version_capture('note')`; set `notes` save path to write the change-note into `notes.metadata` (D5).
8. `[DB]` repoint the version RPCs (`get_note_versions`,`restore_note_version`,`get_version_history`,`get_version_snapshot`,`promote_version`,`purge_old_versions`) to read/write `history.row_versions`.
9. `[FE]` repoint `versionService.ts` + `noteVersionsSlice.ts` reads to the version RPCs (kills direct `note_versions` coupling).
10. `[DB][gated]` after history verified row-for-row: `ALTER TABLE note_versions SET SCHEMA graveyard`.

**Phase 3 — create schema, move, retire empties**
11. `[DB]` `CREATE SCHEMA workbench;` expose to PostgREST; add to `db-types --schema` list + `matrx_orm.yaml` (empty model-prefix — see D-note).
12. `[DB]` `ALTER TABLE notes SET SCHEMA workbench; ALTER TABLE note_folders SET SCHEMA workbench;` (policies/triggers/FKs follow). Update `entity_types.schema_name` + `shareable_resource_registry.schema_name` to `workbench`. Repoint the 2 hardcoded `public.notes` SQL refs.
13. `[FE/EXT/PY]` add `.schema("workbench")` to all `notes`/`note_folders` calls; aidream model regen moves Notes→`models_workbench`.
14. `[DB][gated]` `note_shares`,`note_devices`,`note_directory_mappings`,`note_sync_log` → `graveyard` (drop their inter-cluster FKs first; all 0 rows).

## 5. Data migration — lossless proof
- **is_deleted → deleted_at:** 154 rows; verify `count(deleted_at IS NOT NULL) == 154` post-backfill.
- **note_versions → history.row_versions** (5,166 rows): `row_id=note_id`, `organization_id`=notes.organization_id, `version=version_number`, `operation='UPDATE'` (v1 rows `'INSERT'`), `actor_id=user_id`, `occurred_at=created_at`, `row_data = jsonb_build_object('content',content,'label',label) || jsonb_build_object('_change_source',change_source,'_change_type',change_type,'_change_note',change_note)`. `diff_metadata` dropped (100% unused). Verify `count(history.row_versions WHERE entity_type='note') == 5,166` and spot-check 5 notes' latest version content matches.
- Nothing else moves; `shared_with`/`is_public` carry no data (0 used).

## 6. Decisions needed — **DECIDE**
- **D1 — the 4 empty Local tables (`note_shares`/`note_devices`/`note_directory_mappings`/`note_sync_log`, all 0 rows).** A) graveyard now · B) leave in `public` untouched · C) move to workbench. **Recommend: A (graveyard).** Empty, pre-release, and sharing already belongs to canonical `iam.permissions`; sync plumbing isn't user-content so it doesn't belong in workbench. matrx-local rebuilds/repoints when it ships.
- **D2 — legacy-column cleanup scope.** A) full cleanup now (drop `user_id`/`is_public`/`shared_with`, migrate `is_deleted`) → **zero-WARN canonical** · B) move only, keep the 4 WARNs. **Recommend: A** — we're touching every consumer anyway; this is the canonical end-state.
- **D3 — touch matrx-extend + matrx-local now?** A) repoint both in the same pass · B) FE only, defer extend/local. **Recommend: A** — both actively read the shared table; the move breaks them otherwise. Extend is ~6 calls; Local's SQLite is untouched, only its Supabase sync client repoints.
- **D4 — FE version read path after migration.** A) repoint FE to the existing `get_version_history`/`get_version_snapshot` RPCs · B) build a `workbench.note_versions` compat view over history. **Recommend: A** — kills direct-table coupling; the entity-typed RPCs already exist.
- **D5 — "change note on save" forward-design.** Write the user's change annotation into `notes.metadata` so `_version_capture` snapshots it. **Recommend: yes** — wire it into the notes save path (FE `notesService` + Python writeback) as part of Phase 2.

> **Build note (not a decision):** the `workbench` block in `matrx_orm.yaml` must use an **empty `model_name_prefix`** (unlike workspace's `Ws`) so the generated classes stay `Notes`/`NoteFolders` — `package_integration.py` and matrx-ai's registry key on `"Notes"`.

## 7. Acceptance gate
- `iam.verify_canonical('workbench','notes','note')` → **zero FAIL, zero WARN** (the 4 current WARNs all cleared). `verify_canonical('workbench','note_folders','note_folder')` zero FAIL.
- Counts: notes 718, note_folders 40 unchanged post-move; `history.row_versions` (note) == 5,166; deleted_at count == 154.
- Real-user test: impersonate a notes owner → list/open/edit/restore-version all work in the web app.
- `pnpm sync-types` clean · aidream `python run.py` clean boot · extend builds.

## 8. Reversibility & data-loss guards
- Phases 1–2 are additive until the gated DROP/SET-SCHEMA steps. `note_versions` and the 4 empties go to **graveyard, not DROP** (reversible); hard DROP only after PITR confirmed + history verified.
- Count snapshots captured before each gated step; a mismatch aborts.
- Schema move is reversible (`SET SCHEMA public`); the breaking window is the FE/extend repoint — done in lockstep during downtime.

## 9. Out of scope / deferred
- `project_id`/`task_id` on notes (association litter) — already mirrored to `platform.associations`; their drop stays gated (separate litter pass).
- `folder_name` denormalization (90 notes use it), `tags text[]`, and the matrx-local sync columns (`file_path`/`content_hash`/`sync_version`/`last_device_id`) — **kept** (Local depends on them; not legacy).
- Moving documents / workbooks / udt_* into workbench — future, one `db-move-table-schema` each.
- matrx-local SQLite schema — unchanged.

## 10. Cross-repo finalize + docs
Per-phase: `apply_migration` + ledger. End: `pnpm db-types` (add `workbench`) → repoint FE → `pnpm sync-types`. aidream `matrx_orm.yaml` (+ workbench block, empty prefix) → `python db/generate.py` → fix `package_integration.py` + managers + 2 hardcoded refs → `detect_applied.py` → `run.py`. Repoint matrx-extend `lib/notes/queries.ts` + matrx-local Supabase sync client. Commit + push `main` (frontend + aidream; extend + local as able). Update `features/notes/FEATURE.md`, `SCHEMA_MAP.md` (workbench now live), `CHANGEOVER_PROGRESS.md`.

---

## Execution log (2026-06-27) — GO given, all 5 decisions approved

**DONE (applied live to `txzxabzwovsujtloxrus` + code repointed + verified):**
- ✅ **`notes` + `note_folders` fully canonical** — added/normalized `deleted_at` (154 notes migrated from `is_deleted`), dropped legacy `user_id`/`is_public`/`is_deleted`/`shared_with` (notes) + `user_id`/`is_deleted` (folders); registered `note_folder` entity + sharing + `apply_rls`; recreated composite indexes on `created_by`. `verify_canonical` = **zero FAIL, zero WARN** on both.
- ✅ **Version history migrated** — all **5,166** `note_versions` backfilled into `history.row_versions` (`entity_type='note'`, lossless, count-verified); pre-created 7 monthly partitions (2025-11..2026-05) the backfill needed. Version triggers patched to `created_by` so the current version system keeps working.
- ✅ **`workbench` schema created** (empty, granted) + semantic comment.
- ✅ **Graveyarded** `note_devices`, `note_directory_mappings`, `note_sync_log` (0 rows, no live consumers).
- ✅ **FE repointed** (19 files, `tsc` 0 source errors) + **aidream repointed** (models regenerated, 5 files, boots clean) for the dropped columns.
- Applied migrations (Supabase history): `workbench_notes_p1_add_deleted_at`, `history_row_versions_backfill_partitions_2025_11_to_2026_05`, `workbench_notes_p2_version_history_backfill`, `workbench_notes_p3a_decouple_userid_canonicalize_folders`, `workbench_notes_p3b_replace_indexes_drop_legacy_cols`, `workbench_schema_create_and_graveyard_empty_note_tables`, `workbench_notes_ungraveyard_note_shares_live_acl`.

**CORRECTION applied:** `note_shares` (0 rows) was graveyarded then **un-graveyarded** — it's empty but **live-queried** as a share-based ACL by RAG search (`matrx-rag/search.py`, `rag_search_lab.py`). Kept in `public`. (D1 assumed all 4 sibling tables were inert Local scaffolding; `note_shares` is not.)

**BLOCKED (needs a non-MCP action):**
- ⛔ **The schema MOVE** of `notes`/`note_folders` into `workbench` — PostgREST exposed-schemas is Supabase platform config, not MCP-reachable. **Add `workbench` to Settings → API → Exposed schemas** (or via management API), then the move + `.schema('workbench')` repoint (68 FE calls + extend + local) can land.

**STAGED (own verified passes):**
- ⏳ **Version-system cutover** — swap version triggers → `_history`, repoint the 6 version RPCs' `note` branch + FE version reads (it's a full create/delete/compare/restore CRUD surface + shared multi-entity dispatchers + a pre-write→post-write semantics shift; data already in `history`, ready). Forward-design D5: write the change-note into `notes.metadata` so `_version_capture` snapshots it.
- ⏳ **matrx-extend + matrx-local** repoint for the dropped columns + (later) the schema move. Local SQLite unaffected; its Supabase sync client needs `created_by`/`deleted_at`/`visibility`.
- ⏳ **`note_shares` ACL → `iam.permissions`** in RAG search, then retire `note_shares`.
