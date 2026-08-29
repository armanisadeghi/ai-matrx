-- hr_l5_34 — A DRAFT IS DISCARDED, NOT CANCELLED.
--
-- THE GAP (found 2026-08-29). `hr.leave_request_cancel` handles `taken` (refuses — §4.6: the
-- correction is a balance adjustment), `submitted` (withdraws) and `approved` (opens a
-- `leave_cancellation` flow), then falls through to `not_cancellable` for everything else.
-- `draft` lands there. So a draft leave request was WRITE-ONCE AND PERMANENT: no product door
-- could remove it, and `hr.my_time_off` returns every non-deleted request, so it sat on
-- /hr/me/time-off forever reading "Not sent yet".
--
-- WHY A DRAFT EVEN EXISTS, MEASURED RATHER THAN ASSUMED. There is no "save as draft" in this
-- product. `hr.leave_request_submit` is the ONLY writer that inserts a request, it always
-- inserts `'draft'` and immediately submits, and `hr.leave_wf_validate` moves the row to
-- `'submitted'` — EXCEPT when it froze HARD findings, where it deliberately leaves the state
-- alone (`state = case when jsonb_array_length(v_hard) > 0 then state else 'submitted' end`).
-- The instance then goes `rejected_at_intake`, which is terminal. So in the live system today
-- `draft` means exactly one thing: THE CHECKS REFUSED THIS AT INTAKE. SPEC-LEAVE's frozen enum
-- has no "rejected" state and §4.1 says the UI adds none, so `draft` + a `rejected_at_intake`
-- instance IS the correct representation — what was missing was the person's way out of it.
--
-- WHY `discard` AND NOT `cancel` (§4.6). Cancellation undoes a COMMITMENT: something was filed,
-- somebody was asked, hours may be encumbered, and the ledger may owe a reversal. A draft was
-- never filed and encumbers nothing. Calling it "cancel" would put a filed-request word on an
-- act that reverses nothing, and would invite the cancel door's machinery (workflows, reversal
-- entries) onto a row that needs none of it. Discard is a different act and gets its own door.
--
-- WHY SOFT DELETE AND NOT A NEW STATE. §4.1: *"The UI adds no state of its own."* The enum is
-- frozen. A discard is not a state a request is IN — it is the row ceasing to be part of the
-- person's record. `hr_leave_request` already declares `has_soft_delete`, `hr.my_time_off`
-- already filters `deleted_at is null`, and `platform._version_capture` already writes a
-- `SOFT_DELETE` row into `history.row_versions` carrying the actor and the whole row — which is
-- the audit, obtained by using the machinery rather than bolting a second one beside it.
--
-- ONLY A DRAFT. Every other state records something that HAPPENED — it was sent, decided,
-- withdrawn, or taken — and §4.1 promises the person "what happened to what they asked for".
-- Discarding history would be a lie, so `denied` and `cancelled` refuse here exactly as firmly
-- as `approved` and `taken` do. Each refusal names the act that IS available.
--
-- THE SECOND DEFECT, ROOT-CAUSED. Two draft rows shared ONE workflow_instance_id
-- (04d7cd1e-…, targeting only the first of them). That is not legal, and the mechanism is in
-- `hr.leave_request_submit`: it INSERTS its row BEFORE calling `hr.wf_request`, and
-- `hr.wf_request`'s idempotency contract RETURNS the existing instance on a replay. So a retry
-- carrying the same idempotency key minted a second request row and stamped it with an instance
-- that targets the first — an orphan with no binding, no flow, and no way to ever advance.
-- Fixed below: on `replayed`, the row just inserted is removed and the ORIGINAL request is
-- returned, which is what a replay means. D275 already states the principle this restores —
-- *a refusal must leave nothing behind*.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE DOOR
-- ─────────────────────────────────────────────────────────────────────────────

