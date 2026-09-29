-- lane: access-ladder T-10b (Claude Opus 5.5, standard lane) — part 1 of 4: chat.user_request names ONE root.
--
-- Law: common-docs/policies/access-ladder.md, "Children inherit their parent". A user request (one
-- backend call: its cost, status, tokens) belongs to the thing it ran inside. Until now it named
-- nothing: it reached its conversations only through chat.request, and 1,049 of ~18.5k span more
-- than one top-level conversation (workflow runs, masterwork, child-agent mandates, podcasts), so
-- no single parent could be computed. It therefore carried a level of its own (Private).
--
-- The root, decided once and never moved:
--   1. workflow_run_id   — the workflow.run that started it (origin_witness.execution_kind =
--                          'workflow_run' AND that run exists; meet mandates reuse the kind with
--                          ids that are not runs, so existence is part of the rule);
--   2. conversation_id   — otherwise the TOP-LEVEL conversation of its first chat.request (the
--                          conversation it started in, walked up parent_conversation_id);
--   3. neither           — no request has landed yet (a row is born before its first turn); the
--                          first chat.request to land names it (part 2).
-- Podcast and mandate runs have no run table a request can name, so theirs is rule 2.
--
-- Writers: every writer (aidream chat, workflows, mandates, podcast, the matrx-local store) creates
-- the row through ONE door — the table — and the row is born BEFORE its conversation exists, so no
-- writer can name the conversation at insert. The stamp therefore lives at that door: this BEFORE
-- trigger (run or already-landed request) and part 2's AFTER INSERT trigger on chat.request.
-- Both are SECURITY DEFINER so a signed-in writer's own row security cannot hide the parent;
-- the component insert/update policies (part 4) still refuse a root the writer cannot edit.
--
-- A root is write-once: a later UPDATE that clears it keeps it (announced by WARNING — an ORM
-- writer that does not know the column must never orphan the row); moving it to a different
-- parent raises.
--
-- Locks: ACCESS EXCLUSIVE on chat.user_request for the column adds (metadata only, ~20k rows),
-- SHARE ROW EXCLUSIVE on chat.conversation and workflow.run for the NOT VALID foreign keys,
-- SHARE on chat.user_request for the two index builds (~20k rows, well under a second).
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── The top-level conversation of a conversation ─────────────────────────────────────────────
create or replace function chat.root_conversation_id(p_conversation_id uuid)
returns uuid
language sql
stable
set search_path to 'pg_catalog'
as $function$
  -- Up parent_conversation_id while the parent is in the SAME organization: a conversation never
  -- hands its turns to another organization's thread (sub-agent threads filed before 2026-09
  -- sometimes sit in another organization than their parent).
  with recursive up(id, parent, org, depth) as (
    select c.id, c.parent_conversation_id, c.organization_id, 0
      from chat.conversation c where c.id = p_conversation_id
    union all
    select p.id, p.parent_conversation_id, u.org, u.depth + 1
      from up u join chat.conversation p on p.id = u.parent
     where u.depth < 32 and p.organization_id is not distinct from u.org
  )
  select id from up order by depth desc limit 1
$function$;

comment on function chat.root_conversation_id(uuid) is
  'Access ladder T-10b: the top-most conversation above a conversation within its own organization (walks parent_conversation_id while the parent shares the organization, at most 32 steps). NULL when the conversation does not exist.';

-- ── The stamp at the user_request door ───────────────────────────────────────────────────────
create or replace function chat._user_request_names_its_root()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_first_conversation uuid;
  v_root uuid;
  v_root_org uuid;
