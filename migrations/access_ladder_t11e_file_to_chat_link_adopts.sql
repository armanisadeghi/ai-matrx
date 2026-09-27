-- lane: access-ladder T-11, step 0, part e: the other way a file is put into an AI chat — a
-- platform.associations row from the file to the conversation — adopts it the same way
-- (files._adopt_chat_attachment_ids, part d). One table locked: platform.associations (trigger
-- creation); the WHEN clause keeps every other association off the function.
set local lock_timeout = '2s';

create or replace function files._adopt_chat_attachment_from_association()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform files._adopt_chat_attachment_ids(new.target_id, array[new.source_id]);
  return null;
end;
$function$;

comment on function files._adopt_chat_attachment_from_association() is
  'Access ladder T-11: a file-to-conversation association makes the file the chat''s child '
  '(files._adopt_chat_attachment_ids decides whether it qualifies).';

create trigger _adopt_chat_attachment
  after insert on platform.associations
  for each row
  when (new.source_type = 'file' and new.target_type = 'conversation' and new.deleted_at is null)
  execute function files._adopt_chat_attachment_from_association();
