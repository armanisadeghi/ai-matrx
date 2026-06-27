-- task_associations_canonical_repoint.sql
-- Applied during the canonical-model cutover (via Supabase MCP apply_migration).
--
-- Part 1 of the cutover: move the task-association RPCs off the legacy
-- ctx_task_associations junction onto the canonical platform.associations edge,
-- so the legacy table can be dropped in the final decommission wave.
--
-- DIRECTION: platform.associations enforces target_type ∈ {scope, scope_type,
-- project, task, context_item, thread, war_room, category} (the container-like
-- types). The canonical convention is therefore CONTENT = source, CONTAINER =
-- target. A task that holds a note / file / artifact / message is stored as
-- source = <entity> -> target = 'task'. (A task's own scope/project tags go the
-- other way — source = 'task' -> target = 'scope' — and stay on assoc_add.)
--
-- The FE (taskAssociationsSlice, AssociateTaskButton, canvas TasksArtifact,
-- TaskChecklist) is UNCHANGED — these RPCs keep their exact argument and return
-- shapes (legacy keys task_id / entity_type / entity_id). Task-visibility gating
-- (owner or org member) is preserved as-is. Idempotent.

-- ── DATA BACKFILL ─────────────────────────────────────────────────────────
-- Task associations were never mirrored into platform.associations. Copy them
-- now as <entity> -> 'task', keyed on the legacy row id so re-runs are safe.
insert into platform.associations (id, source_type, source_id, target_type, target_id, organization_id, label, metadata, created_by, created_at)
select ta.id, ta.entity_type, ta.entity_id, 'task', ta.task_id,
       (select t.organization_id from workspace.tasks t where t.id = ta.task_id),
       ta.label, coalesce(ta.metadata, '{}'::jsonb), ta.created_by, ta.created_at
  from public.ctx_task_associations ta
 where not exists (select 1 from platform.associations a
                   where a.source_type = ta.entity_type and a.source_id = ta.entity_id
                     and a.target_type = 'task' and a.target_id = ta.task_id)
on conflict (source_type, source_id, target_type, target_id) do nothing;

-- ── REPOINTED RPCs ────────────────────────────────────────────────────────

create or replace function public.associate_with_task(
  p_task_id uuid, p_entity_type text, p_entity_id uuid,
  p_label text default null, p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_task_visible boolean;
  v_id uuid; v_created_at timestamptz; v_label text; v_metadata jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select exists(select 1 from workspace.tasks t where t.id = p_task_id
      and (t.user_id = v_uid or (t.organization_id is not null and t.organization_id in (
            select om.organization_id from organization_members om where om.user_id = v_uid))))
    into v_task_visible;
  if not v_task_visible then raise exception 'task not found or access denied'; end if;
  select organization_id into v_org from workspace.tasks where id = p_task_id;

  insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, label, metadata, created_by)
  values (p_entity_type, p_entity_id, 'task', p_task_id, v_org, p_label, coalesce(p_metadata, '{}'::jsonb), v_uid)
  on conflict (source_type, source_id, target_type, target_id)
  do update set label = coalesce(excluded.label, platform.associations.label),
               metadata = platform.associations.metadata || coalesce(excluded.metadata, '{}'::jsonb)
  returning id, created_at, label, metadata into v_id, v_created_at, v_label, v_metadata;

  return jsonb_build_object('id', v_id, 'task_id', p_task_id, 'entity_type', p_entity_type,
    'entity_id', p_entity_id, 'label', v_label, 'metadata', v_metadata, 'created_by', v_uid, 'created_at', v_created_at);
end;
$fn$;

