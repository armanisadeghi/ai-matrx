-- HR domain C4 — migration 18 (register item HRB-008 follow-up, lane workflow-engine; round-6 U3).
--
-- 🚨 OPEN FAILURE ROWS OUTLIVING THEIR OWN INSTANCES, INFLATING THE INBOX'S OUTSTANDING-WORK COUNT.
--
-- Measured live before writing (2026-08-27):
--
--   738fe260…  approver_ineligible  state=open  →  instance pay_change            state=CANCELLED
--   6a24183d…  approver_ineligible  state=open  →  instance timecard_attestation  state=CLOSED
--
-- §1.8 is explicit that the failure queue *"is not an error log. It is a worked queue: every row is
-- a thing a human must resolve before the instance can move."* An instance that is cancelled or
-- closed cannot move, and there is nothing left for a human to do — so the row is not work, it is
-- noise, and it was being counted as work.
--
-- 🚨 AND THE FORWARD HOLE IS STILL OPEN, WHICH IS WHY THIS IS NOT ONLY A DATA REPAIR.
-- `hr._wf_close_instance` cancels every open step, closes the binding, and emits the event — and
-- has never touched `hr.workflow_failure` (verified: its body does not mention the table). So every
-- future `wf_cancel`, `wf_withdraw`, rejection or supersession would strand its failure rows the
-- same way, and the invariant this migration asserts would drift back apart within a day.
-- hr_c4_15 closed only the RETRY path (a successful retry resolves its own row); this closes the
-- INSTANCE path. Repairing the stragglers without it would be housekeeping, not a fix.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 NO FORGED ACTOR. `resolved_by` is left NULL. Nobody resolved these rows — a system rule
--    did, and writing any user id there would put a person's name against a decision they never
--    took, in a table §1.8 keeps precisely so that who-did-what is answerable. The mechanism is
--    named in `resolution_note` instead, including the migration that applied it, so the reader of
--    a repaired row can tell at a glance that it was a rule and not a human. Both live rows already
--    carry `resolved_by = NULL`; this keeps it that way rather than filling it in.
--
-- 2. THE TERMINAL SET IS THE ONE §3.1 DRAWS, AND `failed` IS NOT IN IT. §3.1 has
--    `failed --> applying` (retry) and `failed --> cancelled` (abandon): a failed instance is
--    exactly the case where the failure row IS live work. `returned` is likewise live —
--    `returned --> validating` via `wf_resubmit`. Resolving a row under either would delete the
--    queue entry that is the whole mechanism for getting the instance moving again.
--    Terminal here = completed · closed · rejected · rejected_at_intake · withdrawn · cancelled ·
--    expired · superseded.
--
-- 3. `resolved`, NOT `abandoned`. §1.8's state vocabulary is `open · retrying · resolved ·
--    abandoned`. `abandoned` means a human looked at it and chose to walk away, which is a
--    judgement nobody made here. The instance closing IS the resolution.
--
-- 4. THE REPAIR AND THE FORWARD FIX USE THE SAME SENTENCE, so a row repaired today and a row closed
--    by the engine tomorrow read identically and neither looks like a special case.
--
-- Authority: SPEC-WORKFLOW-ENGINE §1.8 (the failure queue is worked, not a log), §3.1 (which
-- instance states are terminal). Applied live as `hr_c4_18_no_open_failure_on_a_closed_instance`.
-- Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '30s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  perform set_config('matrx.hr_c4_18_cert_bad_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the forward fix
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$  update hr.workflow_binding set is_open = false where workflow_instance_id = p_instance;$o$;
  v_rep constant text := $o$  update hr.workflow_binding set is_open = false where workflow_instance_id = p_instance;

  -- 🚨 AND ITS OPEN FAILURE ROWS CLOSE WITH IT. §1.8: the failure queue "is not an error log. It is
  -- a worked queue: every row is a thing a human must resolve BEFORE THE INSTANCE CAN MOVE." A
  -- terminally-closed instance cannot move and there is nothing left to do, so an open row there is
  -- not work — it is noise counted as work in the inbox's outstanding total.
  -- `failed` and `returned` are deliberately NOT terminal (§3.1: failed --> applying on retry,
  -- returned --> validating on resubmit): those are exactly the cases where the row IS live work.
  -- resolved_by stays NULL — nobody resolved these, a system rule did, and forging an actor into a
  -- table kept so that who-did-what is answerable would be worse than the noise.
  if p_state in ('completed','closed','rejected','rejected_at_intake','withdrawn','cancelled',
                 'expired','superseded') then
    update hr.workflow_failure
       set state = 'resolved',
           resolved_at = now(),
           resolution_note = coalesce(nullif(resolution_note, ''), '')
             || case when coalesce(resolution_note,'') = '' then '' else ' | ' end
             || format('superseded by instance closure: the instance closed as %s, so this row is no longer work a human can do. Resolved by the engine rule in hr._wf_close_instance, not by a person — resolved_by is deliberately null.', p_state)
     where workflow_instance_id = p_instance
       and state in ('open','retrying');
  end if;$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_close_instance';
  if v_oid is null then raise exception 'hr_c4_18: hr._wf_close_instance does not exist'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position($chk$superseded by instance closure$chk$ in v_def) > 0 then
    raise notice 'hr_c4_18: hr._wf_close_instance already closes its failure rows';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_18: hr._wf_close_instance does not carry the expected binding close — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_18: hr._wf_close_instance now resolves the failure rows it leaves behind';
  end if;
end
$mig$;

-- ============================================================ 2. the stragglers, by the same rule
do $$
declare v_n integer;
begin
  perform hr.arm_write();
  with repaired as (
    update hr.workflow_failure f
       set state = 'resolved',
           resolved_at = now(),
           resolution_note = coalesce(nullif(f.resolution_note, ''), '')
             || case when coalesce(f.resolution_note,'') = '' then '' else ' | ' end
             || format('superseded by instance closure: the instance closed as %s before hr_c4_15 made a completed retry close its own row, so this row outlived the work it described. Repaired by hr_c4_18 under the engine rule now in hr._wf_close_instance, not by a person — resolved_by is deliberately null.', i.state)
      from hr.workflow_instance i
     where i.id = f.workflow_instance_id
       and f.state in ('open','retrying')
       and i.state in ('completed','closed','rejected','rejected_at_intake','withdrawn','cancelled',
                       'expired','superseded')
    returning f.id)
  select count(*) into v_n from repaired;
  raise notice 'hr_c4_18: resolved % straggler failure row(s) on terminally-closed instances', v_n;
end $$;

-- ============================================================ 3. post-conditions
do $$
declare v_src text; v_bad integer; v_bad_before integer;
begin
  -- 🚨 THE INVARIANT, over the LIVE table. This is the check that would have caught the class.
  select count(*) into v_bad
    from hr.workflow_failure f join hr.workflow_instance i on i.id = f.workflow_instance_id
   where f.state in ('open','retrying')
     and i.state in ('completed','closed','rejected','rejected_at_intake','withdrawn','cancelled',
                     'expired','superseded');
  if v_bad > 0 then
    raise exception 'hr_c4_18: % open failure row(s) still outlive a terminally-closed instance', v_bad;
  end if;

  -- RD 1: no forged actor on anything this rule touched
  select count(*) into v_bad from hr.workflow_failure
   where resolution_note like '%superseded by instance closure%' and resolved_by is not null;
  if v_bad > 0 then
    raise exception 'hr_c4_18: % row(s) closed by the system rule carry a forged resolver', v_bad;
  end if;

  -- RD 2: a FAILED or RETURNED instance keeps its open rows — that is where the work still is
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_close_instance';
  if v_src ~ '''failed''' then
    raise exception 'hr_c4_18: hr._wf_close_instance treats `failed` as terminal; a retryable failure would lose its queue row';
  end if;
  if v_src !~ 'superseded by instance closure' then
    raise exception 'hr_c4_18: the forward fix is not in hr._wf_close_instance';
  end if;

  -- hr_c4_15/16/17 still in force
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_resolve_failure') !~ 'retry_succeeded_at' then
    raise exception 'hr_c4_18: hr_c4_15''s retry close was lost';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_escalate') !~ 'WF_SELF_STEP_NOT_ESCALATABLE' then
    raise exception 'hr_c4_18: hr_c4_16''s self-step escalation guard was lost';
  end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'privileged_write';
  if v_bad > 0 then
    raise exception 'hr_c4_18: % engine function(s) went back to the legacy write-guard arm', v_bad;
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn';
  if v_bad > 0 then
    raise exception 'hr_c4_18: % hr CONFORMANCE finding(s)', v_bad;
  end if;
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  v_bad_before := current_setting('matrx.hr_c4_18_cert_bad_before')::integer;
  if v_bad > v_bad_before then
    raise exception 'hr_c4_18: hr certification failures increased from % to %', v_bad_before, v_bad;
  end if;
end $$;
