-- Surface readiness tracking + overlay identity (2026-07-24).
--
-- `readiness` mirrors SurfaceManifest.readiness (verified | partial | stub) —
-- the campaign tracker for "which surfaces are verified correct and complete".
-- NULL means the surface has no manifest at all (unregistered).
-- `overlay_id` ties an overlay/window surface to its window-panels overlay id
-- (the overlay twin of url_pattern).
--
-- Idempotent. Applied via Supabase MCP; ledgered in public._schema_migrations.

alter table ui.ui_surface
  add column if not exists readiness text,
  add column if not exists readiness_note text,
  add column if not exists overlay_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ui_surface_readiness_check'
      and conrelid = 'ui.ui_surface'::regclass
  ) then
    alter table ui.ui_surface
      add constraint ui_surface_readiness_check
      check (readiness is null or readiness in ('verified','partial','stub'));
  end if;
end $$;

comment on column ui.ui_surface.readiness is
  'Campaign tracking mirrored from SurfaceManifest.readiness: verified | partial | stub. NULL = no manifest (unregistered).';
comment on column ui.ui_surface.overlay_id is
  'For overlay/window surfaces: the window-panels overlay id this surface belongs to (overlay twin of url_pattern).';
