-- mbr_public_rpcs.sql
-- Applied during the canonical-model cutover (via Supabase MCP apply_migration).
--
-- The frontend data path to iam.memberships (container membership: a user in a
-- project / task / war_room / etc). `authenticated` has NO direct grant on
-- iam.memberships, so all client reads/writes go through these PUBLIC
-- SECURITY-DEFINER RPCs, org-gated via iam.has_org_access, granted to
-- authenticated only. Consumed exclusively by
-- features/organizations/service/membershipsService.ts (mirrors the
-- associationsService chokepoint). Idempotent.

-- READ: all members of a container (visible if caller has org access OR is a member).
create or replace function public.mbr_list(p_container_type text, p_container_id uuid)
returns table(id uuid, organization_id uuid, container_type text, container_id uuid,
              user_id uuid, role text, status text, created_at timestamptz, created_by uuid)
language sql stable security definer set search_path to 'public' as $fn$
  select m.id, m.organization_id, m.container_type, m.container_id, m.user_id, m.role, m.status, m.created_at, m.created_by
    from iam.memberships m
   where m.container_type = p_container_type and m.container_id = p_container_id
     and m.deleted_at is null
     and (iam.has_org_access(m.organization_id)
          or exists (select 1 from iam.memberships me
                      where me.container_type = p_container_type and me.container_id = p_container_id
                        and me.user_id = auth.uid() and me.deleted_at is null));
$fn$;

-- READ: members of a container joined to their auth.users profile (member-mgmt UI).
-- Generalizes the legacy get_project_members_with_users to any container_type.
create or replace function public.mbr_list_with_users(p_container_type text, p_container_id uuid)
returns table(id uuid, organization_id uuid, container_id uuid, user_id uuid, role text, status text,
              created_at timestamptz, created_by uuid,
              user_email text, user_display_name text, user_avatar_url text)
language sql stable security definer set search_path to 'public' as $fn$
  select m.id, m.organization_id, m.container_id, m.user_id, m.role, m.status, m.created_at, m.created_by,
         u.email,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email),
         u.raw_user_meta_data->>'avatar_url'
    from iam.memberships m
    join auth.users u on u.id = m.user_id
   where m.container_type = p_container_type and m.container_id = p_container_id
     and m.deleted_at is null
     and (iam.has_org_access(m.organization_id)
          or exists (select 1 from iam.memberships me
                      where me.container_type = p_container_type and me.container_id = p_container_id
                        and me.user_id = auth.uid() and me.deleted_at is null))
   order by case m.role when 'owner' then 1 when 'admin' then 2 else 3 end, m.created_at asc;
$fn$;

-- READ: containers of a type the current user belongs to (for "my projects/tasks").
create or replace function public.mbr_for_user(p_container_type text)
returns table(id uuid, organization_id uuid, container_id uuid, user_id uuid,
              role text, status text, created_at timestamptz)
language sql stable security definer set search_path to 'public' as $fn$
  select m.id, m.organization_id, m.container_id, m.user_id, m.role, m.status, m.created_at
    from iam.memberships m
   where m.container_type = p_container_type and m.user_id = auth.uid() and m.deleted_at is null;
$fn$;

-- READ: member counts for many containers at once (kills the per-row N+1).
create or replace function public.mbr_count(p_container_type text, p_container_ids uuid[])
returns table(container_id uuid, member_count bigint)
language sql stable security definer set search_path to 'public' as $fn$
  select m.container_id, count(*)::bigint
    from iam.memberships m
   where m.container_type = p_container_type
     and m.container_id = any(coalesce(p_container_ids, '{}'::uuid[]))
     and m.deleted_at is null
     and (iam.has_org_access(m.organization_id)
          or m.container_id in (select me.container_id from iam.memberships me
                                 where me.container_type = p_container_type
                                   and me.user_id = auth.uid() and me.deleted_at is null))
   group by m.container_id;
$fn$;

-- WRITE: add (or reactivate) a membership (idempotent), resolving + verifying org.
create or replace function public.mbr_add(
  p_container_type text, p_container_id uuid, p_user_id uuid,
  p_role text default 'member', p_org_id uuid default null, p_status text default 'active'
) returns uuid
language plpgsql security definer set search_path to 'public' as $fn$
declare v_org uuid := p_org_id; v_id uuid;
begin
  if v_org is null then
    if    p_container_type = 'project' then select organization_id into v_org from ctx_projects where id = p_container_id;
    elsif p_container_type = 'task'    then select organization_id into v_org from ctx_tasks    where id = p_container_id;
    end if;
  end if;
  if v_org is null or not iam.has_org_access(v_org) then
    raise exception 'mbr_add: no org access (org=%, %/% user=%)', v_org, p_container_type, p_container_id, p_user_id
      using errcode = '42501';
  end if;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by, updated_by)
  values (v_org, p_container_type, p_container_id, p_user_id, coalesce(p_role, 'member'), coalesce(p_status, 'active'), auth.uid(), auth.uid())
  on conflict (container_type, container_id, user_id)
  do update set role = excluded.role, status = excluded.status, deleted_at = null, updated_by = auth.uid()
  returning id into v_id;
  return v_id;
end $fn$;

-- WRITE: change a member's role (org-checked).
create or replace function public.mbr_set_role(
  p_container_type text, p_container_id uuid, p_user_id uuid, p_role text
) returns void
language plpgsql security definer set search_path to 'public' as $fn$
begin
  update iam.memberships
     set role = p_role, updated_by = auth.uid()
   where container_type = p_container_type and container_id = p_container_id and user_id = p_user_id
     and deleted_at is null and iam.has_org_access(organization_id);
end $fn$;

-- WRITE: remove a member (soft delete; org-checked).
create or replace function public.mbr_remove(
  p_container_type text, p_container_id uuid, p_user_id uuid
) returns void
language plpgsql security definer set search_path to 'public' as $fn$
begin
  update iam.memberships
     set deleted_at = now(), updated_by = auth.uid()
   where container_type = p_container_type and container_id = p_container_id and user_id = p_user_id
     and deleted_at is null and iam.has_org_access(organization_id);
end $fn$;

revoke all on function public.mbr_list(text,uuid) from public;
revoke all on function public.mbr_list_with_users(text,uuid) from public;
revoke all on function public.mbr_for_user(text) from public;
revoke all on function public.mbr_count(text,uuid[]) from public;
revoke all on function public.mbr_add(text,uuid,uuid,text,uuid,text) from public;
revoke all on function public.mbr_set_role(text,uuid,uuid,text) from public;
revoke all on function public.mbr_remove(text,uuid,uuid) from public;
grant execute on function public.mbr_list(text,uuid) to authenticated;
grant execute on function public.mbr_list_with_users(text,uuid) to authenticated;
grant execute on function public.mbr_for_user(text) to authenticated;
grant execute on function public.mbr_count(text,uuid[]) to authenticated;
grant execute on function public.mbr_add(text,uuid,uuid,text,uuid,text) to authenticated;
grant execute on function public.mbr_set_role(text,uuid,uuid,text) to authenticated;
grant execute on function public.mbr_remove(text,uuid,uuid) to authenticated;
