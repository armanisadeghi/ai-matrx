-- hr_l3_112 — AN ATTESTATION RECORDS WHAT IT WAS MADE AGAINST.
--
-- 🚨 THE DEFECT (measured live 2026-08-29, 1 of 200 rows carried a statement; BOTH rows where a
-- person actually attested were NULL). hr.pay_period_employment.attestation_statement is the
-- wording an employee signed — the legal substance of the attestation, and the only thing route 5
-- can render under "What you agreed to, word for word" (hr.timesheet_get projects the ROW, not the
-- knob). hr.pay_period_transition stamped it inside
--
--     insert into hr.pay_period_employment (... attestation_statement ...)
--     on conflict (pay_period_id, employment_id) do nothing;
--
-- but hr._enroll_pay_period_rows creates that row FIRST, at period generation. So the insert
-- ALWAYS conflicted and the column was NEVER written. The single row that carried a statement is
-- the one row the submit path genuinely inserted (engine_key='hr.time.period_lifecycle').
--
-- WHEN DOES THE STATEMENT BIND? SPEC-TIME §2.2 and the §9 config register both fix it at OFFER:
-- "the exact text shown is stored on hr.pay_period_employment.attestation_statement — a statement
-- an org later edits must not retroactively change what an employee agreed to", and "the text
-- shown is copied onto the row — an edit is never retroactive". hr.timesheet_get reads
-- v_row.attestation_statement ("the statement STORED AS SHOWN"), so the ROW *is* the text the
-- employee is shown. The stamp must therefore already be on the row when the attestation step is
-- OPENED — which is exactly the moment hr.pay_period_transition was reaching for, and exactly the
-- moment the on-conflict clause threw away. The act does not choose the wording; it can only fail
-- to record one. Hence:
--
--   1. hr.pay_period_transition            — stamp on BOTH paths (insert or already-enrolled),
--                                            never over a non-null one, and SCREAM on divergence.
--   2. hr.timecard_wf_apply                — at the act, backstop from the instance's own payload
--                                            if and only if the row still carries nothing; and
--                                            REFUSE to record an attestation to no statement at
--                                            all (SPEC-TIME §3.2: "An attestation to an unstated
--                                            number is not an attestation").
--   3. hr._timecard_reject_reopen          — a re-attestation after a rejection carries the ROW's
--                                            statement forward instead of re-reading the knob, so
--                                            the instance payload and the row can never disagree.
--   4. hr.attestations_without_a_statement — the detector, and punch battery check 38.
--   5. THE BACKFILL, from hr.workflow_instance.payload->>'attestation_statement' — the system's own
--      record of the SAME act, joined on the real keys (target_token + target_id + flow_key). No
--      fabrication: the bytes already exist, 1:1, one instance per row, all 179 bytes, one distinct
--      value. Nothing is invented and no non-null statement is touched.
--
-- LEGAL-RECORD SAFETY: no row is deleted, no non-null attestation_statement is ever overwritten by
-- any path added here, and every write is a coalesce or a null-guarded update.
--
-- SPEC-TIME §2.2, §3.2, §8.2, §9 config register. Sibling of hr_c4_44 (timecard_wf_apply).

begin;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 1. THE WRITER — hr.pay_period_transition stamps on BOTH paths, and never over a different one.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
do $mig$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_transition';
  if v_src is null then
    raise exception 'hr_l3_112: hr.pay_period_transition does not exist';
  end if;
  if position('attestation_statement = excluded.attestation_statement' in v_src) > 0 then
    raise notice 'hr_l3_112: hr.pay_period_transition already stamps on both paths — skipping';
    return;
  end if;

  -- 1a. NEW STATE — the stamp is counted separately so `rowsOpened` keeps meaning rows OPENED.
  if position($a0$  v_rows     integer := 0;
$a0$ in v_src) = 0 then
    raise exception 'hr_l3_112: anchor 1a not found in hr.pay_period_transition — refusing to guess';
  end if;
  v_new := replace(v_src,
$a0$  v_rows     integer := 0;
$a0$,
$a0$  v_rows     integer := 0;
  v_stamped  integer := 0;   -- hr_l3_112: rows whose attestation wording this submit RECORDED
  v_existed  boolean;        -- hr_l3_112: the row was already enrolled before this submit
  v_prior    text;           -- hr_l3_112: the wording already standing on it, if any
$a0$);

  -- 1b. THE IMMUTABILITY SCREAM, before the write.
  if position($a1$      perform hr.arm_write();
      insert into hr.pay_period_employment
$a1$ in v_new) = 0 then
    raise exception 'hr_l3_112: anchor 1b not found in hr.pay_period_transition — refusing to guess';
  end if;

  v_new := replace(v_new,
$a1$      perform hr.arm_write();
      insert into hr.pay_period_employment
$a1$,
$a1$      -- 🚨 hr_l3_112: A STATEMENT ONCE RECORDED AGAINST A TIMECARD IS IMMUTABLE. The stamp below
      -- is null-guarded so it can only ever FILL an empty column, never change a filled one. If the
      -- wording currently resolved differs from one already standing on this row, that is not an
      -- update to make — it is corruption of a legal record, and the whole submit stops here rather
      -- than proceed over it. It cannot fire through any sanctioned path: a period is submitted
      -- exactly once (open→submitted), and hr._timecard_reject_reopen now carries the row's own
      -- statement forward instead of re-reading the knob.
      select true, ppe.attestation_statement into v_existed, v_prior
        from hr.pay_period_employment ppe
       where ppe.pay_period_id = p_pay_period_id and ppe.employment_id = r.employment_id;
      v_existed := coalesce(v_existed, false);
      if v_flow = 'timecard_attestation' and v_prior is not null and v_stmt is not null
         and v_prior is distinct from v_stmt then
        raise exception using
          errcode = '23514',
          message = 'ATTESTATION STATEMENT DIVERGENCE -- refused. This timecard already carries a '
                 || 'different attestation statement than the one now resolved.',
          detail  = format('pay_period_employment for employment %s in period %s already carries a '
                        || 'statement of %s bytes; the configured statement is %s bytes. A statement '
                        || 'recorded against an attestation is what the employee agreed to and is '
                        || 'never rewritten. Nothing was changed.',
                        r.employment_id, p_pay_period_id, length(v_prior), length(v_stmt)),
          hint    = 'SPEC-TIME 2.2: an org editing hr.time_and_attendance.attestation_statement '
                 || 'must never retroactively change what an employee agreed to. Investigate how '
                 || 'this row came to hold a second wording before re-running the submit.';
      end if;
      perform hr.arm_write();
      insert into hr.pay_period_employment
$a1$);

  -- 1c. THE STAMP ON THE ALREADY-ENROLLED PATH — the actual defect.
  if position($a2$      on conflict (pay_period_id, employment_id) do nothing;
      if found then v_rows := v_rows + 1; end if;
$a2$ in v_new) = 0 then
    raise exception 'hr_l3_112: anchor 1c not found in hr.pay_period_transition — refusing to guess';
  end if;

  v_new := replace(v_new,
$a2$      on conflict (pay_period_id, employment_id) do nothing;
      if found then v_rows := v_rows + 1; end if;
$a2$,
$a2$      -- 🚨 hr_l3_112: `do nothing` MEANT `record nothing`. hr._enroll_pay_period_rows creates
      -- this row at period generation, so the insert ALWAYS conflicted and attestation_statement
      -- was never written — 1 of 200 rows carried it and BOTH attested rows were null. The stamp
      -- must land whether this statement inserts the row or finds it. The where-clause is the
      -- immutability guard in the write itself: it can only fill a NULL.
      on conflict (pay_period_id, employment_id) do update
         set attestation_statement = excluded.attestation_statement
       where pay_period_employment.attestation_statement is null
         and excluded.attestation_statement is not null;
      -- rowsOpened keeps its old meaning: rows this submit actually OPENED. A row that was already
      -- enrolled and merely had its wording recorded is counted apart, and reported apart, so the
      -- repair path is visible in every envelope instead of hiding inside an insert count.
      if not v_existed then
        v_rows := v_rows + 1;
      elsif v_flow = 'timecard_attestation' and v_prior is null and v_stmt is not null then
        v_stamped := v_stamped + 1;
      end if;
$a2$);

  -- 1d. THE COUNT IS REPORTED. A stamp nobody can see is a stamp nobody checks.
  if position($a3$    'rowsOpened', v_rows,
$a3$ in v_new) = 0 then
    raise exception 'hr_l3_112: anchor 1d not found in hr.pay_period_transition — refusing to guess';
  end if;
  v_new := replace(v_new,
$a3$    'rowsOpened', v_rows,
$a3$,
$a3$    'rowsOpened', v_rows,
    -- hr_l3_112: rows that were ALREADY enrolled and whose attestation wording this submit
    -- recorded. Before hr_l3_112 this number was structurally always zero and silent.
    'attestationStatementsStamped', v_stamped,
$a3$);

  execute v_new;
end
$mig$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE ACT — hr.timecard_wf_apply records the statement it was made against, or records nothing.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
do $mig$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'timecard_wf_apply';
  if v_src is null then
    raise exception 'hr_l3_112: hr.timecard_wf_apply does not exist';
  end if;
  if position('attestation_statement_missing' in v_src) > 0 then
    raise notice 'hr_l3_112: hr.timecard_wf_apply already guards the statement — skipping';
    return;
  end if;

  -- 2a. AN ATTESTATION TO NO STATEMENT IS NOT AN ATTESTATION.
  if position($b1$    perform hr.arm_write();
    -- NOTE: `perform` clobbers FOUND, so the branch keys off the decision row itself.
    if v_dec.id is null then
$b1$ in v_src) = 0 then
    raise exception 'hr_l3_112: anchor 2a not found in hr.timecard_wf_apply — refusing to guess';
  end if;

  v_new := replace(v_src,
$b1$    perform hr.arm_write();
    -- NOTE: `perform` clobbers FOUND, so the branch keys off the decision row itself.
    if v_dec.id is null then
$b1$,
$b1$    perform hr.arm_write();
    -- 🚨 hr_l3_112: AN ATTESTATION TO AN UNSTATED STATEMENT IS NOT AN ATTESTATION (SPEC-TIME §3.2,
    -- the same law that makes the attestation card show the total it is asking about). If neither
    -- the row nor this instance's own payload carries the wording, there is nothing for the
    -- employee to have agreed to, and flipping the row would manufacture a signed record out of an
    -- empty one. Refuse instead — the decision row stands, the instance stays unapplied, and this
    -- is fixable by stamping the row. Only reachable for a decision that ASSERTS something;
    -- not_attested is untouched, because it asserts nothing.
    if v_dec.id is not null
       and coalesce(v_ppe.attestation_statement, inst.payload ->> 'attestation_statement') is null then
      return jsonb_build_object('ok', false, 'failure_class', 'apply_failed',
        'reason', 'attestation_statement_missing',
        'detail', format('hr.pay_period_employment %s carries no attestation_statement and '
                      || 'workflow_instance %s carries none in its payload, so there is no wording '
                      || 'this attestation could have been made against. NOTHING was recorded: the '
                      || 'row was not flipped and no attested_at was written. SPEC-TIME 2.2 — the '
                      || 'statement is stamped when the step is OPENED, by hr.pay_period_transition.',
                      v_ppe.id, p_instance_id));
    end if;
    -- NOTE: `perform` clobbers FOUND, so the branch keys off the decision row itself.
    if v_dec.id is null then
$b1$);

  -- 2b + 2c. THE BACKSTOP STAMP, on both attesting branches. coalesce() reads the OLD value, so a
  -- statement already standing on the row is what survives — this can only ever fill a NULL.
  if position($b2$      update hr.pay_period_employment
         set state = 'disputed',
             attested_at = now(),
$b2$ in v_new) = 0 then
    raise exception 'hr_l3_112: anchor 2b not found in hr.timecard_wf_apply — refusing to guess';
  end if;
  v_new := replace(v_new,
$b2$      update hr.pay_period_employment
         set state = 'disputed',
             attested_at = now(),
$b2$,
$b2$      update hr.pay_period_employment
         set state = 'disputed',
             attested_at = now(),
             -- hr_l3_112: the wording this act was made against, from the instance that carried it,
             -- and ONLY where the row holds none. Never an overwrite.
             attestation_statement =
               coalesce(attestation_statement, inst.payload ->> 'attestation_statement'),
$b2$);

  if position($b3$      update hr.pay_period_employment
         set state = 'attested',
             attested_at = now(),
$b3$ in v_new) = 0 then
    raise exception 'hr_l3_112: anchor 2c not found in hr.timecard_wf_apply — refusing to guess';
  end if;
  v_new := replace(v_new,
$b3$      update hr.pay_period_employment
         set state = 'attested',
             attested_at = now(),
$b3$,
$b3$      update hr.pay_period_employment
         set state = 'attested',
             attested_at = now(),
             -- hr_l3_112: the wording this act was made against, from the instance that carried it,
             -- and ONLY where the row holds none. Never an overwrite.
             attestation_statement =
               coalesce(attestation_statement, inst.payload ->> 'attestation_statement'),
$b3$);

  execute v_new;
end
$mig$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 3. RE-ATTESTATION AFTER A REJECTION carries the ROW's statement, so payload and row never differ.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
do $mig$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_timecard_reject_reopen';
  if v_src is null then
    raise exception 'hr_l3_112: hr._timecard_reject_reopen does not exist';
  end if;
  if position('coalesce(v_ppe.attestation_statement' in v_src) > 0 then
    raise notice 'hr_l3_112: hr._timecard_reject_reopen already carries the row forward — skipping';
    return;
  end if;

  if position($c1$  v_stmt := hr._knob('hr.time_and_attendance','attestation_statement') #>> '{}';
$c1$ in v_src) = 0 then
    raise exception 'hr_l3_112: anchor 3 not found in hr._timecard_reject_reopen — refusing to guess';
  end if;

  v_new := replace(v_src,
$c1$  v_stmt := hr._knob('hr.time_and_attendance','attestation_statement') #>> '{}';
$c1$,
$c1$  -- 🚨 hr_l3_112: THE ROW'S OWN STATEMENT COMES FORWARD. Re-reading the knob here would put a
  -- freshly-edited wording into the new instance while route 5 keeps showing this row's stored
  -- one (hr.timesheet_get projects the ROW), so the employee would be shown one text and the
  -- record would carry another. SPEC-TIME §2.2: an edit is never retroactive. The knob is only
  -- the fallback for a row that somehow carries nothing.
  v_stmt := coalesce(v_ppe.attestation_statement,
                     hr._knob('hr.time_and_attendance','attestation_statement') #>> '{}');
$c1$);

  execute v_new;
end
$mig$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE DETECTOR + PUNCH BATTERY CHECK 38.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function hr.attestations_without_a_statement()
returns table(pay_period_employment_id uuid, pay_period_id uuid, employment_id uuid,
              row_state text, attested_at timestamptz, source_available boolean)
language sql
stable
security definer
set search_path to 'hr', 'public'
as $fn$
  -- A row where a PERSON ACTUALLY ATTESTED (attested_at written by hr.timecard_wf_apply on an
  -- `attested` or `attested_with_exception` decision) and no wording was recorded. source_available
  -- says whether the statement can still be recovered from that row's own attestation instance.
  select ppe.id, ppe.pay_period_id, ppe.employment_id, ppe.state, ppe.attested_at,
         exists (select 1 from hr.workflow_instance wi
                  where wi.target_token = 'hr_pay_period_employment'
                    and wi.target_id    = ppe.id
                    and wi.flow_key     = 'timecard_attestation'
                    and wi.payload ->> 'attestation_statement' is not null)
    from hr.pay_period_employment ppe
   where ppe.attested_at is not null
     and ppe.attestation_statement is null;
$fn$;

comment on function hr.attestations_without_a_statement() is
  'hr_l3_112: rows where somebody attested and the wording they attested to was never recorded. '
  'Read by hr.punch_write_path_conformance check 38. Not client-reachable.';

revoke all on function hr.attestations_without_a_statement() from public, anon, authenticated;

do $mig$
declare v_src text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'punch_write_path_conformance';
  if position('every_attestation_records_its_statement' in v_src) > 0 then return; end if;

  v_new := replace(v_src,
$anchor$  return next;

end
$function$$anchor$,
$anchor$  return next;

  ---------------------------------------------------------------- 38. every attestation records the wording it was made against
  check_key := 'every_attestation_records_its_statement';
  select coalesce(jsonb_agg(jsonb_build_object(
           'pay_period_employment_id', t.pay_period_employment_id,
           'pay_period_id', t.pay_period_id,
           'employment_id', t.employment_id,
           'row_state', t.row_state,
           'attested_at', t.attested_at,
           'recoverable_from_instance_payload', t.source_available)
           order by t.attested_at), '[]'::jsonb)
    into v_bad from hr.attestations_without_a_statement() t;
  ok       := (v_bad = '[]'::jsonb);
  severity := 'blocking';
  detail   := jsonb_build_object(
    'violations', v_bad,
    'attested_rows', (select count(*) from hr.pay_period_employment where attested_at is not null),
    'rows_carrying_a_statement', (select count(*) from hr.pay_period_employment
                                   where attestation_statement is not null),
    'why', 'hr_l3_112: hr.pay_period_employment.attestation_statement is the legal substance of an '
      || 'attestation -- the wording the employee signed, and the only thing route 5 can render '
      || 'under "What you agreed to, word for word". hr.pay_period_transition stamped it inside an '
      || 'insert ... on conflict DO NOTHING while hr._enroll_pay_period_rows created the row first, '
      || 'so the insert always conflicted and the column was never written: measured live on '
      || '2026-08-29, 1 of 200 rows carried a statement and BOTH rows where a person actually '
      || 'attested were NULL. An attested row with no statement is a signature with nothing above '
      || 'it. SPEC-TIME 2.2 binds the wording when the step is OPENED, and hr.timesheet_get shows '
      || 'the ROW, so the stamp must land whether the submit inserts the row or finds it already '
      || 'enrolled. Detector: hr.attestations_without_a_statement(). Deliberately scoped to rows '
      || 'where somebody ACTUALLY attested: a row nobody ever signed is not a broken record, and '
      || 'never_attested rows are neither counted nor filled in on anybody''s behalf.');
  return next;

end
$function$$anchor$);
  execute v_new;
end
$mig$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 5. THE CHECK IS RED RIGHT NOW — recorded before the backfill, in this transaction.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
do $red$
declare v_red integer; v_rows jsonb;
begin
  select count(*) into v_red from hr.attestations_without_a_statement();
  select detail -> 'violations' into v_rows from hr.punch_write_path_conformance()
   where check_key = 'every_attestation_records_its_statement';
  raise notice 'hr_l3_112 RED (pre-backfill): check 38 reports % attested row(s) with no statement: %',
    v_red, v_rows;
  if v_red = 0 then
    raise notice 'hr_l3_112: nothing to backfill — the check was already green on landing.';
  end if;
end
$red$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 6. THE BACKFILL — from the system's own record of the same act. No fabrication.
--
--    Each row is matched to ITS OWN instance on the real keys (target_token, target_id, flow_key).
--    Verified live before writing: 6 timecard_attestation instances over 6 distinct rows, 1:1, all
--    carrying the same 179-byte wording, and zero attested rows without a payload source. The
--    `attestation_statement is null` clause is the immutability guard: a non-null statement is
--    never touched, so this cannot rewrite anything anybody agreed to.
--
--    SCOPE — both halves of what SPEC-TIME calls for, and nothing else:
--      • rows where a person ATTESTED (attested_at not null)      — the broken legal records;
--      • rows where the step was OFFERED and the wording is on
--        the instance                                             — SPEC-TIME §2.2 stamps at OFFER
--        ("the text shown is copied onto the row"), and until the row carries it, route 5 has no
--        wording to show the employee at all. Restoring these writes exactly what the fixed writer
--        would have written at submit; it asserts NO attestation (attested_at is untouched).
--    A row with no attestation instance gets nothing — there is no offered wording to record.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
do $fill$
declare v_attested integer; v_offered integer;
begin
  perform hr.arm_write();

  with src as (
    select ppe.id,
           (ppe.attested_at is not null) as was_attested,
           wi.payload ->> 'attestation_statement' as stmt
      from hr.pay_period_employment ppe
      join hr.workflow_instance wi
        on wi.target_token = 'hr_pay_period_employment'
       and wi.target_id    = ppe.id
       and wi.flow_key     = 'timecard_attestation'
     where ppe.attestation_statement is null
       and wi.payload ->> 'attestation_statement' is not null
  ), upd as (
    update hr.pay_period_employment ppe
       set attestation_statement = src.stmt
      from src
     where ppe.id = src.id
       and ppe.attestation_statement is null     -- belt and braces: never over a non-null
    returning src.was_attested
  )
  select count(*) filter (where was_attested), count(*) filter (where not was_attested)
    into v_attested, v_offered
    from upd;

  raise notice 'hr_l3_112 BACKFILL: % attested row(s) and % offered-but-unattested row(s) restored '
               'from hr.workflow_instance.payload. No row deleted, no non-null statement rewritten.',
               v_attested, v_offered;
end
$fill$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 7. GREEN — check 38 passes, and every backfilled byte equals its own instance's payload.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
do $chk$
declare v_bad jsonb; v_mismatch integer;
begin
  select detail -> 'violations' into v_bad from hr.punch_write_path_conformance()
   where check_key = 'every_attestation_records_its_statement';
  if v_bad is null then
    raise exception 'hr_l3_112: check 38 did not install into hr.punch_write_path_conformance';
  end if;
  if v_bad <> '[]'::jsonb then
    raise exception 'hr_l3_112: check 38 is RED after the backfill: %', v_bad;
  end if;

  -- every statement now standing on a row with an instance is byte-identical to that instance's own
  select count(*) into v_mismatch
    from hr.pay_period_employment ppe
    join hr.workflow_instance wi
      on wi.target_token = 'hr_pay_period_employment' and wi.target_id = ppe.id
     and wi.flow_key = 'timecard_attestation'
   where ppe.attestation_statement is not null
     and wi.payload ->> 'attestation_statement' is not null
     and ppe.attestation_statement is distinct from wi.payload ->> 'attestation_statement';
  if v_mismatch > 0 then
    raise exception 'hr_l3_112: % row(s) disagree with their own instance payload', v_mismatch;
  end if;

  -- the writer fixes are actually in the live bodies
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hr' and p.proname = 'pay_period_transition'
                    and p.prosrc like '%attestation_statement = excluded.attestation_statement%') then
    raise exception 'hr_l3_112: hr.pay_period_transition did not take the stamp';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hr' and p.proname = 'timecard_wf_apply'
                    and p.prosrc like '%attestation_statement_missing%') then
    raise exception 'hr_l3_112: hr.timecard_wf_apply did not take the guard';
  end if;
