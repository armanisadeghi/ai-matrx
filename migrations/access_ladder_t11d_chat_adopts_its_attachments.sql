-- lane: access-ladder T-11, step 0, part d: a file a person puts into their own AI chat becomes
-- that chat's child. An AI chat is Private; its attachments are the chat's (law: "Children inherit
-- their parent"). Today they are kept from coworkers only by visibility = 'personal', which T-11
-- step 4 stops treating as a lock on Organization tables. So when a message names a file
-- ("file_id": "<uuid>" anywhere in its content or user_content), and that file is the chat
-- owner's own, still marked personal, and not yet anyone's child, it becomes the chat's child.
-- A file already in the organization's view (internal / public) is left as it is: this keeps what
-- is private private and opens nothing.
-- One table locked: chat.message (trigger creation). The WHEN clause keeps every message without
-- a file reference off the function entirely.
set local lock_timeout = '2s';

create or replace function files._adopt_chat_attachment_ids(p_conversation_id uuid, p_file_ids uuid[])
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_owner uuid;
  v_n integer;
begin
  if p_conversation_id is null or coalesce(cardinality(p_file_ids), 0) = 0 then
    return 0;
  end if;
  select c.created_by into v_owner from chat.conversation c where c.id = p_conversation_id;
  if v_owner is null then
    return 0;
  end if;
  update files.files f
     set parent_record_type = 'conversation',
         parent_record_id = p_conversation_id
   where f.id = any(p_file_ids)
     and f.created_by = v_owner
     and f.visibility = 'personal'
     and f.parent_record_type is null;
  get diagnostics v_n = row_count;
  -- A variant of an adopted file shows the same thing: it follows its source.
  if v_n > 0 then
    update files.files v
       set parent_record_type = 'file',
           parent_record_id = v.parent_file_id
     where v.parent_file_id = any(p_file_ids)
       and v.parent_record_type is null
       and exists (select 1 from files.files s
                    where s.id = v.parent_file_id and s.parent_record_type = 'conversation');
  end if;
  return v_n;
end;
$function$;

comment on function files._adopt_chat_attachment_ids(uuid, uuid[]) is
  'Access ladder T-11: make the named files children of the AI chat when each is the chat owner''s '
  'own, marked personal, and nobody''s child yet (their variants follow). Returns how many files moved.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('files', '_adopt_chat_attachment_ids', 'p_conversation_id uuid, p_file_ids uuid[]',
   array['uuid'::regtype, 'uuid[]'::regtype]::oid[],
   'p_conversation_id: the chat whose owner is read (NULL or unknown -> 0, nothing changes). '
   'p_file_ids: only files created by that same owner, still personal and nobody''s child, move.',
   'access_ladder_t11d_chat_adopts_its_attachments.sql',
   'server_only: called only by the chat.message and platform.associations triggers (T-11); no client ever calls it.',
   false, false);

create or replace function files._adopt_chat_attachments_from_message()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_ids uuid[];
begin
  select array_agg(distinct m[1]::uuid) into v_ids
    from regexp_matches(coalesce(new.content::text, '') || ' ' || coalesce(new.user_content::text, ''),
                        '"file_id": ?"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"', 'g') m;
  perform files._adopt_chat_attachment_ids(new.conversation_id, v_ids);
  return null;
end;
$function$;

comment on function files._adopt_chat_attachments_from_message() is
  'Access ladder T-11: a chat message naming a file makes that file the chat''s child '
  '(files._adopt_chat_attachment_ids decides which files qualify).';

create trigger _adopt_chat_attachments
  after insert or update of content, user_content on chat.message
  for each row
  when (strpos(coalesce(new.content::text, '') || coalesce(new.user_content::text, ''), '"file_id"') > 0)
  execute function files._adopt_chat_attachments_from_message();
