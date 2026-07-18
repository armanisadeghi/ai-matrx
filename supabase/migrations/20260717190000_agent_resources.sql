-- Agent Resources
--
-- A permanent resource is a canonical platform association:
--   resource --(role=agent_resource)--> agent
-- The agent is the containment side, so anyone who may view the agent receives
-- contextual viewer access to the resource without making it globally
-- discoverable. Authoring is deliberately stricter than the legacy assoc_add
-- RPC: callers must edit both the agent and source resource. Attachment conveys
-- contextual access to other agent viewers, so read access alone is not enough.

insert into platform.association_types (
  source_type,
  target_type,
  label,
  container_side,
  conveys_max,
  is_active,
  notes
)
select
  resource_type,
  'agent',
  null,
  'target',
  'viewer',
  true,
  'Permanent Agent Resource. Agent viewers receive contextual viewer access; the resource remains non-discoverable.'
from unnest(array[
  'file',
  'processed_document',
  'transcript',
  'dataset',
  'workbook',
  'data_store',
  'studio_session',
  'code_file',
  'note',
  'udt_document',
  'working_document',
  'conversation',
  'flashcard_set',
  'fc_set',
  'quiz_session'
]::text[]) as resources(resource_type)
join platform.entity_types et
  on et.token = resources.resource_type
 and et.is_active
on conflict (source_type, target_type) do update
set container_side = excluded.container_side,
    conveys_max = excluded.conveys_max,
    is_active = true,
    notes = excluded.notes,
    updated_at = now();

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

create or replace function public.agent_resource_remove(
  p_agent_id uuid,
  p_source_type text,
  p_source_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'agent_resource_remove: authenticated user required'
      using errcode = '42501';
  end if;

  if not iam.has_access('agent', p_agent_id, 'editor'::public.permission_level) then
    raise exception 'agent_resource_remove: editor access to agent required'
      using errcode = '42501';
  end if;

  delete from platform.associations a
   where a.source_type = p_source_type
     and a.source_id = p_source_id
     and a.target_type = 'agent'
     and a.target_id = p_agent_id
     and a.role = 'agent_resource';
end;
$$;

revoke all on function public.agent_resource_add(uuid, text, uuid, text, jsonb) from public, anon;
revoke all on function public.agent_resource_remove(uuid, text, uuid) from public, anon;
grant execute on function public.agent_resource_add(uuid, text, uuid, text, jsonb) to authenticated;
grant execute on function public.agent_resource_remove(uuid, text, uuid) to authenticated;

-- Upgrade literal files already embedded in saved agent document blocks. This
-- intentionally preserves the original block (no behavioral deletion); it adds
-- the durable Agent Resource edge so processed text, RAG, and page verification
-- are available immediately. Both the canonical file_id shape and the historical
-- UUID-in-url workaround are recognized.
with embedded_files as (
  select distinct
    d.id as agent_id,
    d.organization_id,
    d.created_by,
    case
      when block ->> 'file_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (block ->> 'file_id')::uuid
      when block ->> 'url' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (block ->> 'url')::uuid
      else null
    end as file_id
  from agent.definition d
  cross join lateral jsonb_array_elements(coalesce(d.messages, '[]'::jsonb)) message
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(message -> 'content') = 'array' then message -> 'content'
      else '[]'::jsonb
    end
  ) block
  where block ->> 'type' = 'document'
)
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
)
select
  'file',
  ef.file_id,
  'agent',
  ef.agent_id,
  ef.organization_id,
  'agent_resource',
  f.file_name,
  jsonb_build_object('migrated_from', 'agent_document_block'),
  ef.created_by
from embedded_files ef
join files.files f
  on f.id = ef.file_id
 and f.organization_id = ef.organization_id
where ef.file_id is not null
  and ef.organization_id is not null
  and f.deleted_at is null
on conflict (source_type, source_id, target_type, target_id, role) do nothing;