-- 🚨 THE DECLARATION COMES BEFORE THE GRANT. platform.enforce_definer_client_grants revokes
-- the client EXECUTE right back out of any undeclared SECURITY DEFINER function at
-- ddl_command_end, so a door sealed without this row seals to nothing and only says so in a
-- WARNING and a platform.ddl_guard_log entry. It is declared ahead of the CREATE, not merely
-- ahead of the GRANT: the guard fires on the CREATE too, and a declaration that arrives after
-- it writes a `definer_client_grant_revoked` row describing a revoke the seal then undoes —
-- a log line that reads as a live exposure on every replay of this file.
insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason)
select 'public', 'hr_leave_request_discard', 'p_request_id uuid, p_reason text', 'hr_l5_34',
       'SPEC-LEAVE §4.1 route 8. The employee''s only way to clear a draft leave request off '
    || 'their own time-off page. Client-callable by `authenticated` and never by `anon`: the '
    || 'body resolves the caller through hr._leave_viewer and refuses rung `none`, acts on a '
    || 'single request id, refuses every state but `draft` (each with the act that IS '
    || 'available), refuses while a workflow binding is open, and soft-deletes — it moves no '
    || 'balance, writes no ledger entry, and never touches the workflow instance, which is '
    || 'evidence. It exists because hr.leave_request_cancel covers taken/submitted/approved '
    || 'and answers `not_cancellable` for a draft, which made a draft permanent.'
where not exists (
  select 1 from platform.client_callable_door
   where schema_name = 'public' and function_name = 'hr_leave_request_discard'
     and identity_args = 'p_request_id uuid, p_reason text');

