-- draft: alchemy-chair ALC-14 re-key STEP 2 — apply only after step 1 is live and rehearsed; 1–4 AM PT window
-- Matrx Alchemy ALC-14 — re-key STEP 2 of 3: swap the primary keys (CONTRACT §2.7, ruling N4).
--
-- Precondition: migrations/alc14_1_ui_surface_declare_columns.sql is applied (the new key index
-- and the old-key twin exist). One transaction; no index build: each primary key is re-created
-- USING the step-1 index. Brief ACCESS EXCLUSIVE on both tables — the D6 readers
-- (aidream surface_resolver / tool_merge / surface_context) read them on every tool resolution,
-- hence the window. Any old emitter still upserting ON CONFLICT (surface_name, name) keeps
-- matching the step-1 twin index. No foreign key references either primary key
-- (pg_constraint, 2026-09-25), so nothing else moves.
--
-- REHEARSAL: pnpm db:rehearse migrations/alc14_2_ui_surface_rekey_swap_primary_key.sql --target clone
-- then confirm: \d ui.ui_surface_value shows PRIMARY KEY (surface_name, item_type, name) and the
-- twin still UNIQUE (surface_name, name); an old-emitter upsert and a package-emitter upsert both succeed.
-- Inverse: migrations/inverse/alc14_2_ui_surface_rekey_swap_primary_key_down.sql
alter table ui.ui_surface_value
  drop constraint ui_surface_value_pkey,
  add constraint ui_surface_value_pkey primary key using index ui_surface_value_item_key;

alter table ui.ui_surface_write_target
  drop constraint ui_surface_write_target_pkey,
  add constraint ui_surface_write_target_pkey primary key using index ui_surface_write_target_item_key;
