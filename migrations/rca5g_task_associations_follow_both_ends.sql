-- RC-A5g — get_task_associations OPENS THE TASK AND EVERY LINKED ROW BY THE KERNEL, NOT BY MEMBERSHIP.
-- Register: common-docs/projects/rich-content-unification/REGISTER.md row RC-A5g.
-- based-on: public.get_task_associations(uuid) db978a83a92036cf538936e693504bcc47fe7a77210ae068f2f2779399a8beed
--
-- THE DEFECT (reproduced on production 2026-09-26 in a rolled-back block as test@test.com, a plain
-- member of Admin's Workspace): this SECURITY DEFINER door let the caller in when she was a member of
-- the task's organization, then joined every linked note, file, message and conversation with no
-- per-row check. So she read (a) the title of admin's PERSONAL note linked to an internal task
-- ("member_can_read_note=f", yet notes=[{"label":"Private: my diagnosis notes"}]), (b) a message's
-- first 240 characters and a conversation's title the same way, and (c) the linked items of admin's
-- PERSONAL task, because membership was the only question asked of the task itself.
--
-- THE FIX — DD-205's door rule, the one every assoc_* door already applies: the task opens only when
-- iam.has_access(task, viewer) (or the platform-admin lane), and every bucket, "all" and "other"
-- included, returns a linked row only when iam.has_access(its source, viewer). A linked item the
-- caller cannot open is omitted, never titled. Return shape unchanged.
-- Inverse: migrations/inverse/rca5g_task_associations_follow_both_ends_down.sql.

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.get_task_associations(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_task_visible boolean;
  v_notes jsonb; v_files jsonb; v_messages jsonb; v_cx_messages jsonb;
  v_conversations jsonb; v_cx_conversations jsonb; v_blocks jsonb; v_other jsonb; v_raw jsonb;
  v_admin boolean := public.is_platform_admin();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  -- RC-A5g: the task is opened by the kernel's own question (a personal task stays personal inside
  -- its organization), never by organization membership alone.
  select public.is_platform_admin()
      or iam.has_access('task', p_task_id, 'viewer'::public.permission_level)
    into v_task_visible;
  if not v_task_visible then raise exception 'task not found or access denied'; end if;

  -- Generic (non-AI) messaging buckets have no writer today; kept as [] for
  -- return-shape parity (the FE renders them as empty sections).
  v_messages := '[]'::jsonb;
  v_conversations := '[]'::jsonb;

  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'entity_type',a.source_type,'entity_id',a.source_id,
      'label',a.label,'metadata',a.metadata,'created_at',a.created_at)),'[]'::jsonb)
    from platform.associations_live a where a.target_type='task' and a.target_id = p_task_id
      and (v_admin or iam.has_access(a.source_type, a.source_id, 'viewer'::public.permission_level)) into v_raw;

  select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'label',n.label,'updated_at',n.updated_at,'folder_name',n.folder_name)
      order by n.updated_at desc),'[]'::jsonb)
    from platform.associations_live a join workbench.notes n on n.id = a.source_id
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='note'
      and (v_admin or iam.has_access(a.source_type, a.source_id, 'viewer'::public.permission_level)) into v_notes;

  -- FILES: canonical token `file` (was phantom `user_file`).
  select coalesce(jsonb_agg(jsonb_build_object('id',cf.id,'filename',cf.file_name,'mime_type',cf.mime_type,
      'storage_path',cf.file_path,'created_at',cf.created_at) order by cf.created_at desc),'[]'::jsonb)
    from platform.associations_live a join files.files cf on cf.id = a.source_id and cf.deleted_at is null
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='file'
      and (v_admin or iam.has_access(a.source_type, a.source_id, 'viewer'::public.permission_level)) into v_files;

  -- AI MESSAGES: canonical token `message` (was phantom `cx_message`). Return
  -- key stays `cx_messages` (FE parity).
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'role',m.role,
      'preview',coalesce(a.label,left(case when jsonb_typeof(m.content)='array' then
          (select string_agg(coalesce(elem->>'text',''),' ') from jsonb_array_elements(m.content) elem)
        when jsonb_typeof(m.content)='string' then m.content #>> '{}' else m.content::text end,240)),
      'created_at',m.created_at) order by m.created_at desc),'[]'::jsonb)
    from platform.associations_live a join chat.message m on m.id = a.source_id
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='message'
      and (v_admin or iam.has_access(a.source_type, a.source_id, 'viewer'::public.permission_level)) into v_cx_messages;

  -- AI CONVERSATIONS: canonical token `conversation` (was phantom `cx_conversation`).
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',coalesce(c.title,'Untitled conversation')) order by c.updated_at desc),'[]'::jsonb)
    from platform.associations_live a join chat.conversation c on c.id = a.source_id
    where a.target_type='task' and a.target_id = p_task_id and a.source_type='conversation'
      and (v_admin or iam.has_access(a.source_type, a.source_id, 'viewer'::public.permission_level)) into v_cx_conversations;

  -- BLOCKS: `chat_block` was never a registered token — permanently empty, kept
  -- for return-shape parity (the FE no longer renders it). Do not resurrect.
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'message_id',a.source_id,
      'block_index',coalesce((a.metadata->>'block_index')::int,0),'preview',a.label)),'[]'::jsonb)
    from platform.associations_live a where a.target_type='task' and a.target_id = p_task_id and a.source_type='chat_block'
      and (v_admin or iam.has_access(a.source_type, a.source_id, 'viewer'::public.permission_level)) into v_blocks;

  -- OTHER: everything not already bucketed. Exclusion now lists the CANONICAL
  -- tokens so file/message/conversation stop leaking into here.
  select coalesce(jsonb_agg(jsonb_build_object('entity_type',a.source_type,'entity_id',a.source_id,
      'label',a.label,'metadata',a.metadata)),'[]'::jsonb)
    from platform.associations_live a where a.target_type='task' and a.target_id = p_task_id
      and a.source_type not in ('note','file','message','conversation','chat_block')
      and (v_admin or iam.has_access(a.source_type, a.source_id, 'viewer'::public.permission_level)) into v_other;

  return jsonb_build_object('task_id',p_task_id,'notes',v_notes,'files',v_files,'messages',v_messages,
    'cx_messages',v_cx_messages,'conversations',v_conversations,'cx_conversations',v_cx_conversations,
    'blocks',v_blocks,'other',v_other,'all',v_raw);
end;
$function$
;
