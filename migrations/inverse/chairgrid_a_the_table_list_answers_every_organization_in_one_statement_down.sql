-- chair-step: inverse of chairgrid_a_the_table_list_answers_every_organization_in_one_statement.sql — custom.table_list_everywhere(uuid) gets back its exact body as it stood on production (one self-call per organization), same signature, grants, comment and door row untouched. Nothing else is touched.
-- lane: CHAIR-GRID
-- based-on: custom.table_list_everywhere(uuid) ae8154ac56f4d015a19075d7bbb44c922345679d95c9930882efe682ea9bf8ae

CREATE OR REPLACE FUNCTION custom.table_list_everywhere(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me     uuid := custom.query_principal();
  v_tables jsonb;
  v_org    uuid;
  v_all    jsonb := '[]'::jsonb;
begin
  -- NO ORGANIZATION NAMED = the optional organization FILTER left off (org-filter sweep, 2026-09-29;
  -- access-belongs-to-the-person): the Tables the caller may open in EVERY organization she belongs
  -- to. Each organization is asked through this same door with its name, so it meets its own wall
  -- and its own ladder below; this only adds the answers together, each row already carrying its
  -- organization_id. An organization whose wall refuses (42501) contributes nothing. No permission
  -- is changed by this branch.
  if p_organization_id is null then
    if v_me is null then
      return jsonb_build_object('success', true, 'tables', '[]'::jsonb);
    end if;
    for v_org in
      select m.organization_id
        from iam.organization_member m
        join iam.organizations o on o.id = m.organization_id and o.archived_at is null
       where m.user_id = v_me
    loop
      begin
        v_all := v_all || coalesce(custom.table_list_everywhere(v_org) -> 'tables', '[]'::jsonb);
      exception when insufficient_privilege then
        continue;
      end;
    end loop;
    select coalesce(jsonb_agg(x order by (x ->> 'last_activity_at') desc nulls last, (x ->> 'created_at') desc), '[]'::jsonb)
      into v_tables from jsonb_array_elements(v_all) x;
    return jsonb_build_object('success', true, 'tables', v_tables);
  end if;

  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_list_everywhere');

  with visible as (
    select v as id from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v
  ),
  store as (
    select jsonb_build_object(
             'id', t.id,
             'table_name', coalesce(nullif(t.data ->> 'name', ''), '(unnamed table)'),
             'description', t.data ->> 'description',
             'version', t.version,
             'user_id', t.created_by,
             'is_public', false,
             'visibility', t.visibility::text,
             'organization_id', t.organization_id,
             'created_at', t.created_at,
             'updated_at', t.updated_at,
             'last_activity_at', greatest(t.updated_at,
                                   (select max(r.updated_at) from custom.record r
                                     where r.organization_id = t.organization_id and r.table_id = t.id)),
             'row_count', (select count(*) from custom.record r
                            where r.organization_id = t.organization_id and r.table_id = t.id
                              and r.data_class = 'record' and r.deleted_at is null),
             'field_count', (select count(*) from custom.record f
                              where f.organization_id = t.organization_id and f.table_id = custom.field_kernel_id()
                                and f.data_class = 'field' and f.deleted_at is null
                                and f.data ->> 'entity_definition_id' = t.id::text),
             'store', 'records')
           -- SC-1 PLACEMENT: who keeps it, and whether the context picker offers it.
           || custom.table_placement(t.organization_id, t.id, t.data, false) as doc
      from custom.record t
      join visible v on v.id = t.id
     where t.organization_id = p_organization_id
       and t.table_id = custom.table_kernel_id()
       and t.data_class = 'table'
       and t.deleted_at is null
  )
  select coalesce(jsonb_agg(x.doc order by (x.doc ->> 'last_activity_at') desc nulls last,
                                           (x.doc ->> 'created_at') desc), '[]'::jsonb)
    into v_tables
    -- APP TABLES WAIT BEHIND ONE SWITCH (lane CHAIR-DOORS-2, v6 N-C8): a Table the app keeps out of every
    -- default list (custom.table_kept_out_of_lists on its placement word) only with p_include_app_tables.
    from (select s.doc from store s
           where current_setting('custom.include_app_tables', true) is not distinct from 'on'
              or not custom.table_kept_out_of_lists(s.doc ->> 'kept_for')) x;

  return jsonb_build_object('success', true, 'tables', v_tables);
end
$function$;
