-- Restore the soft-delete bodies overwritten by the later membership-guard
-- migration, and enforce the documented owner/admin structural-change rule.

create or replace function public.delete_scope(p_scope_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_child_count integer;
  v_assignment_count integer;
  v_org uuid;
begin
  select scope.organization_id
  into v_org
  from context.scopes as scope
  where scope.id = p_scope_id
    and scope.deleted_at is null;

  if v_org is null then
    raise exception 'scope not found' using errcode = 'P0002';
  end if;

  if auth.role() <> 'service_role'
     and not exists (
       select 1
       from iam.memberships as membership
       where membership.container_type = 'organization'
         and membership.container_id = v_org
         and membership.organization_id = v_org
         and membership.user_id = auth.uid()
         and membership.role in ('owner', 'admin')
         and membership.status = 'active'
         and membership.deleted_at is null
     ) then
    raise exception 'organization owner or admin required'
      using errcode = '42501';
  end if;

  with recursive children as (
    select scope.id
    from context.scopes as scope
    where scope.parent_scope_id = p_scope_id
      and scope.deleted_at is null
    union all
    select scope.id
    from context.scopes as scope
    join children as child on scope.parent_scope_id = child.id
    where scope.deleted_at is null
  )
  select count(*) into v_child_count from children;

  with recursive all_scopes as (
    select p_scope_id as id
    union all
    select scope.id
    from context.scopes as scope
    join all_scopes as parent on scope.parent_scope_id = parent.id
    where scope.deleted_at is null
  )
  select count(*)
  into v_assignment_count
  from platform.associations as association
  where association.target_type = 'scope'
    and association.target_id in (select id from all_scopes);

  with recursive all_scopes as (
    select p_scope_id as id
    union all
    select scope.id
    from context.scopes as scope
    join all_scopes as parent on scope.parent_scope_id = parent.id
    where scope.deleted_at is null
  )
  update context.scopes
  set deleted_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id in (select id from all_scopes)
    and deleted_at is null;

  return jsonb_build_object(
    'deleted_children', v_child_count,
    'deleted_assignments', v_assignment_count
  );
end;
$function$;

create or replace function public.delete_scope_type(p_type_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_scope_count integer;
  v_assignment_count integer;
  v_org uuid;
begin
  select scope_type.organization_id
  into v_org
  from context.scope_types as scope_type
  where scope_type.id = p_type_id
    and scope_type.deleted_at is null;

  if v_org is null then
    raise exception 'scope type not found' using errcode = 'P0002';
  end if;

  if auth.role() <> 'service_role'
     and not exists (
       select 1
       from iam.memberships as membership
       where membership.container_type = 'organization'
         and membership.container_id = v_org
         and membership.organization_id = v_org
         and membership.user_id = auth.uid()
         and membership.role in ('owner', 'admin')
         and membership.status = 'active'
         and membership.deleted_at is null
     ) then
    raise exception 'organization owner or admin required'
      using errcode = '42501';
  end if;

  select count(*)
  into v_assignment_count
  from platform.associations as association
  join context.scopes as scope on association.target_id = scope.id
  where association.target_type = 'scope'
    and scope.scope_type_id = p_type_id
    and scope.deleted_at is null;

  select count(*)
  into v_scope_count
  from context.scopes as scope
  where scope.scope_type_id = p_type_id
    and scope.deleted_at is null;

  update context.scopes
  set deleted_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where scope_type_id = p_type_id
    and deleted_at is null;

  update context.context_items
  set is_active = false,
      updated_by = auth.uid(),
      updated_at = now()
  where scope_type_id = p_type_id
    and is_active = true;

  update context.scope_types
  set deleted_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_type_id
    and deleted_at is null;

  return jsonb_build_object(
    'deleted_scopes', v_scope_count,
    'deleted_assignments', v_assignment_count
  );
end;
$function$;

revoke execute on function public.delete_scope(uuid) from public, anon;
revoke execute on function public.delete_scope_type(uuid) from public, anon;
grant execute on function public.delete_scope(uuid) to authenticated, service_role;
grant execute on function public.delete_scope_type(uuid) to authenticated, service_role;

do $verification$
declare
  v_scope_body text;
  v_type_body text;
begin
  select pg_get_functiondef('public.delete_scope(uuid)'::regprocedure)
  into v_scope_body;
  select pg_get_functiondef('public.delete_scope_type(uuid)'::regprocedure)
  into v_type_body;

  if v_scope_body ilike '%delete from context.scopes%'
     or v_type_body ilike '%delete from context.scope_types%'
     or v_scope_body not ilike '%set deleted_at%'
     or v_type_body not ilike '%set deleted_at%' then
    raise exception 'scope soft-delete restoration failed';
  end if;
end;
$verification$;
