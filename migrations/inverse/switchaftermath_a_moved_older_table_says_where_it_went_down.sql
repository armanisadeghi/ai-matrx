-- INVERSE of migrations/campaign/switchaftermath_a_moved_older_table_says_where_it_went.sql (lane SWITCH-AFTERMATH): public.trash_list and public.org_trash_list back to production's bodies before it, byte for byte; the restore guard trigger and its function, the private question and the member door removed with their declarations; the dataset registry row's title_column back to description.
-- chair-step: restores public.trash_list(text[], integer, integer) and public.org_trash_list(uuid, text[], uuid, integer, integer) as TRASH-2 left them; turns workbench._moved_older_table_restores_with_switch_back() (the trigger stays bound) into a pass-through; drops platform._older_table_moved_by_switch(uuid) and platform.data_tables_switched_for_me(); deletes their platform.client_callable_door rows; sets platform.entity_types (token dataset) title_column = 'description'.
-- based-on: public.trash_list(text[], integer, integer) e2b6c858ecd3045834d8225e3ff1b6660d83113d4a6c04423b39f0ca28a57ab9
-- based-on: public.org_trash_list(uuid, text[], uuid, integer, integer) deefe2a3f456bac9151469fae402b1567a11a022655ce90f9e90ac2b2e12200e
-- based-on: workbench._moved_older_table_restores_with_switch_back() 41bdae2700964930d637c634fb88220770d14ba993276d9bfa7dffb6ecbd8530


CREATE OR REPLACE FUNCTION public.trash_list(p_kinds text[] DEFAULT NULL::text[], p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(artifact_kind text, entity_token text, label text, id uuid, title text, deleted_at timestamp with time zone, organization_id uuid, is_mine boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- lane TRASH-2: personal Trash — what you own plus what was named to you. `limit`/`offset` are per kind.
  select r.artifact_kind, r.entity_token, r.label, r.id, r.title, r.deleted_at, r.organization_id, r.is_mine
    from public._trash_kind_rows((select auth.uid()), null, null, p_kinds, p_limit, p_offset) r;
$function$;

CREATE OR REPLACE FUNCTION public.org_trash_list(p_organization_id uuid, p_kinds text[] DEFAULT NULL::text[], p_member uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(artifact_kind text, entity_token text, label text, id uuid, title text, deleted_at timestamp with time zone, organization_id uuid, is_mine boolean, owner_id uuid, owner_label text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. One merged page (newest first) across the chosen kinds: `limit`/`offset` apply to the
-- merged list, not per kind.
declare
  v_me uuid := public._org_trash_gate(p_organization_id);
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  return query
  select r.artifact_kind, r.entity_token, r.label, r.id, r.title, r.deleted_at, r.organization_id,
         r.is_mine, r.owner_id,
         coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                  u.email::text)
    from public._trash_kind_rows(v_me, p_organization_id, p_member, p_kinds, v_limit + v_offset, 0) r
    left join auth.users u on u.id = r.owner_id
   order by r.deleted_at desc, r.id
   limit v_limit offset v_offset;
end;
$function$;

-- The trigger stays bound (dropping a trigger on workbench.udt_datasets takes ACCESS EXCLUSIVE plus
-- the supautils set, a window-class freeze); its function becomes a pass-through, so every restore
-- door behaves exactly as before the up file.
create or replace function workbench._moved_older_table_restores_with_switch_back()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
begin
  return new;
end;
$$;

delete from platform.client_callable_door
 where (schema_name, function_name) in (('platform', '_older_table_moved_by_switch'), ('platform', 'data_tables_switched_for_me'));
drop function if exists platform._older_table_moved_by_switch(uuid);
drop function if exists platform.data_tables_switched_for_me();

update platform.entity_types
   set title_column = 'description'
 where token = 'dataset' and schema_name = 'workbench' and table_name = 'udt_datasets';
