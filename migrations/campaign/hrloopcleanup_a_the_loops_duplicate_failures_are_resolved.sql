-- chair-step: it REPAIRS data on ONE table, `hr.workflow_failure`: the duplicate OPEN failure rows
--   that the HR sweep's re-escalation loop opened every 15 minutes (fixed at the source by
--   VERSION-HISTORY-FIX file (c); this file REFUSES to run until (c)'s hr.wf_tick() body is live).
--   For every (step, failure class) holding more than one open/retrying row it keeps the NEWEST
--   one open — the one (c)'s PASS 4 reads to leave the step alone — and resolves every older one
--   with a resolution note naming this lane and the cause. The kept row gets
--   `metadata.hr_loop_cleanup` (when the problem first occurred, how many duplicates were closed)
--   so the HR owner sees how long the request has been stuck. Nothing is deleted (soft: every
--   resolved row stays, readable, with its note). One `history.migration_log` line per touched
--   row carries its prior state for the inverse. No notification is written or changed (census in
--   the body). No function, trigger, grant or policy is touched: row locks on hr.workflow_failure
--   only, not window-class. The inverse is
--   `migrations/inverse/hrloopcleanup_a_the_loops_duplicate_failures_are_resolved_down.sql`.
-- lock: platform
-- lane: HR-LOOP-CLEANUP
--
-- HR-LOOP-CLEANUP, LEFTOVER 1 — THE LOOP'S DUPLICATE FAILURES ARE RESOLVED, SOFTLY.
--
-- WHAT THE LOOP LEFT. `hr.wf_tick()` PASS 4 escalated the same 8 steps every 15 minutes because a
-- refused escalation (hr.wf_escalate RD 2) leaves `escalated_at` NULL; each attempt opened a new
-- `hr.workflow_failure` row through `hr._wf_failure`. Production, SELECT-only, 2026-09-22 ~20:00
-- UTC: 16,378 open rows in 24 (step, class) groups; 8 groups hold the duplicates (Oak Street
-- Studio ×7, Castellano & Reyes, LLP ×1; classes approver_ineligible and distinct_actor_required),
-- so 16,354 rows resolve today and 32 more per hour until (c) lands. No step holds two classes, so
-- "one open failure per (step, class)" is "one open failure per step" on this data.
--
-- WHY THE NEWEST IS KEPT, NOT THE OLDEST. (c)'s PASS 4 skips a refused step only while an open
-- failure exists with `created_at >= resolution_evidence.escalation_refused.at` — the stamp of
-- the LATEST attempt, which is the newest failure's own transaction time. Keeping the oldest would
-- make the next sweep escalate again and open a second row: the loop, once more. The kept row's
-- metadata carries the oldest row's `occurred_at` so nothing about the history is lost.
--
-- THE NOTIFICATIONS DID NOT MULTIPLY — measured, so nothing is marked read. Every
-- `hr.workflow.failure_raised` notice is keyed `hrwf:<step>:<user>:<event>:<kind>:<channel>` under
-- the UNIQUE index `notification_dedupe_key_uidx`, and `hr._wf_notify` inserts `on conflict do
-- nothing` (raising the hr_l3_117 WARNING instead). So the 16,000+ attempts wrote NO extra rows:
-- production holds 92 failure_raised notices in total (clone: in_app 36, email 36, sms 20), and
-- on the clone every one that names a still-open failure names the OLDEST open row of its step —
-- the HR owner was told once, about a request that IS still stuck. Marking those read would hide
-- a live item, so they stay as they are. The deep link is `/hr/tasks/<instance>?step=<step>`, so
-- a notice whose payload names a now-resolved duplicate still opens the right request.
--
-- DOES RESOLVING RE-FIRE ANYTHING? No. The UPDATE below fires only hr.workflow_failure's own
-- row triggers (_stamp_actor, _stamp_actor_tier, _touch_row, _version_capture, _zz_guard_hr_write;
-- custom_fields_validation only on custom_fields, untouched). None inserts a notification or an
-- event; `hr.wf_resolve_failure` — the human door, which writes a `failure_resolved` event and may
-- retry — is deliberately NOT called. And with the kept row open, (c)'s PASS 4 keeps skipping the
-- step, so the next sweep opens nothing. Proof: scripts/campaign-tests/hrloopcleanup_green.sql
-- clauses 1–2 (0 notification rows inserted by the repair or the next sweep).

set local lock_timeout = '5s';

do $pre$
begin
  if position('THE SWEEP COMPARES FIRST' in pg_get_functiondef('hr.wf_tick()'::regprocedure)) = 0 then
    raise exception 'HR-LOOP-CLEANUP: hr.wf_tick() is not yet VERSION-HISTORY-FIX file (c)''s body — apply versionhistoryfix_c_the_hr_sweep_stops_re_saving_what_did_not_change.sql first, or the next sweep re-opens what this file resolves';
  end if;
