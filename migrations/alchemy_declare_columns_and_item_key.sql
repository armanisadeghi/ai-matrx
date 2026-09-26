-- draft: alchemy-chair ALC-14 — prepared, NOT applied; the chair rehearses on the clone and applies in the 1–4 AM PT window
-- Matrx Alchemy ALC-14 — Declare columns + re-key STEP 1 of 3 (CONTRACT §2.7, chair rulings N4/N5).
--
-- Additive only. Every new column has a default, so every live emitter keeps working
-- unchanged. Builds, PLAINLY (not CONCURRENTLY — chair ruling: 5,225 value rows and 449
-- write-target rows, live count 2026-09-25/26, so each build takes moments inside this
-- transaction), for BOTH ui_surface_value and ui_surface_write_target:
--   * the new key   (surface_name, item_type, name)  — the package emitter's ON CONFLICT target
--   * the old-key twin (surface_name, name)          — keeps every OLD emitter's
--     ON CONFLICT (surface_name, name) matched after step 2 swaps the primary key.
-- While every row has item_type = '' the two keys are equivalent; NO item type may be
-- declared until step 3 has dropped the twin.
--
-- Also: the item-type table (canonical provisioning path), ui_surface.content_hash, and the
-- widened mode / apply_policy checks ('stream', 'queued').
--
-- REHEARSAL PLAN (the chair runs it; nothing here applies itself — the draft line holds it):
--   1. pnpm db:rehearse migrations/alchemy_declare_columns_and_item_key.sql --target clone
--      (up → inverse → up; read the per-statement pg_locks sample: expect ACCESS EXCLUSIVE on
--       ui_surface_value / ui_surface_write_target / ui_surface_client_tool / ui_surface only,
--       each held for milliseconds).
--   2. On the clone: run the package emitter's plan with schema.itemType = true against the
--      new key and confirm 0 row changes (only updated_at), then the old emitter
--      (scripts/emit-surface-sync-sql.ts output) against the twin: also 0 changes.
--   3. Remove the draft line, apply in the 1–4 AM PT window:
--      pnpm db:apply migrations/alchemy_declare_columns_and_item_key.sql
--   4. pnpm db-types; flip SYNC_SCHEMA.itemType/valueContract/contentHash in
--      features/surfaces/services/surface-sync-schema.ts.
-- Inverse: migrations/inverse/alchemy_declare_columns_and_item_key_down.sql

-- ── ui_surface_value: sensitivity, kind, live slot, role, item scope ───────────
alter table ui.ui_surface_value
  add column if not exists exportable boolean not null default true,
  add column if not exists classification text not null default 'ordinary',
  add column if not exists included_by_default boolean not null default true,
  add column if not exists kind_key text,
  add column if not exists live_slot text,
  add column if not exists role text not null default 'data',
  add column if not exists item_type text not null default '';

alter table ui.ui_surface_value
  drop constraint if exists ui_surface_value_classification_check,
  add constraint ui_surface_value_classification_check
    check (classification in ('ordinary', 'secret', 'credential')),
  drop constraint if exists ui_surface_value_live_slot_check,
  add constraint ui_surface_value_live_slot_check
    check (live_slot is null or live_slot in ('selection', 'on-demand', 'errors', 'requests')),
  drop constraint if exists ui_surface_value_role_check,
  add constraint ui_surface_value_role_check check (role in ('data', 'request')),
  drop constraint if exists ui_surface_value_item_type_chk,
  add constraint ui_surface_value_item_type_chk
    check (item_type = '' or item_type ~ '^[a-z][a-z0-9_]*$');

comment on column ui.ui_surface_value.exportable is
  'false = never leaves through Alchemy (projection enforces it before preview, formats, AI, actions, destinations).';
comment on column ui.ui_surface_value.classification is
  'secret / credential values are always excluded from every Alchemy format and from agent context.';
comment on column ui.ui_surface_value.included_by_default is
  'Pre-checked in the preparation workspace. A default, not an authorization boundary.';