create or replace function public.dissociate_from_task(p_task_id uuid, p_entity_type text, p_entity_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_deleted int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  delete from platform.associations
   where source_type = p_entity_type and source_id = p_entity_id
     and target_type = 'task' and target_id = p_task_id;
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('deleted', v_deleted > 0);
end;
$fn$;

create or replace function public.get_tasks_for_entity(p_entity_type text, p_entity_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_tasks jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'task_id', t.id, 'title', t.title, 'status', t.status, 'priority', t.priority,
      'due_date', t.due_date, 'organization_id', t.organization_id, 'project_id', t.project_id,
      'association_id', a.id, 'associated_at', a.created_at) order by a.created_at desc), '[]'::jsonb)
    from platform.associations a
    join workspace.tasks t on t.id = a.target_id
   where a.target_type = 'task' and a.source_type = p_entity_type and a.source_id = p_entity_id
     and (t.user_id = v_uid or (t.organization_id is not null and t.organization_id in (
           select om.organization_id from organization_members om where om.user_id = v_uid)))
    into v_tasks;
  return jsonb_build_object('tasks', v_tasks);
end;
$fn$;

create or replace function public.create_task_with_association(
  p_title text, p_description text default null, p_project_id uuid default null,
  p_organization_id uuid default null, p_priority text default null, p_due_date date default null,
  p_scope_ids uuid[] default '{}'::uuid[], p_entity_type text default null, p_entity_id uuid default null,
  p_label text default null, p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_uid uuid := auth.uid();
  v_task workspace.tasks;
  v_assoc_json jsonb := null;
  v_scope_id uuid; v_priority task_priority;
  v_id uuid; v_created_at timestamptz;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  v_priority := case when p_priority in ('low','medium','high') then p_priority::task_priority else null end;

  insert into workspace.tasks (title, description, project_id, organization_id, priority, due_date, status, user_id)
  values (coalesce(nullif(trim(p_title), ''), 'Untitled task'), p_description, p_project_id, p_organization_id,
          v_priority, p_due_date, 'incomplete', v_uid)
  returning * into v_task;

  if p_entity_type is not null and p_entity_id is not null then
    insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, label, metadata, created_by)
    values (p_entity_type, p_entity_id, 'task', v_task.id, v_task.organization_id, p_label, coalesce(p_metadata, '{}'::jsonb), v_uid)
    on conflict (source_type, source_id, target_type, target_id) do nothing
    returning id, created_at into v_id, v_created_at;
    if v_id is not null then
      v_assoc_json := jsonb_build_object('id', v_id, 'task_id', v_task.id, 'entity_type', p_entity_type,
        'entity_id', p_entity_id, 'label', p_label, 'metadata', coalesce(p_metadata,'{}'::jsonb),
        'created_by', v_uid, 'created_at', v_created_at);
    end if;
  end if;

  if p_scope_ids is not null and array_length(p_scope_ids, 1) > 0 then
    foreach v_scope_id in array p_scope_ids loop
      perform public.assoc_add('task', v_task.id, 'scope', v_scope_id, p_organization_id);
    end loop;
  end if;

  return jsonb_build_object('task', to_jsonb(v_task), 'association', v_assoc_json);
end;
$fn$;

create or replace function public.create_tasks_bulk(
  p_items jsonb, p_project_id uuid default null, p_organization_id uuid default null,
  p_scope_ids uuid[] default '{}'::uuid[], p_entity_type text default null, p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_uid uuid := auth.uid();
  v_item jsonb; v_task workspace.tasks; v_tasks jsonb := '[]'::jsonb;
  v_scope_id uuid; v_priority task_priority;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'p_items must be a JSON array'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_priority := case when v_item->>'priority' in ('low','medium','high') then (v_item->>'priority')::task_priority else null end;

    insert into workspace.tasks (title, description, project_id, organization_id, priority, due_date, status, user_id)
    values (coalesce(nullif(trim(v_item->>'title'), ''), 'Untitled task'), v_item->>'description', p_project_id, p_organization_id,
            v_priority, case when v_item->>'due_date' is not null then (v_item->>'due_date')::date else null end,
            coalesce(v_item->>'status', 'incomplete'), v_uid)
    returning * into v_task;

    if p_entity_type is not null and p_entity_id is not null then
      insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, label, metadata, created_by)
      values (p_entity_type, p_entity_id, 'task', v_task.id, v_task.organization_id, v_item->>'title',
              coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('item_index', coalesce((v_item->>'index')::int, 0)), v_uid)
      on conflict (source_type, source_id, target_type, target_id) do nothing;
    end if;

    if p_scope_ids is not null and array_length(p_scope_ids, 1) > 0 then
      foreach v_scope_id in array p_scope_ids loop
        perform public.assoc_add('task', v_task.id, 'scope', v_scope_id, p_organization_id);
      end loop;
    end if;

    v_tasks := v_tasks || jsonb_build_array(to_jsonb(v_task));
  end loop;

  return jsonb_build_object('tasks', v_tasks);
