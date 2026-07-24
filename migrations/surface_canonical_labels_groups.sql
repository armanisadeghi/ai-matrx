-- Surface Values System — canonical labels + value groups (2026-07-24).
--
-- THE NAMING LAW: every surface and every surface value has exactly one
-- canonical human label, declared code-first in the manifest and mirrored
-- here by manifest sync. `ui_surface.label` is that mirror (nullable — only
-- manifest-less DB surfaces stay NULL and fall back to slug formatting).
--
-- Groups: `ui_surface.value_groups` holds the surface's ordered canonical
-- group list (JSONB array of {key,label,sortOrder,description?});
-- `ui_surface_value.group_key` assigns each value to one group. Reserved
-- keys encode provenance for DB consumers: 'baseline', 'inherited:<parent>',
-- default 'general'.
--
-- Idempotent. Applied via Supabase MCP; ledgered in public._schema_migrations.

alter table ui.ui_surface
  add column if not exists label text,
  add column if not exists value_groups jsonb not null default '[]'::jsonb;

alter table ui.ui_surface_value
  add column if not exists group_key text not null default 'general';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ui_surface_value_group_key_check'
      and conrelid = 'ui.ui_surface_value'::regclass
  ) then
    alter table ui.ui_surface_value
      add constraint ui_surface_value_group_key_check
      check (group_key ~ '^[a-z][a-z0-9_:./-]*$');
  end if;
end $$;

comment on column ui.ui_surface.label is
  'Canonical display label, mirrored from SurfaceManifest.label by manifest sync. NULL only for manifest-less surfaces.';
comment on column ui.ui_surface.value_groups is
  'Ordered canonical value groups: [{key,label,sortOrder,description?}]. Mirrored from the resolved manifest.';
comment on column ui.ui_surface_value.group_key is
  'Canonical group for this value. Reserved: general, baseline, inherited:<parent>.';
