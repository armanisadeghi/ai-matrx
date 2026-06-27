-- fix_get_task_associations_graveyard_refs.sql
-- Applied during the canonical-model cutover (via Supabase MCP apply_migration).
--
-- get_task_associations joined the legacy chat tables `messages` and
-- `conversations`, which the DB overhaul moved to the `graveyard` schema —
-- `public.messages` / `public.conversations` no longer exist, so the function
-- errored "relation messages does not exist" on EVERY call (a pre-existing bug
-- inherited verbatim by the canonical repoint). Surfaced by impersonation QA.
--
-- Fix: drop the two graveyarded-table joins. The return KEYS `messages` /
-- `conversations` are kept (as empty arrays) so the FE shape is unchanged; the
-- live `cx_message` / `cx_conversation` branches are untouched. Any lingering
-- source_type='message'/'conversation' edges (graveyarded legacy data) now fall
-- into the `other` bucket. Idempotent.

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

  -- Legacy chat tables (messages / conversations) are graveyarded; keep the keys
  -- as empty arrays for FE shape. Live equivalents are cx_message / cx_conversation.
  v_messages := '[]'::jsonb;
  v_conversations := '[]'::jsonb;

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
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'role',m.role,
      'preview',coalesce(a.label,left(case when jsonb_typeof(m.content)='array' then
          (select string_agg(coalesce(elem->>'text',''),' ') from jsonb_array_elements(m.content) elem)
        when jsonb_typeof(m.content)='string' then m.content #>> '{}' else m.content::text end,240)),
      'created_at',m.created_at) order by m.created_at desc),'[]'::jsonb)
    from platform.associations a join cx_message m on m.id = a.source_id
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='cx_message' into v_cx_messages;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',coalesce(c.title,'Untitled conversation')) order by c.updated_at desc),'[]'::jsonb)
    from platform.associations a join cx_conversation c on c.id = a.source_id
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='cx_conversation' into v_cx_conversations;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'message_id',a.source_id,
      'block_index',coalesce((a.metadata->>'block_index')::int,0),'preview',a.label)),'[]'::jsonb)
    from platform.associations a where a.target_type='task' and a.target_id = p_task_id and a.source_type='chat_block' into v_blocks;
  select coalesce(jsonb_agg(jsonb_build_object('entity_type',a.source_type,'entity_id',a.source_id,
      'label',a.label,'metadata',a.metadata)),'[]'::jsonb)
    from platform.associations a where a.target_type='task' and a.target_id = p_task_id
      and a.source_type not in ('note','user_file','cx_message','cx_conversation','chat_block') into v_other;

  return jsonb_build_object('task_id',p_task_id,'notes',v_notes,'files',v_files,'messages',v_messages,
    'cx_messages',v_cx_messages,'conversations',v_conversations,'cx_conversations',v_cx_conversations,
    'blocks',v_blocks,'other',v_other,'all',v_raw);
end;
$fn$;
