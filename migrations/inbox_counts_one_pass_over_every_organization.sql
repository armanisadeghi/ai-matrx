-- based-on: custom.inbox_counts(uuid) 032bedea3638a252d2b4c3dcd0200059c892b30f406da57b823405c1efffc398
--
-- THE HEADER BADGE'S COUNT, IN ONE PASS OVER ALL OF THE CALLER'S ORGANIZATIONS.
--
-- custom.inbox_counts (read on every page load for the shell's inbox badge) looped over every
-- organization the caller belongs to and called custom._inbox_items(org, me, false) once per
-- organization, then counted the rows. For admin@admin.com (47 organizations) that cost ~1 s live
-- (~6.3 s on the nightly clone, 83k buffer hits) although only 6 of the 47 organizations held a
-- single candidate item. The cost was a FIXED per-organization overhead, not the items: every
-- call re-planned _inbox_items' large RETURN QUERY (custom.record is HASH-partitioned by
-- organization_id into 16 partitions and the organization is a parameter, so PL/pgSQL keeps
-- choosing a freshly planned custom plan per call — forcing a generic plan alone took the clone
-- from 6.3 s to 2.6 s) and re-ran its person lookup, approval scan and assignment scan for
-- organizations with nothing in them.
--
-- Now the organization set is computed once, the approvals are read in one pass over all of it
-- (`organization_id = any(v_live)` prunes the hash partitions at executor start), and
-- _inbox_items runs only for an organization that can hold an assignment for the caller.
--
-- THE PREDICATE IS custom._inbox_items's, CLAUSE FOR CLAUSE, with p_include_decided = false and
-- p_user_id = the caller (never null here: a null principal returns before any read, as before).
-- _inbox_items itself is NOT changed — the inbox screen (custom.work_inbox) and the reminder tick
-- still read it. What is counted here, and why each clause is the same:
--   * An ARCHIVED organization has nothing waiting: _inbox_items returned nothing for it, so it
--     is left out of v_live (and, when named explicitly, still answers one row of zeros).
--   * Approvals: data_class 'work_approval', not deleted, state 'pending' (the only state
--     p_include_decided = false lists), no withdrawal (custom.work_approval_withdrawal is null),
--     not the caller's OWN person-origin request, and the caller is among
--     custom.work_approval_approvers(org, subject_id, approver_id) — the same call, per row.
--     Each surviving approval's inbox_state is the same CASE over custom.inbox_item_state:
--     cleared unless a newer version was written by somebody else; snoozed while snoozed_until >
--     custom._inbox_now(); else waiting ('closed' cannot arise: a decided approval is filtered
--     out above). `at` is the approval's created_at.
--   * Assignments are NOT re-derived: they are read from custom._inbox_items itself
--     (kind = 'assignment'), called only for the organizations where one can exist — the caller
--     has a person-record there and some open record names one of their person-records as its
--     Assignee. That is a superset of what its assignment half can return, so a skipped
--     organization is one where it would have answered nothing. (The assignment half's sight
--     check is a reader the T-13 row-column ratchet admits only in _inbox_items; keeping it
--     there keeps the ratchet's list from growing and keeps one copy of that rule.)
-- The display columns _inbox_items builds for approvals (titles, summaries, names) were computed
-- and thrown away by the count; they are not read here.
--
-- Proof (the nightly clone nwvvyzngqicrmnbuzauy, 2026-09-29), impersonating each caller as
-- `authenticated`: old vs new answered identically for all 1,398 users on the clone (null =
-- every organization) and for 176 explicit (user, organization) calls — 0 mismatches; plus 8
-- rolled-back scenarios cycling every inbox_item_state branch (snoozed, snooze ended, cleared at
-- the same version, cleared at an older version) over every item of admin@ and test@ — 0
-- mismatches. Best of 5, execution + planning: admin@admin.com (47 organizations) 598 -> 93 ms,
-- test@test.com (13; 38 pending approvals, each asking work_approval_approvers) 567 -> 430 ms,
-- an ordinary member of 4 organizations 154 -> 10 ms. Rule 27 (up -> inverse -> up) ran on the clone.
-- Inverse: migrations/inverse/inbox_counts_one_pass_over_every_organization_down.sql.

create or replace function custom.inbox_counts(p_organization_id uuid default null::uuid)
 returns table(organization_id uuid, organization_name text, waiting integer, snoozed integer, cleared integer, overdue integer, oldest_waiting_at timestamp with time zone)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_me   uuid := custom.query_principal();
  v_now  timestamptz;
  v_orgs uuid[];
  v_live uuid[];
begin
  -- THE BADGE'S NUMBER IS THE INBOX'S NUMBER: the same predicate as custom._inbox_items, counted
  -- in one pass over every organization (see the migration header for the clause-by-clause
  -- correspondence). Null counts every organization this person belongs to, because what waits
  -- on a person is the person's, not the selected organization's (ACCESS-IS-PERSONAL). An
  -- organization with nothing is not listed.
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.inbox_counts');
  end if;
  if v_me is null then
    return;
  end if;
  v_now := custom._inbox_now();

  select coalesce(array_agg(x.id), '{}') into v_orgs
    from (select p_organization_id as id where p_organization_id is not null
          union
          select m.organization_id from iam.organization_member m
            join iam.organizations g on g.id = m.organization_id and g.archived_at is null
           where p_organization_id is null and m.user_id = v_me) x;

  -- LANE ARCHIVED-ORG-WORK: an archived organization has nothing waiting in it.
  select coalesce(array_agg(o), '{}') into v_live
    from unnest(v_orgs) o
   where not exists (select 1 from iam.organizations g where g.id = o and g.archived_at is not null);

  return query
  with approvals as (
    select r.organization_id as org, r.id as item_id, r.created_at as at,
           null::text as due_state, r.updated_by as touched_by, r.version as item_version
      from custom.record r
     where r.organization_id = any(v_live)
       and r.data_class = 'work_approval'
       and r.deleted_at is null
       and coalesce(r.data ->> 'state', 'pending') = 'pending'
       and custom.work_approval_withdrawal(r.organization_id, r.data) is null
       and not (r.data ->> 'requested_by' = v_me::text
                and coalesce(r.data ->> 'origin', 'person') <> 'agent')
       and exists (select 1
                     from custom.work_approval_approvers(r.organization_id,
                            nullif(r.data ->> 'subject_id', '')::uuid,
                            nullif(r.data ->> 'approver_id', '')::uuid) a
                    where a.user_id = v_me)
  ),
  approvals_classified as (
    select a.org, a.at, a.due_state,
           case when st.cleared_at is not null
                     and not (a.item_version > coalesce(st.cleared_version, a.item_version)
                              and a.touched_by is distinct from v_me)
                  then 'cleared'
                when st.snoozed_until is not null and st.snoozed_until > v_now then 'snoozed'
                else 'waiting' end as inbox_state
      from approvals a
      left join custom.inbox_item_state st
        on st.organization_id = a.org
       and st.person_id = v_me
       and st.item_id = a.item_id
  ),
  -- ASSIGNMENTS ARE READ FROM custom._inbox_items ITSELF, only for the organizations where one can
  -- exist: the caller has a person-record there and some open record names one of their
  -- person-records as its Assignee. That is a superset of what _inbox_items' assignment half can
  -- return (it narrows to the earliest person-record, a table record, a non-terminal state and the
  -- caller's sight), so an organization skipped here is one where it would have answered nothing.
  assignment_orgs as materialized (
    select distinct p.organization_id as org
      from custom.record p
     where p.organization_id = any(v_live)
       and p.table_id = custom.person_kernel_id()
       and p.deleted_at is null
       and p.data ->> 'user_id' = v_me::text
       and exists (select 1
                     from custom.record r
                    where r.organization_id = p.organization_id
                      and r.deleted_at is null
                      and r.data_class = 'record'
                      and r.data ->> 'assignee' = p.id::text)
  ),
  assignments_classified as (
    select ao.org, x.at, x.due_state, x.inbox_state
      from assignment_orgs ao
      cross join lateral custom._inbox_items(ao.org, v_me, false) x
     where x.kind = 'assignment'
  ),
  classified as (
    select * from approvals_classified
    union all
    select * from assignments_classified
  )
  select o.id,
         (select g.name::text from iam.organizations g where g.id = o.id),
         (count(*) filter (where x.inbox_state = 'waiting'))::integer,
         (count(*) filter (where x.inbox_state = 'snoozed'))::integer,
         (count(*) filter (where x.inbox_state = 'cleared'))::integer,
         (count(*) filter (where x.inbox_state = 'waiting' and x.due_state = 'overdue'))::integer,
         min(x.at) filter (where x.inbox_state = 'waiting')
    from unnest(v_orgs) as o(id)
    left join classified x on x.org = o.id
   group by o.id
  having p_organization_id is not null
      or count(*) filter (where x.inbox_state in ('waiting', 'snoozed')) > 0;
end
$function$;
