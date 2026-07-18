-- Data-only: per-kind instance-title override for wine_tasting + title backfill.
--
-- Context (kind-instance title derivation gap): instance titles derive from a
-- shared key list (FE features/content-ir/studio/instance-title.ts
-- INSTANCE_TITLE_KEYS = aidream kind_instance._TITLE_KEYS). wine_tasting's
-- natural title field is `wine_name` — not in the list — so every saved
-- instance showed "Untitled". The platform fix is the per-kind override
-- `kind_definition.metadata.title_key` (derivation: explicit → title_key →
-- shared list → null, mirrored in BOTH repos); this migration sets it for the
-- live wine_tasting kind and backfills titles on existing instances.
--
-- NOTE: the kind_definition UPDATE bumps `version` via platform._touch_row
-- (metadata-only change, schema unchanged) — run `pnpm shape:revalidate
-- --apply` afterwards to re-bind the canonical example to the new version.
-- Saved instances stay pinned to their old kind_version (fine by design).
-- Idempotent: both statements no-op on re-run.

update content_ir.kind_definition
   set metadata = coalesce(metadata, '{}'::jsonb)
                  || jsonb_build_object('title_key', 'wine_name')
 where kind = 'wine_tasting'
   and deleted_at is null
   and coalesce(metadata ->> 'title_key', '') <> 'wine_name';

update content_ir.kind_instance i
   set title = nullif(btrim(i.data ->> 'wine_name'), '')
  from content_ir.kind_definition kd
 where kd.id = i.kind_definition_id
   and kd.kind = 'wine_tasting'
   and i.title is null
   and nullif(btrim(i.data ->> 'wine_name'), '') is not null;
