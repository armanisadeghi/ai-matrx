-- THE COMPONENT-ACCESS PRECEDENT (owner ruling 2026-08-08) — part 1/3.
-- iam.accessible_entity_ids(token, level): the STABLE once-per-query parent
-- resolver. A component table's RLS membrane is
--   parent_fk = ANY ((select iam.accessible_entity_ids('<parent_token>')))
-- so parent access is decided ONCE per query (InitPlan), never per row.
--
-- Semantics: returns the ids of rows of entity <token> the caller can access
-- at <level>. Mass lanes (owner / public / org-internal / org-admin /
-- system-org) are exact set-wise mirrors of the trivial rules in
-- iam.has_access_for_base; sparse lanes (permission grants, memberships,
-- reachability, edu assignments) are candidate-enumerated and confirmed
-- per-candidate through THE resolver (iam.has_access_for), so the recursive
-- logic is never re-implemented. Component parents (e.g. sms_message,
-- wc_report, tool_ui, global_execution) and containment parents recurse.
-- PARITY OBLIGATION: any new lane added to iam.has_access_for_base that can
-- grant access to a whole class of rows must be reflected here.

create or replace function iam.accessible_entity_ids(
  p_type     text,
  p_required public.permission_level default 'viewer',
  p_depth    integer default 0
) returns uuid[]
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'platform', 'iam'
as $$
declare
  v_uid          uuid := auth.uid();
  v_schema       text;
  v_table        text;
  v_is_component boolean;
  v_tbl          text;
  v_owner_col    text;
  v_has_org      boolean;
  v_has_vis      boolean;
  v_parent_type  text;
  v_parent_col   text;
  v_parent_ids   uuid[];
  v_more         uuid[];
  v_trusted      text;
  v_sql          text;
  v_ids          uuid[] := '{}';
  rec            record;
