-- THE INVERSE of migrations/campaign/navfix_one_switch_per_organization.sql.
--
-- It puts the member-readable store door back where it was found: gone, with
-- no registry row and no grant, and the campaign's code knob overridable per
-- person again. Run it only to undo that file; the pages and the sidebar stop
-- being able to answer "does my organization keep its data here?" the moment it
-- runs, so the code that reads the door has to go back with it.

set lock_timeout = '2s';
set statement_timeout = '600s';

revoke execute on function platform.unified_data_store_on(uuid) from authenticated;
do $r$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke execute on function platform.unified_data_store_on(uuid) from service_role';
  end if;
end
$r$;

delete from platform.client_callable_door
 where schema_name = 'platform'
   and function_name = 'unified_data_store_on'
   and identity_argtypes = array['uuid'::regtype::oid];

drop function if exists platform.unified_data_store_on(uuid);

update platform.feature_knob
   set overridable_by = '{user}'::text[],
       description = 'The CODE half of the OFF switch, read by matrx-frontend and by aidream. The campaign''s database changes land behind per-object guards, but its code ships to production continuously — any other lane''s release commit builds the whole pushed range, and the aidream train ships main every 20-30 minutes. Every campaign code path is inert while this is false.',
       basis = 'Unified data campaign, 2026-09-16: pushed campaign code must be harmless.',
       updated_at = now()
 where feature = 'custom'
   and key = 'code_paths_enabled';
