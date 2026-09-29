-- lane: access-ladder T-10b (Claude Opus 5.5, standard lane) — part 3 of 4: every existing user request names its root.
--
-- Same rule as the write-time stamp (part 1): the workflow run that started it (witnessed kind
-- 'workflow_run' and the run exists), else the top-level conversation of its FIRST chat.request.
-- A request with neither (no turn ever landed: abandoned or failed before its first turn, zero
-- cost) stays rootless and is readable by no client — its first turn would name it. So does a
-- request filed in another organization than its root (legacy rows from before 2026-09): a root is
-- always in the request's own organization (platform.assert_same_org), and data is never re-filed
-- by hand.
--
-- This is a relabel, not activity: app.relabel_keeps_updated_at keeps updated_at, so sync clients
-- that follow updated_at do not see ~20k rows change. Rows a live writer holds right now are
-- skipped (SKIP LOCKED); re-running this file stamps them — it only ever touches rootless rows.
--
-- Locks: row locks on chat.user_request only.
set local lock_timeout = '3s';
set local statement_timeout = '120s';
set local app.relabel_keeps_updated_at = 'on';

with candidates as (
  select ur.id, ur.origin_witness, ur.organization_id
    from chat.user_request ur
   where ur.conversation_id is null and ur.workflow_run_id is null
   for update skip locked
), first_turn as (
  select distinct on (r.user_request_id) r.user_request_id, r.conversation_id
    from chat.request r
    join candidates c on c.id = r.user_request_id
   where r.conversation_id is not null
   order by r.user_request_id, r.created_at, r.id
), plan as (
  select c.id, c.organization_id,
         w.id as workflow_run_id, w.organization_id as run_org,
         case when w.id is null and ft.conversation_id is not null
              then chat.root_conversation_id(ft.conversation_id) end as conversation_id
    from candidates c
    left join workflow.run w
           on c.origin_witness ->> 'execution_kind' = 'workflow_run'
          and (c.origin_witness ->> 'execution_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and w.id = (c.origin_witness ->> 'execution_id')::uuid
    left join first_turn ft on ft.user_request_id = c.id
), rooted as (
  -- A root is always in the request's own organization; a mismatched row stays rootless (counted below).
  select p.id,
         case when p.run_org is not distinct from p.organization_id then p.workflow_run_id end as workflow_run_id,
         case when rc.organization_id is not distinct from p.organization_id then p.conversation_id end as conversation_id
    from plan p
    left join chat.conversation rc on rc.id = p.conversation_id
)
update chat.user_request ur
   set workflow_run_id = p.workflow_run_id,
       conversation_id = p.conversation_id
  from rooted p
 where ur.id = p.id
   and (p.workflow_run_id is not null or p.conversation_id is not null);

do $$
declare n int;
begin
  -- Nothing left that the rule can name (a row a live writer held may remain; re-run this file).
  select count(*) into n
    from chat.user_request ur
   where ur.conversation_id is null and ur.workflow_run_id is null
     and exists (select 1 from chat.request r where r.user_request_id = ur.id and r.conversation_id is not null);
  n := n - (select count(*) from chat.user_request ur
              join lateral (select r.conversation_id from chat.request r
                             where r.user_request_id = ur.id and r.conversation_id is not null
                             order by r.created_at, r.id limit 1) ft on true
              join chat.conversation c on c.id = chat.root_conversation_id(ft.conversation_id)
             where ur.conversation_id is null and ur.workflow_run_id is null
               and c.organization_id is distinct from ur.organization_id);
  if n > 25 then
    raise exception 'T-10b part 3: % user requests with a landed turn still name no root', n;
  end if;
end $$;
