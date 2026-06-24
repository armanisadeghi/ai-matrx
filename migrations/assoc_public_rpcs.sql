-- assoc_public_rpcs.sql
-- Applied 2026-06-24 during the DB changeover (via Supabase MCP apply_migration).
--
-- The frontend data path to platform.associations. `authenticated` has NO direct
-- grant on platform.associations, so all client reads/writes go through these
-- PUBLIC SECURITY-DEFINER RPCs, org-gated via iam.has_org_access, granted to
-- authenticated only. Consumed exclusively by features/scopes/service/associationsService.ts.
-- Idempotent.

-- READ: everything associated with an entity, both directions, org-filtered.
create or replace function public.assoc_for_entity(p_type text, p_id uuid)
returns table (id uuid, direction text, other_type text, other_id uuid, label text, metadata jsonb, org_id uuid, created_at timestamptz)
language sql stable security definer set search_path to 'public' as $fn$
  select a.id, 'outgoing'::text, a.target_type, a.target_id, a.label, a.metadata, a.org_id, a.created_at
    from platform.associations a
   where a.source_type = p_type and a.source_id = p_id and iam.has_org_access(a.org_id)
  union all
  select a.id, 'incoming'::text, a.source_type, a.source_id, a.label, a.metadata, a.org_id, a.created_at
    from platform.associations a
   where a.target_type = p_type and a.target_id = p_id and iam.has_org_access(a.org_id);
$fn$;

-- WRITE: add one edge (idempotent), resolving + verifying org.
create or replace function public.assoc_add(
  p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid,
  p_org_id uuid default null, p_label text default null, p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path to 'public' as $fn$
declare v_org uuid := p_org_id; v_id uuid;
begin
  if v_org is null then
    if    p_target_type='scope'    then select organization_id into v_org from ctx_scopes   where id=p_target_id;
    elsif p_target_type='task'     then select organization_id into v_org from ctx_tasks    where id=p_target_id;
    elsif p_target_type='project'  then select organization_id into v_org from ctx_projects where id=p_target_id;
    elsif p_target_type='category' then select org_id          into v_org from platform.categories where id=p_target_id;
    end if;
  end if;
  if v_org is null or not iam.has_org_access(v_org) then
    raise exception 'assoc_add: no org access (org=%, %/% -> %/%)', v_org, p_source_type, p_source_id, p_target_type, p_target_id
      using errcode = '42501';
  end if;
  insert into platform.associations (source_type, source_id, target_type, target_id, org_id, label, metadata, created_by)
  values (p_source_type, p_source_id, p_target_type, p_target_id, v_org, p_label, coalesce(p_metadata,'{}'::jsonb), auth.uid())
  on conflict (source_type, source_id, target_type, target_id)
  do update set label = coalesce(excluded.label, platform.associations.label), metadata = excluded.metadata
  returning id into v_id;
  return v_id;
end $fn$;

-- WRITE: remove one edge (org-checked).
create or replace function public.assoc_remove(
  p_source_type text, p_source_id uuid, p_target_type text, p_target_id uuid
) returns void
language plpgsql security definer set search_path to 'public' as $fn$
begin
  delete from platform.associations
   where source_type=p_source_type and source_id=p_source_id
     and target_type=p_target_type and target_id=p_target_id
     and iam.has_org_access(org_id);
end $fn$;

-- WRITE: replace the full target set of a given type for a source (org-checked).
create or replace function public.assoc_set_targets(
  p_source_type text, p_source_id uuid, p_target_type text, p_target_ids uuid[], p_org_id uuid default null
) returns void
language plpgsql security definer set search_path to 'public' as $fn$
declare v_target uuid;
begin
  delete from platform.associations
   where source_type=p_source_type and source_id=p_source_id and target_type=p_target_type
     and target_id <> all (coalesce(p_target_ids, '{}'::uuid[]))
     and iam.has_org_access(org_id);
  if p_target_ids is not null then
    foreach v_target in array p_target_ids loop
      perform public.assoc_add(p_source_type, p_source_id, p_target_type, v_target, p_org_id);
    end loop;
  end if;
end $fn$;

revoke all on function public.assoc_for_entity(text,uuid) from public;
revoke all on function public.assoc_add(text,uuid,text,uuid,uuid,text,jsonb) from public;
revoke all on function public.assoc_remove(text,uuid,text,uuid) from public;
revoke all on function public.assoc_set_targets(text,uuid,text,uuid[],uuid) from public;
grant execute on function public.assoc_for_entity(text,uuid) to authenticated;
grant execute on function public.assoc_add(text,uuid,text,uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.assoc_remove(text,uuid,text,uuid) to authenticated;
grant execute on function public.assoc_set_targets(text,uuid,text,uuid[],uuid) to authenticated;
