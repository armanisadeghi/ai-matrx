-- `conversation_files` reads attachments for `chat.conversation`, but its
-- authorization gate used iam.has_access('conversation', ...). That token is
-- registered to the separate legacy public.cx_conversation table, so owners of
-- ordinary agent-run conversations were rejected even though chat RLS and the
-- canonical cvx reader admitted the row.

create or replace function public.can_view_chat_conversation(
  p_user_id uuid,
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1
    from chat.conversation c
    where c.id = p_conversation_id
      and c.deleted_at is null
      and (
        c.created_by = p_user_id
        or public.is_super_admin()
        or (c.visibility = 'public'::platform.visibility)
        or (
          c.visibility in (
            'internal'::platform.visibility,
            'public'::platform.visibility
          )
          and exists (
            select 1
            from iam.organization_member om
            where om.organization_id = c.organization_id
              and om.user_id = p_user_id
          )
        )
        or exists (
          select 1
          from iam.permissions p
          where p.resource_type = 'conversation'
            and p.resource_id = c.id
            and coalesce(p.status, 'active') = 'active'
            and (p.expires_at is null or p.expires_at > now())
            and p.permission_level >= 'viewer'::public.permission_level
            and (
              p.granted_to_user_id = p_user_id
              or (
                p.granted_to_organization_id is not null
                and exists (
                  select 1
                  from iam.organization_member om
                  where om.organization_id = p.granted_to_organization_id
                    and om.user_id = p_user_id
                )
              )
              or coalesce(p.is_public, false)
            )
        )
      )
  );
$$;

revoke all on function public.can_view_chat_conversation(uuid, uuid)
  from public, anon, authenticated;

comment on function public.can_view_chat_conversation(uuid, uuid) is
  'Canonical viewer predicate for chat.conversation. Deliberately separate from the legacy conversation entity token, which resolves public.cx_conversation.';

create or replace function public.conversation_files(p_conversation_id uuid)
returns table(
  file_id uuid,
  label text,
  metadata jsonb,
  created_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'conversation_files: authenticated user required'
      using errcode = '42501';
  end if;

  if not public.can_view_chat_conversation(v_uid, p_conversation_id) then
    raise exception 'conversation_files: viewer access to conversation required'
      using errcode = '42501';
  end if;

  return query
  select a.source_id, a.label, a.metadata, a.created_at
  from platform.associations_live a
  where a.source_type = 'file'
    and a.target_type = 'conversation'
    and a.target_id = p_conversation_id
    and a.role is null
  order by a.created_at, a.id;
end;
$$;

revoke all on function public.conversation_files(uuid) from public, anon;
grant execute on function public.conversation_files(uuid) to authenticated;
