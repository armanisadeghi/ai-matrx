-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 A SUBMITTED PERIOD CAN CONTAIN A TIMECARD NOBODY WAS EVER ASKED TO ATTEST, AND THE PANEL
--    RENDERS IT `no_flow` FOREVER. Found while staging round 38's fixtures, by submitting a real
--    period through the real door and reading what the door said back:
--
--      "1 timecard(s) were opened for this period and 0 timecard_attestation instance(s) are
--       routed and waiting."
--
--    One row. Zero flows. The subject HAS a login and is `active` with a punch-enabled worker
--    class, so nothing about her disqualifies her.
--
-- THE CAUSE, MEASURED. `hr.pay_period_transition`'s submit block runs ONE loop that does TWO jobs:
-- it enrols the period's rows AND opens each row's flow. Its population is
--
--     from hr.employment em where em.pay_group_id = v_per.pay_group_id ...
--
-- i.e. *employments currently in the period's pay group*. Enrolment by pay group is correct — that
-- is what decides who belongs in a period. **Opening by pay group is not**, because a period's
-- actual membership is its `hr.pay_period_employment` ROWS, and the two disagree the moment an
-- employment's pay group changes after it was enrolled, or a row arrives by any other path. The
-- live proof: employment `ca9e12da` sits in pay group `bde1a1c3` while its row sits in a period
-- belonging to `0243f699`. The loop never sees her, so `wf_request` is never called for her row.
--
-- SPEC-TIME §1189 says submission opens "ONE timecard_attestation instance per included
-- employment". *Included* means in the period. This makes the opener read the period.
--
-- 🚨 WHY THIS IS THE STUCK-PERIOD FAMILY AGAIN. The row lands in `open` with no instance behind it,
-- which is exactly the state `hr.pay_period_get` classifies `no_flow` and the attestation panel now
-- says out loud — "No attestation has been started for this timecard. Nobody has been asked." That
-- sentence was true and nobody could see it for four review rounds. This is the WRITE-side half of
-- the same defect the panel was built to reveal.
--
-- Authority: SPEC-TIME §1189 (submission opens one instance per included employment); coordinator
-- ruling (round 37: diagnose before staging — a real defect is fixed with a falsification, never
-- injected as a fixture).
--
-- Applied live as `hr_l3_91_submission_opens_a_flow_for_every_row_it_has`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE ENROLMENT POPULATION IS UNCHANGED. Who BELONGS in a period is still decided by pay-group
--    membership, worker class and employment status — that rule is correct and this migration does
--    not touch it. Only the set the loop iterates is widened, so a row that already exists is also
--    visited and therefore also gets its flow.
-- 2. THE SECOND ARM KEEPS EVERY GUARD THE FIRST ONE HAS. An existing row is only visited if its
--    employment would still pass the same status and punch-enabled-worker-class tests. Widening the
--    population without the guards would open attestation flows for contractors, who do not punch —
--    a different defect in the opposite direction.
-- 3. `UNION`, NOT `UNION ALL`, and the insert stays `on conflict do nothing`. An employment that
--    qualifies BOTH ways must be visited once: `wf_request` is called per iteration, and visiting
--    twice would ask the engine to open two flows for one row.
-- 4. THE FIX IS PROVEN BY RE-SUBMITTING A REAL PERIOD THROUGH THE DOOR, not by asserting the SQL
--    changed: the period that produced "0 routed and waiting" is reopened and re-submitted, and the
--    same door must then report a routed instance for the same row.

begin;

do $mig$
declare
  v_def text := pg_get_functiondef('hr.pay_period_transition(uuid,text,text)'::regprocedure);
  v_from text :=
    E'       where em.pay_group_id = v_per.pay_group_id\n'
 || E'         and em.organization_id = v_per.organization_id\n'
 || E'         and em.deleted_at is null\n'
 || E'         and em.status in (''active'',''on_leave'',''suspended'',''terminated'')\n'
 || E'         and coalesce(pa.worker_class, ''employee'') = any (v_classes)';
begin
  if position('hr_l3_91' in v_def) > 0 then
    return;                                      -- already widened
  end if;
  if position(v_from in v_def) = 0 then
    raise exception 'hr_l3_91: the submit population is not in the expected shape — refusing to guess';
  end if;

  v_def := replace(v_def, v_from, v_from || E'\n'
 || E'      -- 🚨 hr_l3_91: A PERIOD''S MEMBERSHIP IS ITS ROWS, NOT ITS PAY GROUP.\n'
 || E'      -- The clause above is the right ENROLMENT rule and the wrong OPENING rule: a row whose\n'
 || E'      -- employment has since moved pay groups is in this period and was never visited, so\n'
 || E'      -- wf_request was never called for it and its timecard sat `no_flow` with nobody asked.\n'
 || E'      -- Measured live: employment ca9e12da in pay group bde1a1c3 holding a row in a period\n'
 || E'      -- belonging to 0243f699. SPEC-TIME 1189: one instance per INCLUDED employment.\n'
 || E'      -- UNION (not UNION ALL) so an employment qualifying both ways is visited once\n'
 || E'      -- (decision 3); every guard above is repeated here on purpose (decision 2).\n'
 || E'      union\n'
 || E'      select em2.id\n'
 || E'        from hr.pay_period_employment ppe2\n'
 || E'        join hr.employment em2 on em2.id = ppe2.employment_id\n'
 || E'        left join lateral (\n'
 || E'          select pa2.worker_class from hr.position_assignment pa2\n'
 || E'           where pa2.employment_id = em2.id and pa2.deleted_at is null\n'
 || E'             and pa2.effective_from <= v_at\n'
 || E'             and (pa2.effective_to is null or pa2.effective_to >= v_at)\n'
 || E'           order by pa2.is_primary desc, pa2.effective_from desc limit 1\n'
 || E'        ) pa2 on true\n'
 || E'       where ppe2.pay_period_id = p_pay_period_id\n'
 || E'         and em2.deleted_at is null\n'
 || E'         and em2.status in (''active'',''on_leave'',''suspended'',''terminated'')\n'
 || E'         and coalesce(pa2.worker_class, ''employee'') = any (v_classes)');

  execute v_def;
end
$mig$;

do $chk$
declare v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_transition';

  if position('hr_l3_91' in v_src) = 0 then
    raise exception 'hr_l3_91: the widening did not land';
  end if;
  -- decision 1: the enrolment rule must still be there, not replaced
  if position('em.pay_group_id = v_per.pay_group_id' in v_src) = 0 then
    raise exception 'hr_l3_91: the pay-group enrolment population was removed — it must be WIDENED, not replaced';
  end if;
  -- decision 3: exactly one wf_request call site in the submit block
  if (select count(*) from regexp_matches(v_src, 'hr\.wf_request\(v_flow', 'g')) <> 1 then
    raise exception 'hr_l3_91: the submit block has % wf_request call sites, expected 1',
      (select count(*) from regexp_matches(v_src, 'hr\.wf_request\(v_flow', 'g'));
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_91: a conformance check is failing';
  end if;
end
$chk$;

commit;