end;
$fn$;

create or replace function public.get_task_associations(p_task_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare
  v_uid uuid := auth.uid();
  v_task_visible boolean;
  v_notes jsonb; v_files jsonb; v_messages jsonb; v_cx_messages jsonb;
  v_conversations jsonb; v_cx_conversations jsonb; v_blocks jsonb; v_other jsonb; v_raw jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select exists(select 1 from workspace.tasks t where t.id = p_task_id
      and (t.user_id = v_uid or (t.organization_id is not null and t.organization_id in (
             select om.organization_id from organization_members om where om.user_id = v_uid)))) into v_task_visible;
  if not v_task_visible then raise exception 'task not found or access denied'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'entity_type',a.source_type,'entity_id',a.source_id,
      'label',a.label,'metadata',a.metadata,'created_at',a.created_at)),'[]'::jsonb)
    from platform.associations a where a.target_type='task' and a.target_id = p_task_id into v_raw;
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'label',n.label,'updated_at',n.updated_at,'folder_name',n.folder_name)
      order by n.updated_at desc),'[]'::jsonb)
    from platform.associations a join notes n on n.id = a.source_id
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='note' into v_notes;
  select coalesce(jsonb_agg(jsonb_build_object('id',cf.id,'filename',cf.file_name,'mime_type',cf.mime_type,
      'storage_path',cf.file_path,'created_at',cf.created_at) order by cf.created_at desc),'[]'::jsonb)
    from platform.associations a join cld_files cf on cf.id = a.source_id and cf.deleted_at is null
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='user_file' into v_files;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,
      'preview',coalesce(a.label,left(m.content,200)),'created_at',m.created_at) order by m.created_at desc),'[]'::jsonb)
    from platform.associations a join messages m on m.id = a.source_id
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='message' into v_messages;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'role',m.role,
      'preview',coalesce(a.label,left(case when jsonb_typeof(m.content)='array' then
          (select string_agg(coalesce(elem->>'text',''),' ') from jsonb_array_elements(m.content) elem)
        when jsonb_typeof(m.content)='string' then m.content #>> '{}' else m.content::text end,240)),
      'created_at',m.created_at) order by m.created_at desc),'[]'::jsonb)
    from platform.associations a join cx_message m on m.id = a.source_id
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='cx_message' into v_cx_messages;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'type',c.type) order by c.created_at desc),'[]'::jsonb)
    from platform.associations a join conversations c on c.id = a.source_id
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='conversation' into v_conversations;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',coalesce(c.title,'Untitled conversation')) order by c.updated_at desc),'[]'::jsonb)
    from platform.associations a join cx_conversation c on c.id = a.source_id
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='cx_conversation' into v_cx_conversations;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'message_id',a.source_id,
      'block_index',coalesce((a.metadata->>'block_index')::int,0),'preview',a.label)),'[]'::jsonb)
    from platform.associations a where a.target_type='task' and a.target_id = p_task_id and a.source_type='chat_block' into v_blocks;
  select coalesce(jsonb_agg(jsonb_build_object('entity_type',a.source_type,'entity_id',a.source_id,
      'label',a.label,'metadata',a.metadata)),'[]'::jsonb)
    from platform.associations a where a.target_type='task' and a.target_id = p_task_id
      and a.source_type not in ('note','user_file','message','cx_message','conversation','cx_conversation','chat_block') into v_other;

  return jsonb_build_object('task_id',p_task_id,'notes',v_notes,'files',v_files,'messages',v_messages,
    'cx_messages',v_cx_messages,'conversations',v_conversations,'cx_conversations',v_cx_conversations,
    'blocks',v_blocks,'other',v_other,'all',v_raw);
end;
$fn$;
