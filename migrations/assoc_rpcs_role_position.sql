-- PLATFORM FIX (app-wide, no shortcuts): role/position-aware assoc_* RPCs; REPAIR the broken
-- ON CONFLICT (assoc_add used the 4-tuple; the only unique index is the 5-tuple
-- associations_unique NULLS NOT DISTINCT, so every conflicting insert errored); GENERIC
-- source-org fallback so any edge resolves org from its source entity via the entity_types
-- registry (no caller need pass org). Backward compatible: role defaults NULL → under NULLS
-- NOT DISTINCT the prior 4-tuple dedup is preserved; the org fallback only fires where org was
-- previously unresolvable (an error), and still gates on iam.has_org_access.
-- Applied live to txzxabzwovsujtloxrus via Supabase MCP. Idempotent.

drop function if exists public.assoc_add(text,uuid,text,uuid,uuid,text,jsonb);
create function public.assoc_add(
  p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid,
  p_org_id uuid default null, p_label text default null, p_metadata jsonb default '{}'::jsonb,
  p_role text default null, p_position int default null
) returns uuid language plpgsql security definer set search_path to 'public' as $fn$
declare v_org uuid := p_org_id; v_id uuid; v_schema text; v_table text;
begin
  if v_org is null then
    if    p_target_type='scope'    then select organization_id into v_org from context.scopes      where id=p_target_id;
    elsif p_target_type='task'     then select organization_id into v_org from workspace.tasks     where id=p_target_id;
    elsif p_target_type='project'  then select organization_id into v_org from workspace.projects  where id=p_target_id;
    elsif p_target_type='category' then select organization_id into v_org from platform.categories where id=p_target_id;
    end if;
  end if;
  if v_org is null then
    select et.schema_name, et.table_name into v_schema, v_table
      from platform.entity_types et where et.token = p_source_type and et.is_active;
    if v_schema is not null then
      begin
        execute format('select organization_id from %I.%I where id = $1', v_schema, v_table) into v_org using p_source_id;
      exception when undefined_column or undefined_table then v_org := null;
      end;
    end if;
  end if;
  if v_org is null or not iam.has_org_access(v_org) then
    raise exception 'assoc_add: no org access (org=%, %/% -> %/% role=%)', v_org, p_source_type, p_source_id, p_target_type, p_target_id, p_role
      using errcode = '42501';
  end if;
  insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, role, label, position, metadata, created_by)
  values (p_source_type, p_source_id, p_target_type, p_target_id, v_org, p_role, p_label, p_position, coalesce(p_metadata,'{}'::jsonb), auth.uid())
  on conflict (source_type, source_id, target_type, target_id, role)
  do update set label    = coalesce(excluded.label, platform.associations.label),
                position = coalesce(excluded.position, platform.associations.position),
                metadata = excluded.metadata
  returning id into v_id;
  return v_id;
end $fn$;

drop function if exists public.assoc_for_entity(text,uuid);
create function public.assoc_for_entity(p_type text, p_id uuid)
returns table(id uuid, direction text, other_type text, other_id uuid, role text, label text, "position" integer, metadata jsonb, organization_id uuid, created_at timestamptz)
language sql stable security definer set search_path to 'public' as $fn$
  select a.id, 'outgoing'::text, a.target_type, a.target_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations a
   where a.source_type = p_type and a.source_id = p_id and iam.has_org_access(a.organization_id)
  union all
  select a.id, 'incoming'::text, a.source_type, a.source_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations a
   where a.target_type = p_type and a.target_id = p_id and iam.has_org_access(a.organization_id)
  order by 7 nulls last, 10;
$fn$;

drop function if exists public.assoc_for_sources(text,uuid[],text);
create function public.assoc_for_sources(p_source_type text, p_source_ids uuid[], p_target_type text default null)
returns table(id uuid, source_id uuid, target_type text, target_id uuid, role text, label text, "position" integer, metadata jsonb, organization_id uuid, created_at timestamptz)
language sql stable security definer set search_path to 'public' as $fn$
  select a.id, a.source_id, a.target_type, a.target_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations a
   where a.source_type = p_source_type
     and a.source_id = any(coalesce(p_source_ids, '{}'::uuid[]))
     and (p_target_type is null or a.target_type = p_target_type)
     and iam.has_org_access(a.organization_id)
  order by 7 nulls last, 10;
$fn$;

drop function if exists public.assoc_for_targets(text,uuid[]);
create function public.assoc_for_targets(p_target_type text, p_target_ids uuid[])
returns table(id uuid, target_id uuid, source_type text, source_id uuid, role text, label text, "position" integer, metadata jsonb, organization_id uuid, created_at timestamptz)
language sql stable security definer set search_path to 'public' as $fn$
  select a.id, a.target_id, a.source_type, a.source_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations a
   where a.target_type = p_target_type and a.target_id = any(coalesce(p_target_ids, '{}'::uuid[]))
     and iam.has_org_access(a.organization_id)
  order by 7 nulls last, 10;
$fn$;

drop function if exists public.assoc_remove(text,uuid,text,uuid);
create function public.assoc_remove(p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid, p_role text default null)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  delete from platform.associations
   where source_type=p_source_type and source_id=p_source_id
     and target_type=p_target_type and target_id=p_target_id
     and role is not distinct from p_role
     and iam.has_org_access(organization_id);
end $fn$;

drop function if exists public.assoc_set_targets(text,uuid,text,uuid[],uuid);
create function public.assoc_set_targets(p_source_type text, p_source_id uuid, p_target_type text, p_target_ids uuid[], p_org_id uuid default null, p_role text default null)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_target uuid; v_pos int := 0;
begin
  delete from platform.associations
   where source_type=p_source_type and source_id=p_source_id and target_type=p_target_type
     and role is not distinct from p_role
     and target_id <> all (coalesce(p_target_ids, '{}'::uuid[]))
     and iam.has_org_access(organization_id);
  if p_target_ids is not null then
    foreach v_target in array p_target_ids loop
      perform public.assoc_add(p_source_type, p_source_id, p_target_type, v_target, p_org_id, null, '{}'::jsonb, p_role, v_pos);
      v_pos := v_pos + 1;
    end loop;
  end if;
end $fn$;

grant execute on function public.assoc_add(text,uuid,text,uuid,uuid,text,jsonb,text,integer)   to authenticated, service_role;
grant execute on function public.assoc_for_entity(text,uuid)                                    to authenticated, service_role;
grant execute on function public.assoc_for_sources(text,uuid[],text)                            to authenticated, service_role;
grant execute on function public.assoc_for_targets(text,uuid[])                                 to authenticated, service_role;
grant execute on function public.assoc_remove(text,uuid,text,uuid,text)                         to authenticated, service_role;
grant execute on function public.assoc_set_targets(text,uuid,text,uuid[],uuid,text)            to authenticated, service_role;
