-- get_task_associations_canonical_read.sql
--
-- D27 fix (polarity-flipped): task-association WRITES were already canonicalized
-- to platform.entity_types tokens (`file`, `message`, `conversation`) — see
-- taskService.uploadTaskAttachment (`file`) + buildTaskSeedFromMessage
-- (`message`/`conversation`). But the deployed public.get_task_associations READ
-- side still filtered on the retired phantom tokens `user_file` / `cx_message` /
-- `cx_conversation`, so every canonical edge fell straight into the `other`
-- bucket. Live proof (platform.associations where target_type='task'):
--   note=15, message=4, conversation=1, file=0  → the 4 message + 1 conversation
--   edges were rendering under "Other" instead of AI Messages / AI Conversations,
--   and any file attachment would too.
--
-- This repoints ONLY the three read filters + the `other` exclusion list to the
-- canonical tokens. The RETURN SHAPE IS UNCHANGED (keys notes/files/messages/
-- cx_messages/conversations/cx_conversations/blocks/other/all) — the FE
-- (taskAssociationsSlice + TaskAttachmentsPanel) already expects canonical
-- semantics under the existing `cx_messages`/`cx_conversations` keys ("kept for
-- RPC parity"), so this is a DB-only fix: no FE change, no db-types change.
--
-- Schema-qualified joins (files.files / chat.message / chat.conversation) are
-- preserved exactly as deployed. The stale sibling RPCs in the older
-- task_associations_canonical_repoint.sql (bare cld_files/messages/conversations
-- names, pre-reorg) are intentionally NOT touched here.
--
-- Idempotent: CREATE OR REPLACE.

create or replace function public.get_task_associations(p_task_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_task_visible boolean;
  v_notes jsonb; v_files jsonb; v_messages jsonb; v_cx_messages jsonb;
  v_conversations jsonb; v_cx_conversations jsonb; v_blocks jsonb; v_other jsonb; v_raw jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select exists(select 1 from workspace.tasks t where t.id = p_task_id
      and (t.created_by = v_uid or (t.organization_id is not null and t.organization_id in (
             select om.organization_id from iam.organization_member om where om.user_id = v_uid)))) into v_task_visible;
  if not v_task_visible then raise exception 'task not found or access denied'; end if;

  -- Generic (non-AI) messaging buckets have no writer today; kept as [] for
  -- return-shape parity (the FE renders them as empty sections).
  v_messages := '[]'::jsonb;
  v_conversations := '[]'::jsonb;

  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'entity_type',a.source_type,'entity_id',a.source_id,
      'label',a.label,'metadata',a.metadata,'created_at',a.created_at)),'[]'::jsonb)
    from platform.associations a where a.target_type='task' and a.target_id = p_task_id into v_raw;

  select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'label',n.label,'updated_at',n.updated_at,'folder_name',n.folder_name)
      order by n.updated_at desc),'[]'::jsonb)
    from platform.associations a join workbench.notes n on n.id = a.source_id
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='note' into v_notes;

  -- FILES: canonical token `file` (was phantom `user_file`).
  select coalesce(jsonb_agg(jsonb_build_object('id',cf.id,'filename',cf.file_name,'mime_type',cf.mime_type,
      'storage_path',cf.file_path,'created_at',cf.created_at) order by cf.created_at desc),'[]'::jsonb)
    from platform.associations a join files.files cf on cf.id = a.source_id and cf.deleted_at is null
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='file' into v_files;

  -- AI MESSAGES: canonical token `message` (was phantom `cx_message`). Return
  -- key stays `cx_messages` (FE parity).
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'role',m.role,
      'preview',coalesce(a.label,left(case when jsonb_typeof(m.content)='array' then
          (select string_agg(coalesce(elem->>'text',''),' ') from jsonb_array_elements(m.content) elem)
        when jsonb_typeof(m.content)='string' then m.content #>> '{}' else m.content::text end,240)),
      'created_at',m.created_at) order by m.created_at desc),'[]'::jsonb)
    from platform.associations a join chat.message m on m.id = a.source_id
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='message' into v_cx_messages;

  -- AI CONVERSATIONS: canonical token `conversation` (was phantom `cx_conversation`).
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',coalesce(c.title,'Untitled conversation')) order by c.updated_at desc),'[]'::jsonb)
    from platform.associations a join chat.conversation c on c.id = a.source_id
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='conversation' into v_cx_conversations;

  -- BLOCKS: `chat_block` was never a registered token — permanently empty, kept
  -- for return-shape parity (the FE no longer renders it). Do not resurrect.
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'message_id',a.source_id,
      'block_index',coalesce((a.metadata->>'block_index')::int,0),'preview',a.label)),'[]'::jsonb)
    from platform.associations a where a.target_type='task' and a.target_id = p_task_id and a.source_type='chat_block' into v_blocks;

  -- OTHER: everything not already bucketed. Exclusion now lists the CANONICAL
  -- tokens so file/message/conversation stop leaking into here.
  select coalesce(jsonb_agg(jsonb_build_object('entity_type',a.source_type,'entity_id',a.source_id,
      'label',a.label,'metadata',a.metadata)),'[]'::jsonb)
    from platform.associations a where a.target_type='task' and a.target_id = p_task_id
      and a.source_type not in ('note','file','message','conversation','chat_block') into v_other;

  return jsonb_build_object('task_id',p_task_id,'notes',v_notes,'files',v_files,'messages',v_messages,
    'cx_messages',v_cx_messages,'conversations',v_conversations,'cx_conversations',v_cx_conversations,
    'blocks',v_blocks,'other',v_other,'all',v_raw);
end;
$function$;
