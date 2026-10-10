-- lane: DATA-HOME-2
-- based-on: custom.data_home_custom_fields(uuid) 3cf403b7a3404e42aafa4383e1ba6501193ca9f510f76e439d3c030a16a64031
-- based-on: custom.custom_fields_on(uuid, text) 417a6e0641be5f8608a1e01b43ab3496c153ad3078eb143b083d2d9ca83b40a0
--
-- THE TWO ALL-MY-DATA DOORS, AS FILES.
--
-- custom.data_home_custom_fields(uuid) and custom.custom_fields_on(uuid, text) were created live
-- through the MCP on 2026-10-10 (lane ALL-MY-DATA) and had no migration file. This file is their
-- live bodies exactly as pg_get_functiondef printed them, plus their client_callable_door rows,
-- so a rebuilt database has them. They are ALREADY APPLIED: the ledger row is written with
-- aidream's `--mark-applied`, never by running this over the live bodies.
--
-- THE INVERSE: migrations/inverse/datahomefix2_b_the_all_my_data_custom_fields_doors_down.sql

CREATE OR REPLACE FUNCTION custom.data_home_custom_fields(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(organization_id uuid, organization_name text, table_token text, table_label text, field_count integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
begin
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home_custom_fields');
  end if;
  if v_me is null then
    return;
  end if;
  return query
    select r.organization_id, o.name::text, (r.data ->> 'table_token'),
           coalesce(et.label::text, r.data ->> 'table_token'), count(*)::integer, max(r.updated_at)
      from iam.organization_member m
      join iam.organizations o on o.id = m.organization_id and o.archived_at is null
      join custom.record r
        on r.organization_id = m.organization_id
       and r.table_id = custom.field_kernel_id()
       and r.deleted_at is null
       and (r.data ->> 'table_token') is not null
       and not custom.field_is_protected(r.data)
      left join platform.entity_types et on et.token = r.data ->> 'table_token'
     where m.user_id = v_me
       and (p_organization_id is null or m.organization_id = p_organization_id)
       and iam.has_org_access(m.organization_id)
       and custom.store_is_open(m.organization_id)
     group by r.organization_id, o.name, (r.data ->> 'table_token'), coalesce(et.label::text, r.data ->> 'table_token');
end
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
values (
  'custom', 'data_home_custom_fields', 'p_organization_id uuid',
  array['uuid'::regtype::oid],
  true, false,
  'lane ALL-MY-DATA 2026-10-10',
  'p_organization_id: NULL walks only organizations the caller is a member of (iam.organization_member, has_org_access, store_is_open); a named one is checked by custom.assert_client_may_reach in this door''s own name. Protected fields are never counted.')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

CREATE OR REPLACE FUNCTION custom.custom_fields_on(p_organization_id uuid, p_table_token text)
 RETURNS TABLE(field_id uuid, field_key text, field_label text, field_type text, field_source text, field_required boolean, field_sort numeric, table_label text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.custom_fields_on');
  if v_me is null then
    return;
  end if;
  return query
    select r.id, (r.data ->> 'key'), coalesce(nullif(btrim(r.data ->> 'label'), ''), r.data ->> 'key'),
           (r.data ->> 'type'), (r.data ->> 'source'), coalesce((r.data ->> 'required')::boolean, false),
           coalesce(nullif(r.data ->> 'sort', '')::numeric, 0),
           coalesce(et.label::text, p_table_token)
      from custom.record r
      left join platform.entity_types et on et.token = p_table_token
     where r.organization_id = p_organization_id
       and r.table_id = custom.field_kernel_id()
       and r.deleted_at is null
       and (r.data ->> 'table_token') = p_table_token
       and not custom.field_is_protected(r.data)
       and iam.has_org_access(p_organization_id)
       and custom.store_is_open(p_organization_id)
     order by coalesce(nullif(r.data ->> 'sort', '')::numeric, 0), r.id;
end
$function$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
values (
  'custom', 'custom_fields_on', 'p_organization_id uuid, p_table_token text',
  array['uuid'::regtype::oid, 'text'::regtype::oid],
  true, false,
  'lane ALL-MY-DATA 2026-10-10',
  'p_organization_id: must be reachable by the caller (custom.assert_client_may_reach, iam.has_org_access, store_is_open); NULL is refused. p_table_token: only filters that organization''s field records. Protected fields are never returned.')
on conflict (schema_name, function_name, identity_argtypes) do nothing;

select custom.reopen_declared_doors();