begin
  if v_uid is null or p_depth > 4 then
    return '{}'::uuid[];
  end if;

  select et.schema_name, et.table_name, coalesce(et.is_component, false)
    into v_schema, v_table, v_is_component
  from platform.entity_types et
  where et.token = p_type;
  if v_schema is null then
    return '{}'::uuid[];
  end if;
  v_tbl := format('%I.%I', v_schema, v_table);

  select c.column_name into v_owner_col
  from information_schema.columns c
  where c.table_schema = v_schema and c.table_name = v_table
    and c.column_name in ('created_by', 'owner_id', 'user_id')
  order by case c.column_name when 'created_by' then 1 when 'owner_id' then 2 else 3 end
  limit 1;
  select exists (select 1 from information_schema.columns c
                 where c.table_schema = v_schema and c.table_name = v_table
                   and c.column_name = 'organization_id') into v_has_org;
  select exists (select 1 from information_schema.columns c
                 where c.table_schema = v_schema and c.table_name = v_table
                   and c.column_name = 'visibility') into v_has_vis;

  -- A component parent is visible iff ITS composition parent is visible
  -- (plus the parent-optional owner arm when the FK is nullable).
  if v_is_component then
    select er.parent_type, er.fk_column into v_parent_type, v_parent_col
    from platform.entity_relationships er
    where er.child_type = p_type and er.kind = 'composition'
    limit 1;
    if v_parent_type is null then
      return '{}'::uuid[];
    end if;
    v_parent_ids := iam.accessible_entity_ids(v_parent_type, p_required, p_depth + 1);
    v_sql := format(
      'select coalesce(array_agg(t.id), ''{}'') from %s t where t.%I = any($1)%s',
      v_tbl, v_parent_col,
      case when v_owner_col is not null
           then format(' or (t.%I is null and t.%I = $2)', v_parent_col, v_owner_col)
           else '' end);
    execute v_sql into v_ids using v_parent_ids, v_uid;
    return coalesce(v_ids, '{}'::uuid[]);
  end if;

  -- 1) Trusted set-wise lanes — exact mirrors of the trivial resolver rules.
  v_trusted := case when v_owner_col is not null
                    then format('t.%I = $1', v_owner_col)
                    else 'false' end;
  if p_required = 'viewer' then
    if v_has_vis then
      v_trusted := v_trusted || ' or t.visibility = ''public''';
      if v_has_org then
        v_trusted := v_trusted
          || ' or (t.visibility >= ''internal'''
          || ' and (t.organization_id in (select om.organization_id from iam.organization_member om where om.user_id = $1)'
          || '      or t.organization_id in (select so.organization_id from iam.system_orgs so where so.global_readable)))';
      end if;
    end if;
    if v_has_org then
      v_trusted := v_trusted
        || ' or t.organization_id in (select om.organization_id from iam.organization_member om'
        || '                          where om.user_id = $1 and om.role in (''owner'', ''admin''))';
    end if;
  end if;

  v_sql := format('select coalesce(array_agg(t.id), ''{}'') from %s t where %s', v_tbl, v_trusted);
  execute v_sql into v_ids using v_uid;
  v_ids := coalesce(v_ids, '{}'::uuid[]);

  -- 2) Sparse candidate lanes, each candidate confirmed by THE resolver.
  for rec in
    select distinct c.id from (
      select p.resource_id as id
      from iam.permissions p
      where p.resource_type = p_type
        and (p.granted_to_user_id = v_uid
             or p.granted_to_organization_id in
                (select om.organization_id from iam.organization_member om where om.user_id = v_uid))
        and p.status <> 'rejected'
        and (p.expires_at is null or p.expires_at > now())
      union
      select m.container_id
      from iam.memberships m
      where m.container_type = p_type and m.user_id = v_uid and m.deleted_at is null
      union
      select r.item_id
      from platform.reachability r
      where r.item_type = p_type and r.max_level >= p_required
      union
      select a.source_id
      from platform.associations a
      where a.source_type = p_type and a.role = 'assignment' and a.target_type = 'scope'
    ) c
    where not (c.id = any (v_ids))
  loop
    if iam.has_access_for(v_uid, p_type, rec.id, p_required) then
      v_ids := v_ids || rec.id;
    end if;
  end loop;

  -- 3) Containment recursion: internal+ rows under an accessible containment parent.
  if v_has_vis then
    for rec in
      select er.parent_type, er.fk_column
      from platform.entity_relationships er
      where er.child_type = p_type and er.kind = 'containment'
    loop
      if exists (select 1 from information_schema.columns c
                 where c.table_schema = v_schema and c.table_name = v_table
                   and c.column_name = rec.fk_column) then
        v_parent_ids := iam.accessible_entity_ids(rec.parent_type, p_required, p_depth + 1);
        if coalesce(array_length(v_parent_ids, 1), 0) > 0 then
          v_sql := format(
            'select coalesce(array_agg(t.id), ''{}'') from %s t
             where t.visibility >= ''internal'' and t.%I = any($1) and not (t.id = any($2))',
            v_tbl, rec.fk_column);
          execute v_sql into v_more using v_parent_ids, v_ids;
          v_ids := v_ids || coalesce(v_more, '{}'::uuid[]);
        end if;
      end if;
    end loop;
  end if;

  return v_ids;
end;
$$;

comment on function iam.accessible_entity_ids(text, public.permission_level, integer) is
  'THE COMPONENT-ACCESS PRECEDENT (2026-08-08): once-per-query set of entity ids the caller can access at the given level. Component RLS membranes call this in an InitPlan-safe scalar subquery. Mass lanes mirror the trivial has_access_for_base rules set-wise; sparse lanes confirm per-candidate via iam.has_access_for. Keep in parity with iam.has_access_for_base.';

revoke all on function iam.accessible_entity_ids(text, public.permission_level, integer) from public;
grant execute on function iam.accessible_entity_ids(text, public.permission_level, integer)
  to authenticated, anon, service_role;
