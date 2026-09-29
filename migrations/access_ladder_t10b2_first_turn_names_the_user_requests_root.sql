-- lane: access-ladder T-10b (Claude Opus 5.5, standard lane) — part 2 of 4: the first turn names the root.
--
-- A user request is born before its first conversation exists, so the first chat.request to land
-- names the request's root: the TOP-LEVEL conversation above that turn's conversation. Only a
-- request with no root yet is touched (a workflow-run child keeps its run), and only when the
-- turn and the request share an organization or an author — pointing a turn at somebody else's
-- request can never adopt it into your conversation. SECURITY DEFINER: a signed-in writer's row
-- security must not hide the request row from the stamp.
--
-- Locks: SHARE ROW EXCLUSIVE on chat.request for the trigger creation, milliseconds.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function chat._request_names_its_user_requests_root()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_root uuid;
  v_root_org uuid;
  v_ur_org uuid;
  v_ur_author uuid;
begin
  if NEW.user_request_id is null or NEW.conversation_id is null then
    return null;
  end if;
  select ur.organization_id, ur.created_by into v_ur_org, v_ur_author
    from chat.user_request ur
   where ur.id = NEW.user_request_id and ur.conversation_id is null and ur.workflow_run_id is null;
  if not found then
    return null;  -- already rooted, or not written yet (its own insert trigger finds this turn)
  end if;
  if not (v_ur_org is not distinct from NEW.organization_id or v_ur_author = NEW.created_by) then
    return null;  -- somebody else's request: never adopted into this conversation
  end if;
  v_root := chat.root_conversation_id(NEW.conversation_id);
  select c.organization_id into v_root_org from chat.conversation c where c.id = v_root;
  if v_root_org is distinct from v_ur_org then
    raise warning 'chat.user_request %: its first turn is in conversation % (organization %), the request in %; it is left without a root and opens to no client until the writer files it in the conversation''s organization (access ladder T-10b).',
      NEW.user_request_id, v_root, v_root_org, v_ur_org;
    return null;
  end if;
  update chat.user_request ur
     set conversation_id = v_root
   where ur.id = NEW.user_request_id
     and ur.conversation_id is null
     and ur.workflow_run_id is null;
  return null;
end
$function$;

comment on function chat._request_names_its_user_requests_root() is
  'Access ladder T-10b: the first chat.request to land names its user request''s root (the top-level conversation above the turn) when the request has none; same organization or same author only.';

create or replace trigger _names_user_request_root
  after insert on chat.request
  for each row execute function chat._request_names_its_user_requests_root();

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'chat.request'::regclass and tgname = '_names_user_request_root') then
    raise exception 'T-10b part 2: the first-turn trigger is missing';
  end if;
end $$;
