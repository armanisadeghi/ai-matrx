-- cmt_public_rpcs.sql
-- Applied during the canonical-model cutover (via Supabase MCP apply_migration).
--
-- The frontend data path to platform.comments (threaded discussion on any
-- entity). `authenticated` has NO direct grant on platform.comments, so all
-- client reads/writes go through these PUBLIC SECURITY-DEFINER RPCs, org-gated
-- via iam.has_org_access. Consumed exclusively by
-- features/comments/service/commentsService.ts. Idempotent.

-- READ: all comments on an entity, with author profile, threaded by parent_id.
create or replace function public.cmt_list(p_entity_type text, p_entity_id uuid)
returns table(id uuid, organization_id uuid, entity_type text, entity_id uuid, parent_id uuid,
              body text, created_at timestamptz, updated_at timestamptz, created_by uuid,
              author_email text, author_display_name text, author_avatar_url text)
language sql stable security definer set search_path to 'public' as $fn$
  select c.id, c.organization_id, c.entity_type, c.entity_id, c.parent_id, c.body,
         c.created_at, c.updated_at, c.created_by,
         u.email,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email),
         u.raw_user_meta_data->>'avatar_url'
    from platform.comments c
    left join auth.users u on u.id = c.created_by
   where c.entity_type = p_entity_type and c.entity_id = p_entity_id
     and c.deleted_at is null and iam.has_org_access(c.organization_id)
   order by c.created_at asc;
$fn$;

-- WRITE: add a comment (or reply via p_parent_id). Org resolved from the entity
-- when null (task today; falls back to the caller's personal org otherwise).
create or replace function public.cmt_add(
  p_entity_type text, p_entity_id uuid, p_body text,
  p_parent_id uuid default null, p_org_id uuid default null
) returns uuid
language plpgsql security definer set search_path to 'public' as $fn$
declare v_org uuid := p_org_id; v_id uuid;
begin
  if v_org is null then
    if p_entity_type = 'task' then select organization_id into v_org from workspace.tasks where id = p_entity_id; end if;
  end if;
  if v_org is null then v_org := public.ensure_personal_organization(auth.uid()); end if;
  if not iam.has_org_access(v_org) then
    raise exception 'cmt_add: no org access (org=%, %/%)', v_org, p_entity_type, p_entity_id using errcode = '42501';
  end if;
  insert into platform.comments (organization_id, entity_type, entity_id, parent_id, body, created_by, updated_by)
  values (v_org, p_entity_type, p_entity_id, p_parent_id, p_body, auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end $fn$;

-- WRITE: edit a comment (author only).
create or replace function public.cmt_edit(p_id uuid, p_body text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  update platform.comments
     set body = p_body, updated_by = auth.uid()
   where id = p_id and deleted_at is null and created_by = auth.uid();
end $fn$;

-- WRITE: delete a comment (soft delete; author, or org member with access).
create or replace function public.cmt_delete(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  update platform.comments
     set deleted_at = now(), updated_by = auth.uid()
   where id = p_id and deleted_at is null
     and (created_by = auth.uid() or iam.has_org_access(organization_id));
end $fn$;

-- DATA BACKFILL: copy any legacy ctx_task_comments rows not yet in platform.comments
-- (entity_type='task'). Idempotent — keyed on the legacy row id.
insert into platform.comments (id, organization_id, entity_type, entity_id, body, created_by, created_at, updated_at)
select tc.id,
       coalesce((select t.organization_id from workspace.tasks t where t.id = tc.task_id),
                public.ensure_personal_organization(tc.user_id)),
       'task', tc.task_id, tc.content, tc.user_id, tc.created_at, tc.updated_at
  from public.ctx_task_comments tc
 where not exists (select 1 from platform.comments c where c.id = tc.id)
on conflict (id) do nothing;

revoke all on function public.cmt_list(text,uuid) from public;
revoke all on function public.cmt_add(text,uuid,text,uuid,uuid) from public;
revoke all on function public.cmt_edit(uuid,text) from public;
revoke all on function public.cmt_delete(uuid) from public;
grant execute on function public.cmt_list(text,uuid) to authenticated;
grant execute on function public.cmt_add(text,uuid,text,uuid,uuid) to authenticated;
grant execute on function public.cmt_edit(uuid,text) to authenticated;
grant execute on function public.cmt_delete(uuid) to authenticated;