comment on column ui.ui_surface_value.item_type is
  ''''' = a screen-level value; otherwise the ui_surface_item_type this value belongs to (checked by the declaration checks).';

-- ── ui_surface_write_target: patch/approval/stream/destination, item scope ─────
alter table ui.ui_surface_write_target
  add column if not exists patchable boolean not null default false,
  add column if not exists approval_comparison text,
  add column if not exists stream_ops text[],
  add column if not exists destination boolean not null default false,
  add column if not exists item_type text not null default '';

alter table ui.ui_surface_write_target
  drop constraint if exists ui_surface_write_target_mode_check,
  add constraint ui_surface_write_target_mode_check
    check (mode in ('draft', 'entity', 'ui', 'stream')),
  drop constraint if exists ui_surface_write_target_apply_policy_check,
  add constraint ui_surface_write_target_apply_policy_check
    check (apply_policy in ('manual', 'ask', 'auto', 'queued')),
  drop constraint if exists ui_surface_write_target_approval_comparison_check,
  add constraint ui_surface_write_target_approval_comparison_check
    check (approval_comparison is null or approval_comparison in ('text-replacement')),
  drop constraint if exists ui_surface_write_target_stream_ops_check,
  add constraint ui_surface_write_target_stream_ops_check
    check (
      (mode = 'stream' and stream_ops is not null and cardinality(stream_ops) > 0
        and stream_ops <@ array['replace', 'insert_before', 'insert_after', 'prepend', 'append', 'patch']::text[])
      or (mode <> 'stream' and stream_ops is null)
    ),
  drop constraint if exists ui_surface_write_target_item_type_chk,
  add constraint ui_surface_write_target_item_type_chk
    check (item_type = '' or item_type ~ '^[a-z][a-z0-9_]*$');

-- ── ui_surface_client_tool mirrors write-target mode ───────────────────────────
alter table ui.ui_surface_client_tool
  drop constraint if exists ui_surface_client_tool_mode_check,
  add constraint ui_surface_client_tool_mode_check
    check (mode in ('draft', 'entity', 'ui', 'stream'));

-- ── ui_surface: the declaration hash of the last sync ──────────────────────────
alter table ui.ui_surface add column if not exists content_hash text;
comment on column ui.ui_surface.content_hash is
  'declarationHash (@ai-matrx/alchemy/declare) of the declaration last synced; null until the first sync after ALC-14.';

-- ── Re-key step 1: new key + old-key twin, built plainly ───────────────────────
create unique index if not exists ui_surface_value_item_key
  on ui.ui_surface_value (surface_name, item_type, name);
create unique index if not exists ui_surface_value_screen_key_twin
  on ui.ui_surface_value (surface_name, name);
create unique index if not exists ui_surface_write_target_item_key
  on ui.ui_surface_write_target (surface_name, item_type, name);
create unique index if not exists ui_surface_write_target_screen_key_twin
  on ui.ui_surface_write_target (surface_name, name);

-- ── ui_surface_item_type: one kind of thing inside a screen ────────────────────
-- Canonical provisioning (id primary key, organization_id, visibility, version,
-- metadata, created_*/updated_*, the trigger trio, RLS). The (surface_name, name)
-- key the sync upserts on is a unique index, since canonical tables key on id.
do $$
begin
  if to_regclass('ui.ui_surface_item_type') is null then
    perform platform.create_entity_table(
      p_schema => 'ui', p_table => 'ui_surface_item_type',
      p_token => 'ui_surface_item_type', p_label => 'UI surface item type',
      p_fields => array[
        'surface_name text NOT NULL REFERENCES ui.ui_surface(name) ON UPDATE CASCADE ON DELETE CASCADE',
        $f$name text NOT NULL CHECK (name ~ '^[a-z][a-z0-9_]*$')$f$,
        $f$label text NOT NULL$f$,
        $f$description text NOT NULL DEFAULT ''$f$,
        $f$identity text[] NOT NULL$f$,
        'levels text[]',
        'entity_type text',
        'sort_order integer NOT NULL DEFAULT 0',
        'synced_by uuid',
        'synced_from text'
      ],
      p_variant => 'system', p_versioned => false, p_soft_delete => false,
      p_visibility => 'public', p_category => false, p_listed => false,
      p_org_default => false, p_gin_jsonb => false);
  end if;
end $$;

create unique index if not exists ui_surface_item_type_key
  on ui.ui_surface_item_type (surface_name, name);