end
$pre$;

create temporary table _hlc_plan on commit drop as
with open_rows as (
  select f.id, f.organization_id, f.workflow_step_id, f.failure_class, f.state, f.occurred_at,
         f.created_at, f.resolved_at, f.resolution_note,
         row_number() over w as rank_newest,
         count(*)     over (partition by f.workflow_step_id, f.failure_class) as n_open,
         min(f.occurred_at) over (partition by f.workflow_step_id, f.failure_class) as first_occurred_at,
         first_value(f.id) over w as kept_id
    from hr.workflow_failure f
   where f.state in ('open', 'retrying') and f.workflow_step_id is not null
  window w as (partition by f.workflow_step_id, f.failure_class
               order by f.created_at desc, f.occurred_at desc, f.id desc)
)
select * from open_rows where n_open > 1;

create temporary table _hlc_before on commit drop as
select (select count(*) from communication.notification) as notifications,
       (select count(*) from hr.workflow_event) as events;

do $repair$
declare
  v_groups int; v_resolve int; v_kept int; v_left int;
begin
  select count(distinct kept_id), count(*) filter (where rank_newest > 1)
    into v_groups, v_resolve from _hlc_plan;
  perform set_config('hr.privileged_write', 'on', true);

  insert into history.migration_log (organization_id, verb, target_kind, target_id, inverse, note)
  select p.organization_id,
         case when p.rank_newest = 1 then 'failure_kept_for_owner' else 'failure_duplicate_resolved' end,
         'hr_workflow_failure', p.id,
         jsonb_build_object('kind', 'restore', 'lane', 'HR-LOOP-CLEANUP',
                            'state_before', p.state, 'resolved_at_before', p.resolved_at,
                            'resolution_note_before', p.resolution_note, 'kept_id', p.kept_id),
         case when p.rank_newest = 1
              then format('HR-LOOP-CLEANUP (2026-09-24): kept open for the HR owner; %s older duplicate(s) of this step''s %s failure, first occurred %s, were resolved.',
                          p.n_open - 1, p.failure_class, p.first_occurred_at)
              else format('HR-LOOP-CLEANUP (2026-09-24): duplicate of %s, resolved.', p.kept_id) end
    from _hlc_plan p;

  update hr.workflow_failure f
     set state = 'resolved', resolved_at = now(), resolved_by = null,
         resolution_note = format(
           'HR-LOOP-CLEANUP (2026-09-24): a duplicate. The scheduled HR sweep (hr.wf_tick, every 15 minutes) '
           'retried this step''s escalation every run because a refused escalation left it unmarked, and '
           'each retry opened a new failure. That loop is fixed (VERSION-HISTORY-FIX file c). The request '
           'is still waiting: failure %s stays open for the HR owner.', p.kept_id)
    from _hlc_plan p
   where f.id = p.id and p.rank_newest > 1;

  update hr.workflow_failure f
     set metadata = coalesce(f.metadata, '{}'::jsonb) || jsonb_build_object('hr_loop_cleanup',
           jsonb_build_object('first_occurred_at', p.first_occurred_at,
                              'duplicates_resolved', p.n_open - 1,
                              'lane', 'HR-LOOP-CLEANUP',
                              'why', 'the HR sweep re-escalated this step every 15 minutes and opened a new failure each time; the duplicates are resolved, this one stands for the request'))
    from _hlc_plan p
   where f.id = p.id and p.rank_newest = 1;

  select count(*) into v_left from (
    select 1 from hr.workflow_failure f
     where f.state in ('open', 'retrying') and f.workflow_step_id is not null
     group by f.workflow_step_id, f.failure_class having count(*) > 1) x;
  if v_left <> 0 then
    raise exception 'HR-LOOP-CLEANUP: % (step, class) group(s) still hold more than one open failure — nothing is kept', v_left;
  end if;
  if (select notifications from _hlc_before) <> (select count(*) from communication.notification)
     or (select events from _hlc_before) <> (select count(*) from hr.workflow_event) then
    raise exception 'HR-LOOP-CLEANUP: the repair wrote a notification or a workflow event — nothing is kept';
  end if;
  select count(*) into v_kept from hr.workflow_failure where metadata ? 'hr_loop_cleanup' and state in ('open','retrying');
  raise notice 'HR-LOOP-CLEANUP: % duplicate open failure(s) resolved across % (step, class) group(s); % kept open for the HR owner; 0 notifications and 0 events written',
    v_resolve, v_groups, v_kept;
end
$repair$;