begin
  if TG_OP = 'UPDATE' then
    -- Write-once. Clearing is refused quietly-but-loudly (a writer that does not know the column);
    -- re-parenting is a defect.
    if OLD.workflow_run_id is not null and NEW.workflow_run_id is null
       or OLD.conversation_id is not null and NEW.conversation_id is null then
      raise warning 'chat.user_request %: an update tried to clear its root (workflow_run_id %, conversation_id %); the root is kept — a user request never loses the record it belongs to (access ladder T-10b).',
        OLD.id, OLD.workflow_run_id, OLD.conversation_id;
      NEW.workflow_run_id := coalesce(NEW.workflow_run_id, OLD.workflow_run_id);
      NEW.conversation_id := coalesce(NEW.conversation_id, OLD.conversation_id);
    end if;
    if OLD.workflow_run_id is not null and NEW.workflow_run_id is distinct from OLD.workflow_run_id
       or OLD.conversation_id is not null and NEW.conversation_id is distinct from OLD.conversation_id
       or OLD.workflow_run_id is not null and NEW.conversation_id is not null
       or OLD.conversation_id is not null and NEW.workflow_run_id is not null then
      raise exception using
        errcode = '23514',
        message = format('User request %s already belongs to %s; it cannot be moved to another record.',
                         OLD.id,
                         coalesce('workflow run ' || OLD.workflow_run_id::text, 'conversation ' || OLD.conversation_id::text)),
        hint = 'A user request''s root is decided once, when it starts (access ladder T-10b).';
    end if;
    if NEW.workflow_run_id is not null or NEW.conversation_id is not null then
      return NEW;
    end if;
  elsif NEW.workflow_run_id is not null or NEW.conversation_id is not null then
    -- The writer named its root itself.
    return NEW;
  end if;

  -- 1. A workflow run started it (in this row's organization: a request never belongs to another
  --    organization's record — platform.assert_same_org below would refuse it).
  if NEW.origin_witness ->> 'execution_kind' = 'workflow_run'
     and (NEW.origin_witness ->> 'execution_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select w.id, w.organization_id into v_root, v_root_org
      from workflow.run w
     where w.id = (NEW.origin_witness ->> 'execution_id')::uuid;
    if v_root is not null then
      if v_root_org is not distinct from NEW.organization_id then
        NEW.workflow_run_id := v_root;
        return NEW;
      end if;
      raise warning 'chat.user_request %: its workflow run % is in organization %, the request in %; it is left without a root and opens to no client until the writer files it in the run''s organization (access ladder T-10b).',
        NEW.id, v_root, v_root_org, NEW.organization_id;
      return NEW;
    end if;
  end if;

  -- 2. Its first turn already landed (a writer may queue chat.request before this row: the
  --    foreign key is deferred).
  select r.conversation_id into v_first_conversation
    from chat.request r
   where r.user_request_id = NEW.id and r.conversation_id is not null
   order by r.created_at, r.id
   limit 1;
  if v_first_conversation is not null then
    v_root := chat.root_conversation_id(v_first_conversation);
    select c.organization_id into v_root_org from chat.conversation c where c.id = v_root;
    if v_root_org is not distinct from NEW.organization_id then
      NEW.conversation_id := v_root;
    else
      raise warning 'chat.user_request %: its conversation % is in organization %, the request in %; it is left without a root and opens to no client until the writer files it in the conversation''s organization (access ladder T-10b).',
        NEW.id, v_root, v_root_org, NEW.organization_id;
    end if;
  end if;

  -- 3. Otherwise its first chat.request names it (chat._request_names_its_user_requests_root).
  return NEW;
end
$function$;

comment on function chat._user_request_names_its_root() is
  'Access ladder T-10b: stamps chat.user_request''s one root at insert (the workflow.run that started it, else the top-level conversation of a turn that already landed) and keeps a root write-once.';

-- ── The columns ──────────────────────────────────────────────────────────────────────────────
alter table chat.user_request
  add column if not exists conversation_id uuid,
  add column if not exists workflow_run_id uuid;

comment on column chat.user_request.conversation_id is
  'Access ladder T-10b: the top-level conversation this request started in — its root owner unless a workflow run started it. Write-once; stamped at the table door.';
comment on column chat.user_request.workflow_run_id is
  'Access ladder T-10b: the workflow run that started this request — its root owner. Write-once; stamped at the table door.';

alter table chat.user_request
  add constraint user_request_conversation_id_fkey
    foreign key (conversation_id) references chat.conversation(id) on delete cascade not valid,
  add constraint user_request_workflow_run_id_fkey
    foreign key (workflow_run_id) references workflow.run(id) on delete cascade not valid,
  add constraint user_request_one_root
    check (num_nonnulls(conversation_id, workflow_run_id) <= 1) not valid;

create index if not exists user_request_conversation_id_idx
  on chat.user_request (conversation_id) where conversation_id is not null;
create index if not exists user_request_workflow_run_id_idx
  on chat.user_request (workflow_run_id) where workflow_run_id is not null;

-- Same-organization guards (provision_shape_guard): a root is always in the request's organization.
create or replace trigger trg_same_org_chat_user_request_conversation_id
  before insert or update of conversation_id on chat.user_request
  for each row execute function platform.assert_same_org('conversation_id', 'chat.conversation');
create or replace trigger trg_same_org_chat_user_request_workflow_run_id
  before insert or update of workflow_run_id on chat.user_request
  for each row execute function platform.assert_same_org('workflow_run_id', 'workflow.run');

create or replace trigger _names_its_root
  before insert or update of conversation_id, workflow_run_id on chat.user_request
  for each row execute function chat._user_request_names_its_root();

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'chat.user_request'::regclass and tgname = '_names_its_root') then
    raise exception 'T-10b part 1: the root stamp trigger is missing';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'chat' and table_name = 'user_request'
         and column_name in ('conversation_id','workflow_run_id')) <> 2 then
    raise exception 'T-10b part 1: root columns missing';
  end if;
end $$;
