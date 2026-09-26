-- draft: alchemy-chair ALC-14 re-key STEP 3 — apply ONLY when the emitter census is clean (no deployed code upserts on (surface_name, name)); 1–4 AM PT
-- Matrx Alchemy ALC-14 — re-key STEP 3 of 3: drop the old-key twin (CONTRACT §2.7, ruling N4, R24).
--
-- Precondition (the emitter census, R24): no deployed code upserts ON CONFLICT (surface_name, name)
-- or onConflict "surface_name,name" into ui_surface_value / ui_surface_write_target — not
-- scripts/emit-surface-sync-sql.ts, not features/surfaces/services/manifest-sync.service.ts, not
-- any copy in another repo or cloud checkout — AND the package emitter runs with
-- SYNC_SCHEMA.itemType = true. Census command (both repos, all checkouts):
--   rg -n "surface_name, ?name\)|\"surface_name,name\"" --glob '!migrations/**' --glob '!**/node_modules/**'
-- Only after this file may the first item type be declared: the twin would reject an item value
-- that shares a screen value's name.
-- Inverse: migrations/inverse/alc14_3_ui_surface_rekey_drop_twin_down.sql
drop index if exists ui.ui_surface_value_screen_key_twin;
drop index if exists ui.ui_surface_write_target_screen_key_twin;
