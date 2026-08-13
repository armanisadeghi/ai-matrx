-- Kill the legacy applet / app-builder feature (Arman ruling, 2026-08-13).
--
-- Supersedes D25 ("applets gated, keep"). The whole builder + runner surface is
-- deleted from matrx-frontend in the same change; these three tables carry rows,
-- so they go to `graveyard` (never DROP) and their two feature-only RPCs drop.
--
-- Severing the two FKs into graveyard.compiled_recipe is a stated benefit: it
-- unblocks the eventual graveyard DROP sweep.
--
-- Idempotent. Public-schema triage Bucket C.

begin;

-- 1. Deregister the entity tokens BEFORE the move.
--    platform._enforce_entity_is_table errors when an ACTIVE entity_types row
--    ends up pointing at `graveyard`, so this must precede the SET SCHEMA.
delete from platform.entity_relationships
 where parent_type in ('applet', 'custom_app_config', 'custom_applet_config')
    or child_type  in ('applet', 'custom_app_config', 'custom_applet_config');

delete from platform.shareable_resource_registry
 where resource_type in ('applet', 'custom_app_config', 'custom_applet_config')
    or table_name    in ('applet', 'custom_app_configs', 'custom_applet_configs');

delete from platform.associations
 where source_type in ('applet', 'custom_app_config', 'custom_applet_config')
    or target_type in ('applet', 'custom_app_config', 'custom_applet_config');

delete from platform.association_types
 where source_type in ('applet', 'custom_app_config', 'custom_applet_config')
    or target_type in ('applet', 'custom_app_config', 'custom_applet_config');

delete from platform.entity_types
 where token in ('applet', 'custom_app_config', 'custom_applet_config');

-- 2. Sever the FKs into graveyard.compiled_recipe.
alter table if exists public.applet
  drop constraint if exists applet_compiled_recipe_id_fkey;
alter table if exists public.custom_applet_configs
  drop constraint if exists custom_applet_configs_compiled_recipe_id_fkey;

-- 3. Move to graveyard. Child (custom_applet_configs) first so the intra-family
--    FK to custom_app_configs never briefly spans a half-moved pair.
do $$
begin
  if to_regclass('public.custom_applet_configs') is not null then
    execute 'alter table public.custom_applet_configs set schema graveyard';
  end if;
  if to_regclass('public.custom_app_configs') is not null then
    execute 'alter table public.custom_app_configs set schema graveyard';
  end if;
  if to_regclass('public.applet') is not null then
    execute 'alter table public.applet set schema graveyard';
  end if;
end $$;

-- 4. Drop the two feature-only RPCs. Verified: nothing else in pg_proc
--    references them, and every frontend caller is deleted in this change.
drop function if exists public.fetch_app_and_applet_config(uuid, text);
drop function if exists public.get_custom_app_with_applets(uuid, text);

-- 5. Ledger.
insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
values
  ('public.applet', 'DELETED — no successor', 'graveyard.applet',
   'Legacy applet/app-builder feature killed 2026-08-13 (Arman); frontend builder+runner deleted. 6 rows preserved.'),
  ('public.custom_app_configs', 'DELETED — no successor', 'graveyard.custom_app_configs',
   'Legacy applet/app-builder feature killed 2026-08-13 (Arman); frontend builder+runner deleted. 46 rows preserved.'),
  ('public.custom_applet_configs', 'DELETED — no successor', 'graveyard.custom_applet_configs',
   'Legacy applet/app-builder feature killed 2026-08-13 (Arman); frontend builder+runner deleted. 130 rows preserved.')
on conflict (old_ref) do update
  set new_ref     = excluded.new_ref,
      archived_as = excluded.archived_as,
      reason      = excluded.reason;

commit;