end
$chk$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 8. CONTRACTS — a later lane re-emitting any of these bodies cannot silently discard the fix.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason,
   is_active, must_be_definer, overloads_intended)
values
  ('hr', 'pay_period_transition', 'hr_l3_112_an_attestation_records_what_it_was_made_against',
   array['attestation_statement = excluded.attestation_statement',
         'pay_period_employment.attestation_statement is null',
         'ATTESTATION STATEMENT DIVERGENCE',
         'attestationStatementsStamped'],
   array['on conflict (pay_period_id, employment_id) do nothing'],
   'THE STAMP LANDS ON BOTH PATHS, AND NEVER OVER A DIFFERENT ONE. hr._enroll_pay_period_rows '
   || 'creates the pay_period_employment row at period generation, so the submit''s insert always '
   || 'conflicts; with `do nothing` the attestation wording was never written and 1 of 200 rows '
   || 'carried it while BOTH attested rows were null (measured 2026-08-29). The do-update clause '
   || 'must survive, its `is null` where-clause must survive with it (that clause IS the '
   || 'immutability guard -- without it the same statement becomes an overwrite of a legal record), '
   || 'and the divergence refusal must survive so a second wording on one row stops the submit '
   || 'instead of silently replacing what an employee agreed to. SPEC-TIME 2.2.',
   true, true, false),

  ('hr', 'timecard_wf_apply', 'hr_l3_112_an_attestation_records_what_it_was_made_against',
   array['attestation_statement_missing',
         'coalesce(attestation_statement, inst.payload ->> ''attestation_statement'')'],
   array[]::text[],
   'AN ATTESTATION RECORDS WHAT IT WAS MADE AGAINST, OR RECORDS NOTHING. The act must (a) back-stop '
   || 'the wording from its own instance payload when the row carries none -- via coalesce, which '
   || 'reads the OLD value and therefore can only fill a NULL, never overwrite -- and (b) refuse '
   || 'outright when neither the row nor the payload carries a wording, rather than flip the row and '
   || 'manufacture a signature over nothing (SPEC-TIME 3.2: an attestation to an unstated number is '
   || 'not an attestation). Replacing the coalesce with a plain assignment would make the act '
   || 'capable of rewriting a stored statement, which is the one thing it must never do.',
   true, true, false),

  ('hr', '_timecard_reject_reopen', 'hr_l3_112_an_attestation_records_what_it_was_made_against',
   array['coalesce(v_ppe.attestation_statement'],
   array[]::text[],
   'A RE-ATTESTATION AFTER A REJECTION CARRIES THE ROW''S OWN WORDING FORWARD. Re-reading '
   || 'hr.time_and_attendance.attestation_statement here would put a freshly-edited wording into the '
   || 'new instance while hr.timesheet_get keeps showing the row''s stored one -- the employee shown '
   || 'one text and the record carrying another, and a divergence hr.pay_period_transition would '
   || 'then refuse. SPEC-TIME 2.2: an edit is never retroactive. The knob stays only as the fallback '
   || 'for a row carrying nothing.',
   true, true, false),

  ('hr', 'punch_write_path_conformance', 'hr_l3_112_an_attestation_records_what_it_was_made_against',
   array['every_attestation_records_its_statement'],
   array[]::text[],
   'Check 38 asserts that every row where a person actually attested carries the wording they '
   || 'attested to. This is the guard over a legal record: the writer defect it caught left BOTH '
   || 'live attested rows with a signature and no statement above it, and nothing anywhere said so. '
   || 'If this check is dropped, the class returns unobserved.',
   true, true, false)
on conflict (schema_name, function_name, home_migration) do nothing;

-- the contracts themselves hold
do $chk$
declare v_broken jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('function', t.qname, 'clause', t.clause,
                                               'token', t.missing_or_present)), '[]'::jsonb)
    into v_broken from hr.function_contracts_broken() t
   where t.home_migration = 'hr_l3_112_an_attestation_records_what_it_was_made_against';
  if v_broken <> '[]'::jsonb then
    raise exception 'hr_l3_112: its own contracts are broken on landing: %', v_broken;
  end if;
end
$chk$;

commit;
