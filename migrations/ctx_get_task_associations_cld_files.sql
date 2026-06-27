-- Fix get_task_associations files bucket: entity_type 'user_file' stores
-- cld_files.id (cloud-files canonical), not legacy user_files.id.
-- Without this join fix, uploads + associate_with_task succeed but the UI
-- shows zero attachments because the files array is always empty.

CREATE OR REPLACE FUNCTION public.get_task_associations(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_task_visible boolean;
  v_notes jsonb;
  v_files jsonb;
  v_messages jsonb;
  v_cx_messages jsonb;
  v_conversations jsonb;
  v_cx_conversations jsonb;
  v_blocks jsonb;
  v_other jsonb;
  v_raw jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select exists(
    select 1 from workspace.tasks t
    where t.id = p_task_id
      and (t.user_id = v_uid
           or (t.organization_id is not null and t.organization_id in (
             select om.organization_id from organization_members om where om.user_id = v_uid
           )))
  ) into v_task_visible;
  if not v_task_visible then
    raise exception 'task not found or access denied';
  end if;

  -- Raw: all associations for this task (full set the UI can fallback to)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'entity_type', a.entity_type,
      'entity_id', a.entity_id,
      'label', a.label,
      'metadata', a.metadata,
      'created_at', a.created_at
    )
  ), '[]'::jsonb)
  from ctx_task_associations a
  where a.task_id = p_task_id
  into v_raw;

  -- Notes
  select coalesce(jsonb_agg(
    jsonb_build_object('id', n.id, 'label', n.label, 'updated_at', n.updated_at, 'folder_name', n.folder_name)
    order by n.updated_at desc
  ), '[]'::jsonb)
  from ctx_task_associations a
  join notes n on n.id = a.entity_id
  where a.task_id = p_task_id and a.entity_type = 'note'
  into v_notes;

  -- Files — cld_files is canonical; legacy user_files rows still resolve.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', src.id,
      'filename', src.filename,
      'mime_type', src.mime_type,
      'storage_path', src.storage_path,
      'created_at', src.created_at
    ) order by src.created_at desc
  ), '[]'::jsonb)
  from ctx_task_associations a
  join lateral (
    select
      cf.id,
      cf.file_name as filename,
      cf.mime_type,
      cf.file_path as storage_path,
      cf.created_at
    from cld_files cf
    where cf.id = a.entity_id
      and cf.deleted_at is null
    union all
    select
      uf.id,
      uf.filename,
      uf.mime_type,
      uf.storage_path,
      uf.created_at
    from user_files uf
    where uf.id = a.entity_id
      and not exists (
        select 1 from cld_files cf2 where cf2.id = a.entity_id and cf2.deleted_at is null
      )
  ) src on true
  where a.task_id = p_task_id and a.entity_type = 'user_file'
  into v_files;

  -- Generic messages (non-AI messaging subsystem)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id, 'conversation_id', m.conversation_id,
      'preview', coalesce(a.label, left(m.content, 200)),
      'created_at', m.created_at
    ) order by m.created_at desc
  ), '[]'::jsonb)
  from ctx_task_associations a
  join messages m on m.id = a.entity_id
  where a.task_id = p_task_id and a.entity_type = 'message'
  into v_messages;

  -- cx_message (AI chat messages) — extract plain text from the jsonb `content`
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'conversation_id', m.conversation_id,
      'role', m.role,
      'preview', coalesce(
        a.label,
        left(
          case
            when jsonb_typeof(m.content) = 'array' then
              (select string_agg(coalesce(elem->>'text', ''), ' ') from jsonb_array_elements(m.content) elem)
            when jsonb_typeof(m.content) = 'string' then m.content #>> '{}'
            else m.content::text
          end,
          240
        )
      ),
      'created_at', m.created_at
    ) order by m.created_at desc
  ), '[]'::jsonb)
  from ctx_task_associations a
  join cx_message m on m.id = a.entity_id
  where a.task_id = p_task_id and a.entity_type = 'cx_message'
  into v_cx_messages;

  -- Generic conversations
  select coalesce(jsonb_agg(
    jsonb_build_object('id', c.id, 'name', c.name, 'type', c.type)
    order by c.created_at desc
  ), '[]'::jsonb)
  from ctx_task_associations a
  join conversations c on c.id = a.entity_id
  where a.task_id = p_task_id and a.entity_type = 'conversation'
  into v_conversations;

  -- cx_conversation (AI chat conversations)
  select coalesce(jsonb_agg(
    jsonb_build_object('id', c.id, 'title', coalesce(c.title, 'Untitled conversation'))
    order by c.updated_at desc
  ), '[]'::jsonb)
  from ctx_task_associations a
  join cx_conversation c on c.id = a.entity_id
  where a.task_id = p_task_id and a.entity_type = 'cx_conversation'
  into v_cx_conversations;

  -- Chat blocks (virtual — metadata carries block_index, entity_id is a message id)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'message_id', a.entity_id,
      'block_index', coalesce((a.metadata->>'block_index')::int, 0),
      'preview', a.label
    )
  ), '[]'::jsonb)
  from ctx_task_associations a
  where a.task_id = p_task_id and a.entity_type = 'chat_block'
  into v_blocks;

  -- Everything else
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'entity_type', a.entity_type,
      'entity_id', a.entity_id,
      'label', a.label,
      'metadata', a.metadata
    )
  ), '[]'::jsonb)
  from ctx_task_associations a
  where a.task_id = p_task_id
    and a.entity_type not in (
      'note','user_file','message','cx_message',
      'conversation','cx_conversation','chat_block'
    )
  into v_other;

  return jsonb_build_object(
    'task_id', p_task_id,
    'notes', v_notes,
    'files', v_files,
    'messages', v_messages,
    'cx_messages', v_cx_messages,
    'conversations', v_conversations,
    'cx_conversations', v_cx_conversations,
    'blocks', v_blocks,
    'other', v_other,
    'all', v_raw
  );
end;
$function$;
