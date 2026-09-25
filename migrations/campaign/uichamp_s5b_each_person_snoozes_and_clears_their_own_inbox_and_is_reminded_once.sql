-- LANE S5-PRIME-2 (UI-CHAMPIONS-PLAN S5', rows 43, 44, 52) — EACH PERSON SNOOZES AND CLEARS THEIR
-- OWN INBOX, AND IS REMINDED ONCE. Superhuman and Linear are the bar: snooze until a time, mark
-- done, both reversible, a snoozed item comes back at its time, and something left waiting too long
-- gets one nudge — never a second nudge, never a second notification system.
--
-- THE CENSUS (every place that lists or counts pending work for one person in the record store;
-- written up in common-docs/projects/data-doctrine-adoption/v5/PROGRESS-S5.md):
--   1. the inbox screen (records-ui ActionInbox)          -> custom.work_inbox
--   2. the shell badge (matrx-frontend useInboxCounts)     -> counted nothing from the store before
--                                                            this file; now custom.inbox_counts
--   3. the inbox's checklist group (MyChecklistSteps)      -> a second copy of rows work_inbox
--                                                            already lists (a step IS an
--                                                            assignment); now filtered by the door
--   4. reminders                                           -> none existed; now custom.inbox_remind_tick
--   5. digests (custom.agg_digest_*)                       -> summarise a saved VIEW's changes,
--                                                            never a person's pending work: nothing
--                                                            to repoint
--   6. the agent's records tool                            -> has no action that lists or counts a
--                                                            person's pending work: nothing to repoint
-- All of 1-4 now read ONE predicate: custom._inbox_items(org, person, include_decided).
--
-- WHAT THIS FILE LANDS
--   a. `custom.inbox_item_state` — one person's state about one inbox item (a work_approval record
--      or an assigned record): snoozed_until, cleared_at, reminded_at, woke_at. Keyed
--      (organization_id, person_id, item_id). Nothing about it is written on the approval or the
--      record: snoozing never changes a version, a Last touched, or a history row.
--   b. `custom._inbox_items` — THE ONE PREDICATE, for an explicit person, internal. The body of the
--      old work_inbox, plus the person's state and one word for where the item stands:
--      waiting | snoozed | cleared | closed. One correction on the way: a person's OWN pending
--      request (origin person) is no longer listed to them with Approve — the decide door has
--      always refused it ("You asked for this change, so somebody else approves it").
--   c. `custom.work_inbox` (drop, create, re-open the door): gains `p_view` (inbox | snoozed |
--      done, default inbox) and four columns at the end (snoozed_until, cleared_at, snoozed_count,
--      cleared_count). Every existing column keeps its position; every existing call still works.
--   d. Doors `custom.inbox_snooze(org, item, until)`, `inbox_unsnooze(org, item)`,
--      `inbox_clear(org, item)` (a decision still owed refuses: "This one needs a decision"),
--      `inbox_unclear(org, item)`, `inbox_counts(org default null)` — null counts every
--      organization the person belongs to (access is personal: the badge is the person's).
--   e. `custom.inbox_remind_tick()` on pg_cron every five minutes: a snoozed item whose time came
--      tells its person it is back; an item waiting longer than the organization's knob
--      `custom/inbox_reminder_after_days` (default 3, 0 = never) gets ONE reminder. Both go out
--      through custom.agg_deliver, the store's one sender into communication.notification, with a
--      unique dedupe key per person and item, so a replay never sends twice.
--   f. The knob, and `custom._inbox_now()` (the clock; a suite injects `custom.inbox_clock`).
--
-- INVERSE: migrations/inverse/uichamp_s5b_each_person_snoozes_and_clears_their_own_inbox_and_is_reminded_once_down.sql
--
-- chair-step: custom.work_inbox gains an argument (p_view text default 'inbox') and four columns, so it is dropped and recreated in this transaction and its platform.client_callable_door row takes the new identity; five new signed-in doors get their rows; custom.reopen_declared_doors() issues EXECUTE to authenticated. anon gains nothing.
-- based-on: custom.work_inbox(uuid, integer, integer, boolean) 6b074e65ba016c5744d8d8617f62d5e714af8b0b5625138315426182c4ca899e
-- lane: S5-PRIME-2

set lock_timeout = '30s';
set statement_timeout = '300s';

-- ── f. THE KNOB ─────────────────────────────────────────────────────────────────────────────────
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'inbox_reminder_after_days', '3'::jsonb, '3'::jsonb, 'integer', 'days', 0, 90,
   'Days something waits in a person''s inbox before they are reminded once',
   'An approval, an agent''s proposal or a piece of assigned work that has sat in somebody''s inbox, not snoozed and not cleared, for this many days gets ONE reminder through the notification system. Never a second one for the same item. 0 turns reminders off for this organization; a snoozed item still says when it is back.',
   'agent', 'Lane S5-PRIME-2 2026-09-24: the brief names 3 days — a Monday ask still undecided on Thursday is the one worth a nudge; Linear and Superhuman both resurface rather than nag.',
   date '2026-12-24', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

-- ── a. ONE PERSON'S STATE ───────────────────────────────────────────────────────────────────────
-- No foreign key to auth.users or iam.organizations, on purpose (the 2026-09-21 write-freeze
-- lesson: an FK to either takes SHARE ROW EXCLUSIVE on it). Reached only through the doors below.
create table custom.inbox_item_state (
  organization_id uuid        not null,
  person_id       uuid        not null,  -- the signed-in person (auth user id) whose state this is
  item_id         uuid        not null,  -- a work_approval record, or a record assigned to them
  snoozed_until   timestamptz,
  cleared_at      timestamptz,
  cleared_version integer,      -- the item's version when it was cleared: new activity is a newer one
  reminded_at     timestamptz,
  woke_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (organization_id, person_id, item_id)
);
create index inbox_item_state_snoozed_until_idx
  on custom.inbox_item_state (snoozed_until) where snoozed_until is not null and woke_at is null;
alter table custom.inbox_item_state enable row level security;
revoke all on table custom.inbox_item_state from public, anon, authenticated;
comment on table custom.inbox_item_state is
  'Lane S5-PRIME-2 (UI-CHAMPIONS S5''): one person''s own state about one inbox item — snoozed until, cleared (done), reminded, woke. Never written on the approval or the record. Written only by custom.inbox_snooze / inbox_unsnooze / inbox_clear / inbox_unclear and custom.inbox_remind_tick; read only through custom._inbox_items.';

-- ── f. THE CLOCK ────────────────────────────────────────────────────────────────────────────────
create or replace function custom._inbox_now()
 returns timestamptz
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  -- A suite injects a moment with set_config('custom.inbox_clock', ...). No client request can
  -- set it (PostgREST sets only request.* settings), and it only ever moves this person's own
  -- view of their own snoozes.
  select coalesce(nullif(current_setting('custom.inbox_clock', true), '')::timestamptz, now())
$function$;
revoke all on function custom._inbox_now() from public, anon, authenticated;

-- ── b. THE ONE PREDICATE ────────────────────────────────────────────────────────────────────────
create or replace function custom._inbox_items(p_organization_id uuid, p_user_id uuid,
                                               p_include_decided boolean default false)
 returns table(item_id uuid, kind text, origin text, title text, subject_id uuid, subject_kind text,
               summary text, state text, due_on timestamptz, due_state text, actionable boolean,
               requested_by uuid, requested_by_name text, at timestamptz, table_id uuid,
               table_name text, decided_by uuid, decided_by_name text, decided_at timestamptz,
               outcome text, snoozed_until timestamptz, cleared_at timestamptz,
               reminded_at timestamptz, woke_at timestamptz, inbox_state text, sort_at timestamptz,
               touched_by uuid, item_version integer)
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
-- NOT a definer, on purpose: it has no client EXECUTE and is only ever reached from inside the
-- definer doors below (and pg_cron's tick, which runs as the store's owner), so it runs with their
-- rights and needs no door of its own.
declare
  v_now    timestamptz := custom._inbox_now();
  v_person uuid;
begin
  -- WHAT IS WAITING ON ONE PERSON, asked for that person by id — so the inbox screen, the shell
  -- badge's count and the reminder tick cannot disagree: they are this one function.
  -- Approvals: the ones this person is among the approvers of (the same ladder
  -- custom.work_approval_may_decide asks). Assignments: open records whose Assignee is this
  -- person's person-record, that they can see (the same predicate as custom.work_list 'mine';
  -- the seat suite asserts the two agree). p_user_id null is the store owner's server lane,
  -- which sees every approval and has no assignments, exactly as work_inbox always answered it.
  if p_user_id is not null then
    select r.id into v_person
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = custom.person_kernel_id()
       and r.deleted_at is null
       and r.data ->> 'user_id' = p_user_id::text
     order by r.created_at
     limit 1;
  end if;

  return query
  with approvals as (
    select r.id, r.data as d, r.created_at, r.updated_by, r.version,
           case when coalesce(r.data ->> 'subject_kind', 'record') = 'table'
                  then nullif(r.data ->> 'subject_id', '')::uuid
                when lower(coalesce(r.data #>> '{change,kind}', '')) = 'table_add' then null
                else nullif(r.data ->> 'subject_table_id', '')::uuid end as tid,
           nullif(coalesce(r.data ->> 'decided_by', r.data ->> 'withdrawn_by'), '')::uuid as who
      from custom.record r
     where r.organization_id = p_organization_id
       and r.data_class = 'work_approval'
       and r.deleted_at is null
       and (coalesce(p_include_decided, false) or coalesce(r.data ->> 'state', 'pending') = 'pending')
       -- LANE S5-PRIME: A DECISION ABOUT AN ARCHIVED THING IS NEVER LISTED AS WAITING.
       and (coalesce(r.data ->> 'state', 'pending') <> 'pending'
            or custom.work_approval_withdrawal(p_organization_id, r.data) is null)
       -- A PERSON'S OWN REQUEST IS NOT WAITING ON THEM: custom.work_approval_decide refuses the
       -- requester of a person's ask ("You asked for this change, so somebody else approves it"),
       -- so listing it with Approve would be a control that fails when pressed. An agent's
       -- request, which the decide door lets its person decide, stays.
       and not (p_user_id is not null
                and coalesce(r.data ->> 'state', 'pending') = 'pending'
                and r.data ->> 'requested_by' = p_user_id::text
                and coalesce(r.data ->> 'origin', 'person') <> 'agent')
       and case when p_user_id is null then custom.query_is_store_owner()
                else exists (select 1
                               from custom.work_approval_approvers(p_organization_id,
                                      nullif(r.data ->> 'subject_id', '')::uuid,
                                      nullif(r.data ->> 'approver_id', '')::uuid) a
                              where a.user_id = p_user_id) end
  ),
  items as (
    select a.id as item_id,
           case when coalesce(a.d ->> 'origin', 'person') = 'agent' then 'proposal' else 'approval' end as kind,
           coalesce(a.d ->> 'origin', 'person') as origin,
           case when (a.d -> 'change') ->> 'kind' = 'field_add'
                then format('Add %s to %s',
                            coalesce(nullif(a.d #>> '{change,field,label}', ''),
                                     nullif(a.d #>> '{change,field,key}', ''), 'a column'),
                            coalesce(a.d ->> 'subject_title', 'a table'))
                else format('Change %s', coalesce(a.d ->> 'subject_title', 'a record')) end as title,
           nullif(a.d ->> 'subject_id', '')::uuid as subject_id,
           coalesce(a.d ->> 'subject_kind', 'record') as subject_kind,
           coalesce(nullif(a.d ->> 'note', ''),
                    case when (a.d -> 'change') ->> 'kind' = 'field_add'
                         then 'A new column on a table that already existed.'
                         else (select string_agg(k, ', ' order by k)
                                 from jsonb_object_keys(a.d #> '{change,patch}') k) end) as summary,
           coalesce(a.d ->> 'state', 'pending') as state,
           null::timestamptz as due_on,
           null::text as due_state,
           coalesce(a.d ->> 'state', 'pending') = 'pending' as actionable,
           nullif(a.d ->> 'requested_by', '')::uuid as requested_by,
           (select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                            nullif(u.raw_user_meta_data ->> 'full_name', ''),
                            split_part(u.email::text, '@', 1))::text
              from auth.users u where u.id = nullif(a.d ->> 'requested_by', '')::uuid) as requested_by_name,
           a.created_at as at,
           a.tid as table_id,
           (select coalesce(nullif(t.data ->> 'name', ''), 'a table')
              from custom.record t where t.organization_id = p_organization_id and t.id = a.tid) as table_name,
           case when coalesce(a.d ->> 'state', 'pending') <> 'pending' then a.who end as decided_by,
           case when coalesce(a.d ->> 'state', 'pending') <> 'pending' then
             (select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                              nullif(u.raw_user_meta_data ->> 'full_name', ''),
                              split_part(u.email::text, '@', 1))::text
                from auth.users u where u.id = a.who) end as decided_by_name,
           case when coalesce(a.d ->> 'state', 'pending') <> 'pending'
                then nullif(a.d ->> 'decided_at', '')::timestamptz end as decided_at,
           case when coalesce(a.d ->> 'state', 'pending') <> 'pending'
                then coalesce(nullif(a.d ->> 'outcome', ''), nullif(a.d ->> 'withdrawn_reason', '')) end as outcome,
           coalesce(a.d ->> 'state', 'pending') <> 'pending' as closed,
           a.updated_by as touched_by,
           a.version as item_version
      from approvals a
    union all
    select r.id, 'assignment', 'person',
           coalesce(custom._card_words(r.organization_id, r.data ->> coalesce(t.data ->> 'title_field', 'name'),
                                       lower(coalesce(nullif(t.data ->> 'label_singular', ''), 'record'))),
                    'Untitled'),
           r.id, 'record',
           format('%s · %s', coalesce(t.data ->> 'name', 'a table'), coalesce(s.data ->> 'name', 'no state')),
           coalesce(s.data ->> 'name', 'open'),
           nullif(r.data ->> 'due_date', '')::timestamptz,
           case when coalesce((s.data ->> 'terminal')::boolean, false) then 'finished'
                when nullif(r.data ->> 'due_date', '') is null                        then 'undated'
                when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) then 'overdue'
                when (r.data ->> 'due_date')::timestamptz <  date_trunc('day', now()) + interval '1 day'
                                                                                      then 'due_today'
                else 'scheduled' end,
           true,
           r.updated_by,
           (select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                            nullif(u.raw_user_meta_data ->> 'full_name', ''),
                            split_part(u.email::text, '@', 1))::text
              from auth.users u where u.id = r.updated_by),
           r.updated_at,
           r.table_id, t.data ->> 'name',
           null::uuid, null::text, null::timestamptz, null::text,
           coalesce((s.data ->> 'terminal')::boolean, false),
           r.updated_by,
           r.version
      from custom.record r
      join custom.record t
        on t.organization_id = r.organization_id
       and t.id = r.table_id
       and t.table_id = custom.table_kernel_id()
      left join custom.record s
        on s.organization_id = r.organization_id
       and s.id = custom.work_state_id(r.organization_id, r.table_id, r.data ->> 'status')
       and s.deleted_at is null
     where v_person is not null
       and r.organization_id = p_organization_id
       and r.deleted_at is null
       and r.data_class = 'record'
       -- compared as text: a hand-typed name in somebody's Assignee must not take the inbox down
       and r.data ->> 'assignee' = v_person::text
       and (coalesce(p_include_decided, false)
            or not coalesce((s.data ->> 'terminal')::boolean, false))
       and custom.has_visibility(p_user_id, 'record', r.id, 'viewer'::public.permission_level)
  )
  select i.item_id, i.kind, i.origin, i.title, i.subject_id, i.subject_kind, i.summary, i.state,
         i.due_on, i.due_state, i.actionable, i.requested_by, i.requested_by_name, i.at,
         i.table_id, i.table_name, i.decided_by, i.decided_by_name, i.decided_at, i.outcome,
         st.snoozed_until, st.cleared_at, st.reminded_at, st.woke_at,
         case when i.closed then 'closed'
              -- DONE STAYS DONE until somebody ELSE changes it (Superhuman: new activity brings a
              -- thread back) — a newer version of the item than the one she cleared, written by
              -- someone else. Her own edit to her own assignment does not.
              when st.cleared_at is not null
                   and not (i.item_version > coalesce(st.cleared_version, i.item_version)
                            and i.touched_by is distinct from p_user_id)
                then 'cleared'
              when st.snoozed_until is not null and st.snoozed_until > v_now then 'snoozed'
              else 'waiting' end,
         -- A SNOOZED ITEM COMES BACK AT THE TOP: it sorts by the moment it returned.
         case when st.snoozed_until is not null and st.snoozed_until <= v_now
                   and st.snoozed_until > i.at then st.snoozed_until
              else i.at end,
         i.touched_by, i.item_version
    from items i
    left join custom.inbox_item_state st
      on st.organization_id = p_organization_id
     and st.person_id = p_user_id
     and st.item_id = i.item_id;
end
$function$;
revoke all on function custom._inbox_items(uuid, uuid, boolean) from public, anon, authenticated;
comment on function custom._inbox_items(uuid, uuid, boolean) is
  'Lane S5-PRIME-2: THE ONE PREDICATE for what is waiting on one person in one organization, with their own snooze/clear state and one word for where each item stands (waiting | snoozed | cleared | closed). custom.work_inbox, custom.inbox_counts, the inbox_* doors and custom.inbox_remind_tick all read it. Internal: no client EXECUTE.';

-- ── c. THE INBOX DOOR ───────────────────────────────────────────────────────────────────────────
drop function if exists custom.work_inbox(uuid, integer, integer, boolean);
create function custom.work_inbox(p_organization_id uuid, p_limit integer default 50,
                                  p_offset integer default 0, p_include_decided boolean default false,
                                  p_view text default 'inbox')
 returns table(item_id uuid, kind text, origin text, title text, subject_id uuid, subject_kind text,
               summary text, state text, due_on timestamptz, due_state text, actionable boolean,
               requested_by uuid, requested_by_name text, at timestamptz, table_id uuid,
               table_name text, decided_by uuid, decided_by_name text, decided_at timestamptz,
               outcome text, snoozed_until timestamptz, cleared_at timestamptz,
               snoozed_count integer, cleared_count integer)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_me   uuid := custom.query_principal();
  v_view text := lower(coalesce(nullif(btrim(p_view), ''), 'inbox'));
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_inbox');
  if v_view not in ('inbox', 'snoozed', 'done') then
    raise exception 'The inbox has three views: inbox, snoozed and done, and "%" is none of them.', p_view
      using errcode = '22023',
            hint = '`inbox` is what is waiting on you now, `snoozed` is what you put off until a time, `done` is what you cleared.';
  end if;
  if v_me is null and not custom.query_is_store_owner() then
    return;
  end if;

  return query
  with x as (
    select * from custom._inbox_items(p_organization_id, v_me, coalesce(p_include_decided, false))
  ),
  n as (
    select (count(*) filter (where x.inbox_state = 'snoozed'))::integer as snoozed,
           (count(*) filter (where x.inbox_state = 'cleared'))::integer as cleared
      from x
  )
  select x.item_id, x.kind, x.origin, x.title, x.subject_id, x.subject_kind, x.summary, x.state,
         x.due_on, x.due_state, x.actionable, x.requested_by, x.requested_by_name, x.at,
         x.table_id, x.table_name, x.decided_by, x.decided_by_name, x.decided_at, x.outcome,
         case when x.inbox_state = 'snoozed' then x.snoozed_until end,
         case when x.inbox_state = 'cleared' then x.cleared_at end,
         n.snoozed, n.cleared
    from x cross join n
   where case v_view
           when 'inbox'   then x.inbox_state = 'waiting'
                               or (coalesce(p_include_decided, false) and x.inbox_state = 'closed')
           when 'snoozed' then x.inbox_state = 'snoozed'
           else                x.inbox_state = 'cleared'
         end
   order by case when v_view = 'snoozed' then x.snoozed_until end asc nulls last,
            case when v_view = 'done' then x.cleared_at end desc nulls last,
            x.actionable desc, x.state nulls last, x.sort_at desc
   limit custom.page_size(p_organization_id, 'custom.work_inbox', p_limit, 50, 200)
  offset greatest(0, coalesce(p_offset, 0));
end
$function$;
comment on function custom.work_inbox(uuid, integer, integer, boolean, text) is
  'PRODUCTS.md row 6: ONE inbox holding what is assigned to me, what is waiting on my approval, and the agent''s proposals. Lane S5-PRIME: never lists a pending decision whose subject is archived; closed rows say who decided and when. Lane S5-PRIME-2: reads custom._inbox_items; p_view inbox (default) hides what I snoozed or cleared, snoozed lists what I put off (soonest first), done lists what I cleared; every row carries snoozed_count and cleared_count.';

-- ── d. THE DOORS A PERSON USES ──────────────────────────────────────────────────────────────────
create or replace function custom.inbox_snooze(p_organization_id uuid, p_item_id uuid, p_until timestamptz)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_me  uuid := custom.query_principal();
  v_now timestamptz := custom._inbox_now();
  v_it  record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.inbox_snooze');
  if v_me is null then
    raise exception 'Snoozing is something a signed-in person does to their own inbox.'
      using errcode = '42501';
  end if;
  if p_until is null then
    raise exception 'Say until when: a snooze without a time would never come back.'
      using errcode = '22004';
  end if;
  if p_until <= v_now then
    raise exception 'That time has already passed, so there is nothing to snooze it until.'
      using errcode = '22023', hint = 'Pick a moment later than now: later today, tomorrow morning, next week.';
  end if;
  if p_until > v_now + interval '366 days' then
    raise exception 'A snooze can last at most a year; past that it is not waiting, it is gone.'
      using errcode = '22023', hint = 'Clear it instead, if it is not yours to do.';
  end if;

  select * into v_it from custom._inbox_items(p_organization_id, v_me, true) i where i.item_id = p_item_id;
  if v_it.item_id is null then
    raise exception 'There is nothing in your inbox with that id, so there is nothing to snooze.'
      using errcode = 'P0002';
  end if;
  if v_it.inbox_state = 'closed' then
    raise exception '"%" is already %, so there is nothing left to wait on.', v_it.title,
      case when v_it.kind = 'assignment' then 'finished' else 'decided' end
      using errcode = '55000';
  end if;

  insert into custom.inbox_item_state as s (organization_id, person_id, item_id, snoozed_until, cleared_at, woke_at, updated_at)
  values (p_organization_id, v_me, p_item_id, p_until, null, null, now())
  on conflict (organization_id, person_id, item_id)
  do update set snoozed_until = excluded.snoozed_until, cleared_at = null, woke_at = null, updated_at = now();

  return jsonb_build_object('item_id', p_item_id, 'snoozed_until', p_until, 'state', 'snoozed',
    'sentence', format('"%s" is snoozed. It comes back to the top of your inbox then, and only you stop seeing it until it does.', v_it.title));
end
$function$;

create or replace function custom.inbox_unsnooze(p_organization_id uuid, p_item_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_me  uuid := custom.query_principal();
  v_n   integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.inbox_unsnooze');
  if v_me is null then
    raise exception 'Snoozing is something a signed-in person does to their own inbox.'
      using errcode = '42501';
  end if;
  -- ONLY EVER THIS PERSON'S OWN ROW, so an id that is not theirs changes nothing and says so.
  update custom.inbox_item_state s
     set snoozed_until = null, woke_at = null, updated_at = now()
   where s.organization_id = p_organization_id and s.person_id = v_me and s.item_id = p_item_id
     and s.snoozed_until is not null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('item_id', p_item_id, 'changed', v_n > 0, 'state', 'waiting',
    'sentence', case when v_n > 0 then 'It is back in your inbox now.'
                     else 'That was not snoozed, so nothing changed.' end);
end
$function$;

create or replace function custom.inbox_clear(p_organization_id uuid, p_item_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_me  uuid := custom.query_principal();
  v_now timestamptz := custom._inbox_now();
  v_it  record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.inbox_clear');
  if v_me is null then
    raise exception 'Clearing is something a signed-in person does to their own inbox.'
      using errcode = '42501';
  end if;
  select * into v_it from custom._inbox_items(p_organization_id, v_me, true) i where i.item_id = p_item_id;
  if v_it.item_id is null then
    raise exception 'There is nothing in your inbox with that id, so there is nothing to clear.'
      using errcode = 'P0002';
  end if;
  if v_it.kind <> 'assignment' and v_it.state = 'pending' then
    raise exception 'This one needs a decision: approve or decline "%", or snooze it until you can.', v_it.title
      using errcode = '55000',
            hint = 'Clearing hides a row from your own inbox. A request somebody is waiting on is not yours to hide; deciding it is what takes it away.';
  end if;

  insert into custom.inbox_item_state as s (organization_id, person_id, item_id, snoozed_until, cleared_at, cleared_version, updated_at)
  values (p_organization_id, v_me, p_item_id, null, v_now, v_it.item_version, now())
  on conflict (organization_id, person_id, item_id)
  do update set cleared_at = excluded.cleared_at, cleared_version = excluded.cleared_version,
                snoozed_until = null, updated_at = now();

  return jsonb_build_object('item_id', p_item_id, 'cleared_at', v_now, 'state', 'cleared',
    'sentence', format('"%s" is cleared from your inbox. Nothing about it changed; it comes back if somebody else changes it.', v_it.title));
end
$function$;

create or replace function custom.inbox_unclear(p_organization_id uuid, p_item_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_me  uuid := custom.query_principal();
  v_n   integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.inbox_unclear');
  if v_me is null then
    raise exception 'Clearing is something a signed-in person does to their own inbox.'
      using errcode = '42501';
  end if;
  update custom.inbox_item_state s
     set cleared_at = null, cleared_version = null, updated_at = now()
   where s.organization_id = p_organization_id and s.person_id = v_me and s.item_id = p_item_id
     and s.cleared_at is not null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('item_id', p_item_id, 'changed', v_n > 0, 'state', 'waiting',
    'sentence', case when v_n > 0 then 'It is back in your inbox.'
                     else 'That was not cleared, so nothing changed.' end);
end
$function$;

create or replace function custom.inbox_counts(p_organization_id uuid default null)
 returns table(organization_id uuid, organization_name text, waiting integer, snoozed integer,
               cleared integer, overdue integer, oldest_waiting_at timestamptz)
 language plpgsql
 stable security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_me uuid := custom.query_principal();
  o    uuid;
begin
  -- THE BADGE'S NUMBER IS THE INBOX'S NUMBER: the same predicate, counted. Null counts every
  -- organization this person belongs to, because what waits on a person is the person's, not the
  -- selected organization's (ACCESS-IS-PERSONAL). An organization with nothing is not listed.
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.inbox_counts');
  end if;
  if v_me is null then
    return;
  end if;
  for o in
    select p_organization_id where p_organization_id is not null
    union
    select m.organization_id from iam.organization_member m
      join iam.organizations g on g.id = m.organization_id and g.archived_at is null
     where p_organization_id is null and m.user_id = v_me
  loop
    return query
      select o,
             (select g.name::text from iam.organizations g where g.id = o),
             (count(*) filter (where x.inbox_state = 'waiting'))::integer,
             (count(*) filter (where x.inbox_state = 'snoozed'))::integer,
             (count(*) filter (where x.inbox_state = 'cleared'))::integer,
             (count(*) filter (where x.inbox_state = 'waiting' and x.due_state = 'overdue'))::integer,
             min(x.at) filter (where x.inbox_state = 'waiting')
        from custom._inbox_items(o, v_me, false) x
      having p_organization_id is not null
          or count(*) filter (where x.inbox_state in ('waiting', 'snoozed')) > 0;
  end loop;
end
$function$;

-- ── e. REMINDERS ────────────────────────────────────────────────────────────────────────────────
create or replace function custom.inbox_remind_tick()
 returns jsonb
 language plpgsql
 set search_path to 'pg_catalog'
as $function$
declare
  v_now      timestamptz := custom._inbox_now();
  p          record;
  x          record;
  v_days     integer;
  v_id       uuid;
  v_reminded integer := 0;
  v_back     integer := 0;
begin
  -- WHO MIGHT BE OWED SOMETHING: approvers of a pending ask at least a day old, assignees of open
  -- work untouched for at least a day, and anybody whose snooze has come due. Each is then asked
  -- through custom._inbox_items — the SAME predicate their inbox and badge read — so a reminder
  -- is never about something they cannot see, have cleared, or have snoozed.
  for p in
    select distinct c.organization_id, c.user_id from (
      select a.organization_id, ap.user_id
        from custom.record a
        cross join lateral custom.work_approval_approvers(a.organization_id,
                     nullif(a.data ->> 'subject_id', '')::uuid,
                     nullif(a.data ->> 'approver_id', '')::uuid) ap
       where a.data_class = 'work_approval' and a.deleted_at is null
         and coalesce(a.data ->> 'state', 'pending') = 'pending'
         and a.created_at < v_now - interval '1 day'
      union
      select r.organization_id,
             case when pr.data ->> 'user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (pr.data ->> 'user_id')::uuid end
        from custom.record r
        join custom.record pr
          on pr.organization_id = r.organization_id
         and pr.id::text = r.data ->> 'assignee'
         and pr.table_id = custom.person_kernel_id()
       where r.data_class = 'record' and r.deleted_at is null
         and nullif(r.data ->> 'assignee', '') is not null
         and r.updated_at < v_now - interval '1 day'
      union
      select s.organization_id, s.person_id
        from custom.inbox_item_state s
       where s.snoozed_until is not null and s.snoozed_until <= v_now and s.woke_at is null
    ) c
    where c.user_id is not null
  loop
    begin
      v_days := coalesce((platform.knob_resolve('custom', 'inbox_reminder_after_days', p.organization_id) #>> '{}')::integer, 3);
      for x in
        select * from custom._inbox_items(p.organization_id, p.user_id, false) i
         where i.inbox_state = 'waiting'
           and ((i.snoozed_until is not null and i.snoozed_until <= v_now and i.woke_at is null)
                or (i.reminded_at is null and v_days > 0 and i.at < v_now - make_interval(days => v_days)))
      loop
        if x.snoozed_until is not null and x.snoozed_until <= v_now and x.woke_at is null then
          -- A SNOOZE THAT CAME DUE says so once. It counts as the item's reminder.
          v_id := custom.agg_deliver(p.organization_id, null, x.item_id, 'in_app', p.user_id,
                    'custom.inbox.snooze_ended',
                    format('Back in your inbox: %s', x.title),
                    'You snoozed this until now. It is at the top of your inbox.',
                    jsonb_build_object('source', 'inbox', 'reason', 'snooze_ended', 'item_id', x.item_id,
                                       'kind', x.kind, 'table_id', x.table_id, 'snoozed_until', x.snoozed_until),
                    format('inbox:%s:back:%s', p.user_id, extract(epoch from x.snoozed_until)::bigint));
          update custom.inbox_item_state s
             set woke_at = v_now, reminded_at = coalesce(s.reminded_at, v_now), updated_at = now()
           where s.organization_id = p.organization_id and s.person_id = p.user_id and s.item_id = x.item_id;
          v_back := v_back + 1;
        else
          -- ONE REMINDER, EVER, per person and item: the stamp here and the notification's unique
          -- dedupe key both say so.
          v_id := custom.agg_deliver(p.organization_id, null, x.item_id, 'in_app', p.user_id,
                    'custom.inbox.reminder',
                    format('Still waiting on you: %s', x.title),
                    case when x.kind = 'assignment'
                         then format('Assigned to you in %s and untouched for %s days. Open your inbox to finish it, snooze it, or clear it.',
                                     coalesce(x.table_name, 'a table'), v_days)
                         else format('%s asked %s days ago. Approve or decline it in your inbox, or snooze it until you can.',
                                     coalesce(x.requested_by_name, 'Somebody'), v_days) end,
                    jsonb_build_object('source', 'inbox', 'reason', 'reminder', 'item_id', x.item_id,
                                       'kind', x.kind, 'table_id', x.table_id, 'after_days', v_days),
                    format('inbox:%s:reminder', p.user_id));
          insert into custom.inbox_item_state as s (organization_id, person_id, item_id, reminded_at, updated_at)
          values (p.organization_id, p.user_id, x.item_id, v_now, now())
          on conflict (organization_id, person_id, item_id)
          do update set reminded_at = coalesce(s.reminded_at, excluded.reminded_at), updated_at = now();
          v_reminded := v_reminded + 1;
        end if;
        if v_id is not null then
          update communication.notification n
             set deep_link = coalesce(n.deep_link, '/o/' || coalesce(x.subject_id, x.item_id)::text)
           where n.id = v_id and n.organization_id = p.organization_id;
        end if;
      end loop;
    exception when others then
      -- ONE ORGANIZATION'S TROUBLE NEVER STOPS EVERYBODY ELSE'S REMINDERS — and it is loud.
      raise warning 'custom.inbox_remind_tick: organization % person %: % (%)', p.organization_id, p.user_id, sqlerrm, sqlstate;
    end;
  end loop;
  return jsonb_build_object('reminded', v_reminded, 'back', v_back, 'at', v_now);
end
$function$;
revoke all on function custom.inbox_remind_tick() from public, anon, authenticated;
comment on function custom.inbox_remind_tick() is
  'Lane S5-PRIME-2: pg_cron every five minutes. A snoozed item whose time came tells its person it is back (once per snooze); an item waiting longer than custom/inbox_reminder_after_days (default 3, 0 = off) gets ONE reminder. Delivered through custom.agg_deliver into communication.notification with a unique dedupe key per person and item. Internal: no client EXECUTE.';

select cron.schedule('custom-inbox-remind-tick', '*/5 * * * *', 'select custom.inbox_remind_tick();');
-- THE DEV CLONE STAYS QUARANTINED. It is told apart from production partly by "pg_net absent and
-- no active pg_cron job" (common-docs/operations/clone/CURRENT.md), so on a database without pg_net
-- the job is scheduled but left inactive — exactly like the clone's copy of every other job.
select cron.alter_job(j.jobid, active := false)
  from cron.job j
 where j.jobname = 'custom-inbox-remind-tick'
   and not exists (select 1 from pg_extension where extname = 'pg_net');

-- ── THE DOOR ROWS AND THE GRANT ─────────────────────────────────────────────────────────────────
update platform.client_callable_door
   set identity_args = 'p_organization_id uuid, p_limit integer, p_offset integer, p_include_decided boolean, p_view text',
       identity_argtypes = array['uuid'::regtype, 'integer'::regtype, 'integer'::regtype, 'boolean'::regtype, 'text'::regtype]::oid[],
       reason = 'THE one inbox: what is assigned to me, what is waiting on my approval, and the agent''s proposals, in one ordered list with one row shape, read through custom._inbox_items for the caller. p_view inbox | snoozed | done shows the caller''s own snoozed and cleared items; nobody else''s state is ever read.'
 where schema_name = 'custom' and function_name = 'work_inbox';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
select 'custom', d.fn, d.args, d.types, d.reason,
       'uichamp_s5b_each_person_snoozes_and_clears_their_own_inbox_and_is_reminded_once.sql',
       null, true, false,
       jsonb_build_object('version', 1,
         'declared_by', 'uichamp_s5b_each_person_snoozes_and_clears_their_own_inbox_and_is_reminded_once.sql',
         'declared_at', '2026-09-24 lane S5-PRIME-2',
         'arguments', d.rules)
  from (values
    ('inbox_snooze', 'p_organization_id uuid, p_item_id uuid, p_until timestamp with time zone',
     array['uuid'::regtype, 'uuid'::regtype, 'timestamptz'::regtype]::oid[],
     'Snoozes one item of the CALLER''s own inbox until a time. p_organization_id passes custom.assert_client_may_reach first; the item must be one custom._inbox_items lists for the caller in that organization, and the only row written is the caller''s own custom.inbox_item_state row. The approval or record itself is never written.',
     jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'custom.assert_client_may_reach(arg1) — the organization wall — before anything is read.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true), 'verified', '2026-09-24 lane S5-PRIME-2 — written with this body'),
       'p_item_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
         'check', 'looked up only in custom._inbox_items(arg1, the caller) — what is waiting on the caller in that organization.',
         'foreign', jsonb_build_object('sqlstate', 'P0002', 'note', 'another person''s or organization''s item and an invented id both answer "There is nothing in your inbox with that id".', 'not_a_leak', true, 'same_as_invented', true), 'verified', '2026-09-24 lane S5-PRIME-2 — written with this body'))),
    ('inbox_unsnooze', 'p_organization_id uuid, p_item_id uuid',
     array['uuid'::regtype, 'uuid'::regtype]::oid[],
     'Takes the snooze off one item of the CALLER''s own inbox. Writes only the caller''s own custom.inbox_item_state row (person_id = the caller), so any other id changes nothing and says so.',
     jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'custom.assert_client_may_reach(arg1) before anything is read.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true), 'verified', '2026-09-24 lane S5-PRIME-2 — written with this body'),
       'p_item_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
         'check', 'only matched against the caller''s own state row (organization_id = arg1, person_id = the caller).',
         'foreign', jsonb_build_object('note', 'any id that is not the caller''s own snoozed item answers changed=false.', 'not_a_leak', true, 'same_as_invented', true), 'verified', '2026-09-24 lane S5-PRIME-2 — written with this body'))),
    ('inbox_clear', 'p_organization_id uuid, p_item_id uuid',
     array['uuid'::regtype, 'uuid'::regtype]::oid[],
     'Clears (marks done) one item of the CALLER''s own inbox; a decision still owed is refused. The item must be one custom._inbox_items lists for the caller; only the caller''s own custom.inbox_item_state row is written.',
     jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'custom.assert_client_may_reach(arg1) before anything is read.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true), 'verified', '2026-09-24 lane S5-PRIME-2 — written with this body'),
       'p_item_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
         'check', 'looked up only in custom._inbox_items(arg1, the caller).',
         'foreign', jsonb_build_object('sqlstate', 'P0002', 'note', 'another person''s or organization''s item and an invented id answer alike.', 'not_a_leak', true, 'same_as_invented', true), 'verified', '2026-09-24 lane S5-PRIME-2 — written with this body'))),
    ('inbox_unclear', 'p_organization_id uuid, p_item_id uuid',
     array['uuid'::regtype, 'uuid'::regtype]::oid[],
     'Puts one cleared item back in the CALLER''s own inbox. Writes only the caller''s own custom.inbox_item_state row.',
     jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'custom.assert_client_may_reach(arg1) before anything is read.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true), 'verified', '2026-09-24 lane S5-PRIME-2 — written with this body'),
       'p_item_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
         'check', 'only matched against the caller''s own state row.',
         'foreign', jsonb_build_object('note', 'any id that is not the caller''s own cleared item answers changed=false.', 'not_a_leak', true, 'same_as_invented', true), 'verified', '2026-09-24 lane S5-PRIME-2 — written with this body'))),
    ('inbox_counts', 'p_organization_id uuid',
     array['uuid'::regtype]::oid[],
     'Counts the CALLER''s own inbox (waiting, snoozed, cleared, overdue) through custom._inbox_items. A named organization passes custom.assert_client_may_reach; null counts only organizations in iam.organization_member for the caller.',
     jsonb_build_object(
       'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
         'check', 'custom.assert_client_may_reach(arg1) when named; null reads only the caller''s own memberships.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true), 'verified', '2026-09-24 lane S5-PRIME-2 — written with this body')))
  ) as d(fn, args, types, reason, rules)
on conflict do nothing;

select custom.reopen_declared_doors();
