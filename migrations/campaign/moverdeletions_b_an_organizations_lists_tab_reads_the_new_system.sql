-- chair-step: lane MOVER-DELETIONS (chair brief 2026-09-26, tail 2 of LISTS-AFTER-SWITCH). ADDS custom.organization_pick_lists(uuid), the client door an organization's Lists tab and its count read: the organization's pick lists that live in the new system (a Table of choices the Data tables switch moved, or a list born there) that the signed-in person may open. Before it the tab read only the older list table, so after a switch every list vanished from it (its older row archived) and a list born in the new system never appeared. No row of any table is written. No lock beyond one function definition.
-- lane: MOVER-DELETIONS
-- INVERSE: migrations/inverse/moverdeletions_b_an_organizations_lists_tab_reads_the_new_system_down.sql
--
-- WHO SEES WHAT. The store's own visibility answer (custom.query_visible_ids, the one
-- custom.table_list_everywhere uses for /data), after the organization wall
-- (custom.assert_client_may_reach). Access is personal: the list is shown to a person the store
-- lets open it, whatever organization is active. A list whose older row is still live is the older
-- list (platform.list_lives_in says 'older') and the tab already reads it there, so it is not
-- listed twice.

create or replace function custom.organization_pick_lists(p_organization_id uuid)
 returns table (id uuid, list_name text, description text, updated_at timestamptz, lives_in text)
 language plpgsql
 stable
 security definer
 set search_path to 'pg_catalog'
as $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.organization_pick_lists');
  return query
    select t.id, coalesce(nullif(t.data ->> 'name', ''), 'List'), t.data ->> 'description', t.updated_at, 'record'::text
      from custom.record t
      join (select v from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v) vis on vis.v = t.id
     where t.organization_id = p_organization_id
       and t.table_id = custom.table_kernel_id()
       and t.data_class = 'table'
       and t.deleted_at is null
       and platform._is_store_pick_list(t.metadata)
       and platform.list_lives_in(t.id) = 'record'
     order by 2, 1;
end;
$function$;

comment on function custom.organization_pick_lists(uuid) is
  'MOVER-DELETIONS: an organization''s pick lists that live in the new system (moved by the Data tables switch or born there) that the caller may open — the organization''s Lists tab and its count read these beside the live older lists.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers, anonymous_callers)
select 'custom', 'organization_pick_lists', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/moverdeletions_b_an_organizations_lists_tab_reads_the_new_system.sql (lane MOVER-DELETIONS)',
       'The organization wall first (custom.assert_client_may_reach), then only Tables of choices the store''s own visibility lets the caller open (custom.query_visible_ids, as custom.table_list_everywhere); it answers each list''s id, name, description and last change, and names nothing the caller could not already open on /data.',
       true, false
  from pg_proc p where p.oid = 'custom.organization_pick_lists(uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

grant execute on function custom.organization_pick_lists(uuid) to authenticated, service_role;
