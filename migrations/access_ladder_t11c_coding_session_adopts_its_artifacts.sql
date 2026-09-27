-- lane: access-ladder T-11, step 0, part c: a coding session that arrives after its raw artifacts
-- adopts them. files._stamp_parent_record (part a) marks an artifact uploaded before its session
-- row exists as a child of a coding session with no id yet — its owner's alone; this names the id
-- the moment the session row lands. One table locked: chat.coding_session (trigger creation).
set local lock_timeout = '2s';

create or replace function files._adopt_coding_session_artifacts()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  update files.files f
     set parent_record_id = new.id
   where f.provider_session_id = new.provider_session_id
     and f.created_by = new.created_by
     and f.artifact_kind = 'coding_session_artifact'
     and coalesce(f.metadata ->> 'provider', 'claude_code') = new.provider
     and f.parent_record_type = 'coding_session'
     and f.parent_record_id is null;
  return null;
end;
$function$;

comment on function files._adopt_coding_session_artifacts() is
  'Access ladder T-11: when a coding session row is created, its already-uploaded raw artifacts '
  '(files.files, parent_record_type = coding_session, no id yet) take its id.';

create trigger _adopt_coding_session_artifacts
  after insert on chat.coding_session
  for each row execute function files._adopt_coding_session_artifacts();