create or replace function hr.leave_request_discard(
  p_request_id uuid,
  p_reason     text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $fn$
declare
  req    hr.leave_request%rowtype;
  v_view jsonb;
  v_rung text;
  v_open uuid;
  v_word text;
  v_next text;
begin
  select * into req from hr.leave_request
   where id = p_request_id and deleted_at is null;
  if req.id is null then
    return jsonb_build_object('granted', false, 'reason','not_found',
      'detail','That request is not here any more.');
  end if;

  -- THE DOOR CHECKLIST rule 2: the body checks its caller first, through the ONE viewer.
  v_view := hr._leave_viewer(req.employment_id);
  v_rung := v_view ->> 'rung';
  if v_rung = 'none' then
    return jsonb_build_object('granted', false, 'reason', v_view ->> 'reason',
      'detail','This only ever acts on a record you are entitled to act on.');
  end if;

  -- 🚨 ONLY A DRAFT. Every other state is a thing that HAPPENED, and each refusal names the
  -- act that IS available instead — never a bare "no" (§4.2's refusal dialect).
  if req.state <> 'draft' then
    v_word := case req.state
                when 'submitted'       then 'has already been sent for a decision'
                when 'approved'        then 'is already approved, and the hours are held against your balance'
                when 'taken'           then 'has already been taken'
                when 'partially_taken' then 'has already been partly taken'
                when 'denied'          then 'was decided — it is part of your record now'
                when 'cancelled'       then 'was already cancelled — it is part of your record now'
                else format('is %s', req.state) end;
    v_next := case req.state
                when 'submitted'       then 'Withdraw it instead; nothing has been taken from your balance yet.'
                when 'approved'        then 'Ask to cancel it instead — that goes back to your approver.'
                when 'taken'           then 'A correction to time already taken is a balance adjustment, which HR makes.'
                when 'partially_taken' then 'A correction to time already taken is a balance adjustment, which HR makes.'
                else 'Nothing needs undoing; the record stays so you can see what happened.' end;
    return jsonb_build_object('granted', false, 'reason','not_discardable',
      'state', req.state,
      'detail', format('This request %s, so it cannot be discarded. %s', v_word, v_next));
  end if;

  -- 🚨 A LIVE FLOW OWNS ITS TARGET. The database's own notion of that is an OPEN exclusive
  -- binding, so that is what is asked — never a re-derived reading of the instance's state.
  -- A draft normally carries a CLOSED binding (hr.wf_submit closes it at rejected_at_intake)
  -- or none at all (the replay orphan above). Anything open means a flow is still running on
  -- this row and discarding it would strand that flow pointing at a row that vanished.
  select b.workflow_instance_id into v_open
    from hr.workflow_binding b
   where b.target_token = 'hr_leave_request' and b.target_id = req.id
     and b.is_open
   limit 1;
  if v_open is not null then
    return jsonb_build_object('granted', false, 'reason','workflow_still_open',
      'workflow_instance_id', v_open,
      'detail','Something is still running on this request, so it cannot be discarded yet.');
  end if;

  -- 🚨 THE WORKFLOW INSTANCE IS NEVER TOUCHED. §1.3: an instance is evidence and is never
  -- deleted. It records that these dates were asked for and that the checks refused them, and
  -- that remains true after the person clears the row off their page. The binding is already
  -- closed by the time we get here, so there is no open claim left to retire either.

  perform hr.arm_write();
  update hr.leave_request
     set deleted_at = now(),
         metadata   = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
                        'discarded_at', now(),
                        'discarded_by_rung', v_rung,
                        'discarded_reason', nullif(btrim(coalesce(p_reason,'')), ''))
   where id = req.id;

  -- NO BALANCE MOVES, AND THE CACHE IS DELIBERATELY NOT REFRESHED. A draft is in no figure:
  -- the enrollment refresh counts `state = 'submitted'` for pending_hours and reads the ledger
  -- for every other number, and a draft never wrote a ledger entry. Calling it here would move
  -- `last_accrual_at` for a discard that changed no number — a write with nothing behind it.
  -- The migration's self-proof asserts the balance instead of assuming it.

  return jsonb_build_object(
    'granted', true, 'outcome','discarded',
    'leave_request_id', req.id,
    'state', req.state,
    'workflow_instance_id', req.workflow_instance_id,
    'workflow_instance_kept', req.workflow_instance_id is not null,
    'balance_moved', false);
end
$fn$;

create or replace function public.hr_leave_request_discard(
  p_request_id uuid,
  p_reason     text default null
) returns jsonb
language sql
security definer
set search_path to 'public', 'hr'
as $fn$ select hr.leave_request_discard(p_request_id, p_reason); $fn$;

-- THE DOOR CHECKLIST rule 1: the sealer, never hand-written grants. `revoke from public` does
-- not remove `anon`'s own explicit grant; both revokes must name their grantee and the sealer
-- does that.
select hr.leave_seal_door('hr_leave_request_discard', 'client');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE ORPHAN: A REPLAY RETURNS THE ORIGINAL REQUEST, IT DOES NOT MINT A SECOND ONE
-- ─────────────────────────────────────────────────────────────────────────────
-- Fixed AT THE SOURCE (checklist rule 3) — inside the file that owns the behaviour, not in a
-- patch a later replay of hr_l5_28 would undo. Only the block after `v_inst` is new; the rest
-- of this body is hr_l5_28's, carried forward verbatim.

create or replace function hr.leave_request_submit(
  p_employment_id uuid, p_leave_policy_id uuid, p_starts_on date, p_ends_on date,
  p_day_parts jsonb default '[]'::jsonb, p_reason_category_id uuid default null,
  p_reason_note text default null, p_leave_case_id uuid default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'hr', 'public'
as $fn$
declare
  v_view jsonb; v_org uuid; v_span jsonb; v_req uuid; v_pol hr.leave_policy%rowtype;
  v_wf jsonb; v_inst uuid; v_sub jsonb; v_row hr.leave_request%rowtype; v_prior uuid;
begin
  v_view := hr._leave_viewer(p_employment_id);
  -- Only the person themselves files their own leave. An HR admin filing FOR somebody is a
  -- different action with a different audit story and it is not this door.
  if (v_view ->> 'rung') <> 'self' then
    return jsonb_build_object('granted', false, 'reason','not_self',
      'detail','You can only file your own time-off request from here.');
  end if;
  v_org := (v_view ->> 'organization_id')::uuid;

  -- hr_l5_23: THREE different facts, three different refusals, each naming what to DO.
  v_pol := hr._leave_policy_at(p_leave_policy_id);
  if v_pol.id is null then
    return jsonb_build_object('granted', false, 'reason','policy_no_longer_exists',
      'stale_selection', true,
      'detail','This leave type no longer exists — it was changed or removed while this page '
             || 'was open.');
  end if;
  if not v_pol.is_active then
    return jsonb_build_object('granted', false, 'reason','policy_inactive',
      'stale_selection', true,
      'detail', format('%s has been switched off, so no new time can be booked against it. '
                      , v_pol.name));
  end if;
  if not exists (select 1 from hr.leave_enrollment e
                  where e.employment_id = p_employment_id and e.leave_policy_id = p_leave_policy_id
                    and e.deleted_at is null and e.effective_from <= p_ends_on
                    and (e.effective_to is null or e.effective_to >= p_starts_on)) then
    return jsonb_build_object('granted', false, 'reason','not_enrolled_on_these_dates',
      'starts_on', p_starts_on, 'ends_on', p_ends_on,
      'detail', format('You are on %s, but not for %s to %s. Pick dates inside the period '
                      || 'you are enrolled for, or ask HR to extend it.', v_pol.name,
                         to_char(p_starts_on, 'FMMon FMDD'), to_char(p_ends_on, 'FMMon FMDD')));
  end if;
  -- §3.2 condition 5: worker class must be inside the policy's scope. A FOURTH fact gets a
  -- FOURTH NAME. An enrollment carrying an explicit §2.8 override is deliberate and passes.
  declare
    v_wc jsonb;
    v_override text;
  begin
    v_wc := hr._leave_worker_class_ok(p_employment_id, p_leave_policy_id, p_starts_on);
    select nullif(btrim(coalesce(e.metadata ->> 'worker_class_override_reason','')), '')
      into v_override
      from hr.leave_enrollment e
     where e.employment_id = p_employment_id and e.leave_policy_id = p_leave_policy_id
       and e.deleted_at is null
     order by e.effective_from desc limit 1;
    if coalesce((v_wc ->> 'ok')::boolean, true) is not true and v_override is null then
      return jsonb_build_object('granted', false,
        'reason','worker_class_outside_policy_scope',
        'worker_class', v_wc -> 'worker_class',
        'policy_scope', v_wc -> 'scope',
        'detail', format('%s covers %s, and this employment is %s. HR can enrol somebody '
                        || 'outside that on purpose, with a reason recorded — but it has '
                        || 'not been done here.', v_pol.name,
                           array_to_string(array(select jsonb_array_elements_text(v_wc -> 'scope')), ', '),
                           coalesce(v_wc ->> 'worker_class', 'not recorded')));
    end if;
  end;

  if p_ends_on < p_starts_on then
    return jsonb_build_object('granted', false, 'reason','dates_reversed',
      'detail','The end date is before the start date.');
  end if;

  v_span := hr.leave_span_hours(p_employment_id, p_starts_on, p_ends_on, p_day_parts);

  -- 🚨 THE FREE WEEK. Refused here, not booked, and the sentence names the missing fact.
  if hr._leave_span_is_costless(v_span) then
    return jsonb_build_object('granted', false, 'reason','no_working_hours_on_these_days',
      'detail','We cannot work out how long your working day is, so this request would cost no '
            || 'time at all. There is no shift scheduled on these days and no standard weekly '
            || 'hours on your position. Ask HR to set your standard hours, or pick days you are '
            || 'scheduled to work.',
      'span', v_span);
  end if;

  perform hr.arm_write();
  insert into hr.leave_request
    (employment_id, leave_policy_id, leave_case_id, starts_on, ends_on, is_partial_day,
     day_parts, requested_hours, state, reason_category_id, reason_note,
     conflict_check, rule_version_ids, engine_key, engine_version, calc, organization_id)
  values
    (p_employment_id, p_leave_policy_id, p_leave_case_id, p_starts_on, p_ends_on,
     jsonb_array_length(coalesce(p_day_parts,'[]'::jsonb)) > 0,
     coalesce(p_day_parts,'[]'::jsonb), coalesce((v_span ->> 'total_hours')::numeric, 0),
     'draft', p_reason_category_id, p_reason_note,
     '{}'::jsonb, '{}'::uuid[], 'leave_engine', '1', jsonb_build_object('span', v_span), v_org)
  returning id into v_req;

  -- ONE workflow engine, ONE inbox. This lane declares a flow type; it never builds a queue.
  v_wf := hr.wf_request('leave_request', 'hr_leave_request', v_req, v_org,
                        jsonb_build_object(
                          'total_hours', coalesce((v_span ->> 'total_hours')::numeric, 0),
                          'notice_days', p_starts_on - current_date,
                          'leave_type', v_pol.leave_kind,
                          'leave_policy_id', v_pol.id,
                          'coverage_pct', 100,
                          -- until hr.leave_wf_validate has run, the honest value is "we do not
                          -- know yet", and the safe reading of not-knowing is DO NOT auto-approve.
                          'escalation_required', true),
                        p_employment_id, false, p_idempotency_key);
  v_inst := nullif(v_wf ->> 'instance_id','')::uuid;
  if v_inst is null then
    return jsonb_build_object('granted', false, 'reason', coalesce(v_wf ->> 'reason','wf_request_failed'),
      'detail', v_wf ->> 'detail', 'leave_request_id', v_req, 'workflow', v_wf);
  end if;

  -- 🚨 hr_l5_34: A REPLAY RETURNS THE ORIGINAL REQUEST. hr.wf_request answers an idempotency
  -- key it has already seen with the EXISTING instance and `replayed: true` — and that instance
  -- targets the request row of the FIRST call. The row inserted a few lines above therefore
  -- belongs to nothing: no binding, no flow, no path to any state but `draft`, and until this
  -- door existed no path out of the database either. Two live drafts sharing one instance is
  -- exactly how 99dfdc85 and 295d5682 came to be. Both replay paths inside hr.wf_request — the
  -- pre-check and the concurrent unique_violation — set this same flag, so testing it here
  -- closes the sequential retry and the race with one branch and adds no second copy of the
  -- idempotency lookup.
  if coalesce((v_wf ->> 'replayed')::boolean, false) then
    select target_id into v_prior from hr.workflow_instance where id = v_inst;
    -- The row has existed for microseconds inside this transaction and has never been visible
    -- to anybody. It leaves nothing behind (D275), and history.row_versions keeps the pair.
    perform hr.arm_write();
    delete from hr.leave_request where id = v_req;

    select * into v_row from hr.leave_request where id = v_prior and deleted_at is null;
    if v_row.id is null then
      -- The original was discarded. Handing back a row the person deliberately threw away
      -- would be a lie, and silently minting a new one is what this branch exists to stop.
      return jsonb_build_object('granted', false, 'reason','idempotency_key_already_used',
        'workflow_instance_id', v_inst,
        'detail','This request was already sent once and has since been discarded. Send it '
              || 'again as a new request.');
    end if;
    return jsonb_build_object(
      'granted', true, 'replayed', true,
      'leave_request_id', v_row.id, 'workflow_instance_id', v_inst,
      'state', v_row.state, 'requested_hours', v_row.requested_hours,
      'conflict_check', v_row.conflict_check,
      'workflow', v_wf,
      'rejected_at_intake', (select i.state = 'rejected_at_intake'
                               from hr.workflow_instance i where i.id = v_inst));
  end if;

  perform hr.arm_write();
  update hr.leave_request set workflow_instance_id = v_inst where id = v_req;

  -- hr_l5_28: NO SECOND SUBMIT. hr.wf_request already ran hr.wf_submit and returned its
  -- result; calling it again always lands on a non-draft and always refuses (§4.2).
  v_sub := v_wf;
  select * into v_row from hr.leave_request where id = v_req;

  return jsonb_build_object(
    'granted', true, 'leave_request_id', v_req, 'workflow_instance_id', v_inst,
    'state', v_row.state, 'requested_hours', v_row.requested_hours,
    'conflict_check', v_row.conflict_check,
    'workflow', v_sub,
    'rejected_at_intake', coalesce(v_sub ->> 'state','') = 'rejected_at_intake');
end
$fn$;

-- hr.leave_request_submit is reached only through public.hr_leave_request_submit, whose grant
-- this migration does not touch. Re-sealing the inner function would be a grant it never had.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. SELF-PROOF — the migration fails rather than reporting green
-- ─────────────────────────────────────────────────────────────────────────────
do $proof$
declare v_n integer; v_txt text;
begin
  -- 3a. THE DOOR CHECKLIST rule 4: zero DEFECT rows, and the new door is IN the audit.
  select count(*) into v_n from hr.leave_door_grant_audit() where verdict like 'DEFECT%';
  if v_n > 0 then
    raise exception 'hr_l5_34: hr.leave_door_grant_audit() returns % DEFECT row(s)', v_n;
  end if;
  select verdict into v_txt from hr.leave_door_grant_audit()
   where door like 'public.hr_leave_request_discard(%';
  if v_txt is distinct from 'client door — checks its caller' then
    raise exception 'hr_l5_34: the discard door audits as %, not a caller-checking client door',
      coalesce(v_txt, 'ABSENT');
  end if;

  -- 3b. The declaration survived the DDL guard, so the grant is real and not about to be
  --     taken back on the next unrelated CREATE FUNCTION anywhere in the database.
  if not exists (select 1 from platform.client_callable_door
                  where schema_name='public' and function_name='hr_leave_request_discard') then
    raise exception 'hr_l5_34: no platform.client_callable_door row — the seal will be revoked';
  end if;
  if not has_function_privilege('authenticated',
        'public.hr_leave_request_discard(uuid,text)'::regprocedure, 'execute') then
    raise exception 'hr_l5_34: authenticated cannot execute the discard door';
  end if;
  if has_function_privilege('anon',
        'public.hr_leave_request_discard(uuid,text)'::regprocedure, 'execute') then
    raise exception 'hr_l5_34: anon CAN execute the discard door';
  end if;

  -- 3c. ONLY A DRAFT, read out of the body rather than described. Every non-draft state must
  --     be refused by the same branch, so a future edit that quietly widens it fails here.
  select pg_get_functiondef(p.oid) into v_txt from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='hr' and p.proname='leave_request_discard';
  if v_txt not like '%req.state <> ''draft''%' then
    raise exception 'hr_l5_34: the discard door no longer refuses every state but draft';
  end if;
  if v_txt like '%hr.leave_ledger%' or v_txt like '%leave_enrollment_refresh%' then
    raise exception 'hr_l5_34: the discard door touches the ledger or the balance cache';
  end if;
  if v_txt like '%delete from hr.workflow_instance%' or v_txt like '%update hr.workflow_instance%' then
    raise exception 'hr_l5_34: the discard door writes to a workflow instance (§1.3: evidence)';
  end if;

  -- 3d. The replay branch is present in hr.leave_request_submit — the orphan's actual cause.
  select pg_get_functiondef(p.oid) into v_txt from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='hr' and p.proname='leave_request_submit';
  if v_txt not like '%''replayed''%' then
    raise exception 'hr_l5_34: hr.leave_request_submit does not handle a wf_request replay';
  end if;

  raise notice 'hr_l5_34: door sealed, declared, draft-only, ledger-free, instance-safe; submit handles replay.';
end
$proof$;

commit;
