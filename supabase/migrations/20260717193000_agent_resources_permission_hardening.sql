-- Attaching a resource conveys contextual viewer access to everyone who can
-- view the agent. Only a source editor may authorize that redistribution.

create or replace function public.agent_resource_add(
  p_agent_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_label text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_org uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'agent_resource_add: authenticated user required'
      using errcode = '42501';
  end if;

  if not iam.has_access('agent', p_agent_id, 'editor'::public.permission_level) then
    raise exception 'agent_resource_add: editor access to agent required'
      using errcode = '42501';
  end if;

  if not iam.has_access(p_source_type, p_source_id, 'editor'::public.permission_level) then
    raise exception 'agent_resource_add: editor access to source resource required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from platform.association_types at
    where at.source_type = p_source_type
      and at.target_type = 'agent'
      and at.container_side = 'target'
      and at.is_active
  ) then
    raise exception 'agent_resource_add: unsupported resource type %', p_source_type
      using errcode = '23514';
  end if;

  select d.organization_id
    into v_org
    from agent.definition d
   where d.id = p_agent_id;

  if v_org is null then
    raise exception 'agent_resource_add: agent has no organization'
      using errcode = '23514';
  end if;

  insert into platform.associations (
    source_type,
    source_id,
    target_type,
    target_id,
    organization_id,
    role,
    label,
    metadata,
    created_by
  ) values (
    p_source_type,
    p_source_id,
    'agent',
    p_agent_id,
    v_org,
    'agent_resource',
    p_label,
    coalesce(p_metadata, '{}'::jsonb),
    (select auth.uid())
  )
  on conflict (source_type, source_id, target_type, target_id, role)
  do update set
    label = coalesce(excluded.label, platform.associations.label),
    metadata = excluded.metadata
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.agent_resource_add(uuid, text, uuid, text, jsonb) from public, anon;
grant execute on function public.agent_resource_add(uuid, text, uuid, text, jsonb) to authenticated;
