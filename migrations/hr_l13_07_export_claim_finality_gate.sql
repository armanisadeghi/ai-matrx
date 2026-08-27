-- HR L13 — migration 7 (register item HRB-025, lane lane-l13-export).
--
-- THE DOOR IS THE LAW: `hr.export_claim` REFUSES AN EXPORT OVER AN UNFINALISED WORKWEEK.
--
-- The SQL lane proved it live: `hr.export_claim` contained ZERO references to `is_final` and never
-- called `hr.export_period_facts`, so it happily minted a claim over a period whose workweek was
-- still open (claim 802f6b84, inside that lane's rolled-back proof). Finality was enforced ONLY in
-- the aidream router — the router-only posture SPEC-ACCESS forbids, because a `SECURITY DEFINER`
-- door must be safe against ANY caller: another service, a future worker, psql, a second router.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 ONE PREDICATE, AND IT IS NOT COPIED — IT IS CALLED.
--    The obvious implementation is to paste the facts door's `not w.is_final` subquery in here.
--    That is a FORK, and a forked precondition is worse than none: the two copies agree on the day
--    they are written and drift silently afterwards, so the router refuses what the door allows (or
--    the reverse) and nobody can say which one is the rule. This calls
--    `hr.export_period_facts(p_organization_id, p_pay_period_id)` and reads its
--    `pending_workweek_ids` — the SAME array §4.4's precondition is defined by, the same array the
--    router already reports, computed in exactly one place.
--
-- 2. THE REFUSAL NAMES THE WEEKS, because "not final" without an id is not actionable. The copy is
--    the guard's existing sentence, kept word-for-word so the door, the router and
--    `ExportPreconditionAlert` all say the same thing to the same person: overtime is computed
--    across a whole workweek, so an unfinalised week would export hours that can still change.
--
-- 3. ORDER: AFTER the idempotency replay, AFTER the acknowledged check, BEFORE anything is written.
--    - After the replay, because a replay must keep returning the stored outcome verbatim (§1.4).
--      Refusing a replay of an export that already exists would turn idempotency into a trap.
--    - After the acknowledged check, because double payment is the more severe finding and should
--      be the one a caller is told about when both are true.
--    - Before the version computation and the insert, so a refused claim writes nothing at all.
--
-- 4. A PERIOD THE FACTS DOOR CANNOT SEE IS REFUSED BY NAME. `export_period_facts` returns no row
--    when the pay period does not exist in this organization. Previously that fell through to an
--    opaque foreign-key 23503 at the insert; now it is a named refusal, which also closes the
--    cross-org read the missing check implied.
--
-- 5. THE ROUTER'S CHECK STAYS. It is the friendly early answer that lets a UI render the four §4.4
--    preconditions before a user commits. This is the law underneath it, not a replacement.
--
-- ⚠️ KNOWN INTERACTION, NOT INTRODUCED HERE (reported as a finding, round 5): the facts door scopes
--    its scan with `wi.pay_period_id = pp.id`, and `hr.recompute_apply` resolves that column from
--    the workweek's EXCLUSIVE end instant — so the final workweek of a workweek-aligned period gets
--    `pay_period_id = NULL` and is invisible to BOTH the router and this gate. Fixing that belongs
--    to the recompute lane; forking the predicate here to route around it is exactly what decision 1
--    forbids.
--
-- Authority: SPEC-CONTRACTS §4.4 precondition 2, §4.5, SPEC-ACCESS (no router-only enforcement).
-- Applied live as `hr_l13_07_export_claim_finality_gate`. Idempotent.
-- ===================================================================================

SET lock_timeout = '8s';

CREATE OR REPLACE FUNCTION hr.export_claim(
  p_organization_id     uuid,
  p_pay_period_id       uuid,
  p_export_format       text,
  p_idempotency_key     text,
  p_includes_pii        boolean DEFAULT false,
  p_supersedes_export_id uuid   DEFAULT NULL::uuid)
RETURNS TABLE(export_id uuid, export_version integer, replayed boolean, supersedes_export_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'hr', 'public'
AS $function$
declare
  v_existing hr.payroll_export%rowtype;
  v_ack      hr.payroll_export%rowtype;
  v_version  integer;
  v_id       uuid;
  v_user     uuid := auth.uid();
  v_actor_employment uuid;
  -- hr_l13_07: §4.4 precondition 2, read from the facts door rather than re-derived.
  v_facts    record;
begin
  -- RECORDED DECISION 8 — AN EXPORT NAMES WHO MADE IT, OR IT DOES NOT HAPPEN.
  -- `payroll_export_actor_identified` requires an actor_user_id or an actor_employment_id for
  -- every non-device actor type. Rather than letting that CHECK fire as an opaque 23514 at the
  -- end of a long call, the actor is resolved here and a caller the database cannot name is
  -- refused by name. A payroll file whose maker is unattributable is not a file we will produce.
  select e.id into v_actor_employment
    from hr.employment e
   where e.id = any (hr.employments_of(v_user))
     and e.organization_id = p_organization_id
   limit 1;
  if v_user is null and v_actor_employment is null then
    raise exception 'hr_validation_error: an export must name its actor; this call has neither an authenticated user nor an employment in organization %',
      p_organization_id using errcode = 'P0001',
      hint = 'aidream calls this under acting_as_user, so auth.uid() is the caller. A direct connection must set request.jwt.claims.';
  end if;

  -- §1.4 — the DOMAIN key is checked FIRST, before the platform claim matters. A replay returns
  -- the existing export verbatim rather than minting a second one.
  select * into v_existing
    from hr.payroll_export pe
   where pe.organization_id = p_organization_id
     and pe.idempotency_key = p_idempotency_key
   limit 1;
  if found then
    return query select v_existing.id, v_existing.export_version, true, v_existing.supersedes_export_id;
    return;
  end if;

  -- 🚨 THE ONE RULE THAT PREVENTS DOUBLE PAYMENT (§4.5). Any acknowledged export on this period
  -- closes it: payroll has taken a file, and a second file for the same period pays it twice
  -- whichever row it descends from. The only correction path is an hr.time_adjustment landing in
  -- the NEXT export, tagged to the original period.
  select * into v_ack
    from hr.payroll_export pe
   where pe.organization_id = p_organization_id
     and pe.pay_period_id = p_pay_period_id
     and pe.delivery_state = 'acknowledged'
   limit 1;
  if found then
    raise exception 'hr_export_already_acknowledged: export % for pay period % was acknowledged at % (ref %); a re-export would pay it twice',
      v_ack.id, p_pay_period_id, v_ack.acknowledged_at, coalesce(v_ack.acknowledgement_ref, '-')
      using errcode = 'P0001',
            hint = 'Correct it with an hr.time_adjustment that lands in the next export, tagged to the original period (SPEC-CONTRACTS 4.5).';
  end if;

  -- ════════════════════════════════════════════════════════════════════════════════════════════
  -- hr_l13_07 — §4.4 PRECONDITION 2, ENFORCED AT THE DOOR (decisions 1-4).
  --
  -- 🚨 THE PREDICATE IS CALLED, NOT COPIED. `hr.export_period_facts` is where "which workweeks of
  -- this period are still open" is defined; re-deriving it here would create a second rule that
  -- drifts from the first and leaves nobody able to say which is the law.
  -- ════════════════════════════════════════════════════════════════════════════════════════════
  select f.state, f.pending_workweek_ids
    into v_facts
    from hr.export_period_facts(p_organization_id, p_pay_period_id) f;

  if not found then
    raise exception 'hr_state_conflict: pay period % does not exist in organization %',
      p_pay_period_id, p_organization_id using errcode = 'P0001',
      hint = 'Check the pay period id and the organization it belongs to.';
  end if;

  if coalesce(cardinality(v_facts.pending_workweek_ids), 0) > 0 then
    raise exception 'hr_state_conflict: % workweek(s) covering pay period % are not final yet (%); overtime is computed across a whole workweek, so an unfinalised week would export hours that can still change',
      cardinality(v_facts.pending_workweek_ids),
      p_pay_period_id,
      array_to_string(v_facts.pending_workweek_ids, ', ')
      using errcode = 'P0001',
            hint = 'Finalise every workweek that touches this period, then export. hr.export_period_facts lists them as pending_workweek_ids (SPEC-CONTRACTS 4.4).';
  end if;

  if p_supersedes_export_id is not null then
    if not exists (select 1 from hr.payroll_export pe
                    where pe.id = p_supersedes_export_id
                      and pe.organization_id = p_organization_id
                      and pe.pay_period_id = p_pay_period_id) then
      raise exception 'hr_state_conflict: export % is not an export of pay period % in this organization',
        p_supersedes_export_id, p_pay_period_id using errcode = 'P0001';
    end if;
    -- §4.5's transition table: only `generated` and `failed` may be superseded.
    if not exists (select 1 from hr.payroll_export pe
                    where pe.id = p_supersedes_export_id
                      and pe.delivery_state in ('generated','failed')) then
      raise exception 'hr_state_conflict: export % is %, and only a generated or failed export may be superseded',
        p_supersedes_export_id,
        (select pe.delivery_state from hr.payroll_export pe where pe.id = p_supersedes_export_id)
        using errcode = 'P0001';
    end if;
  end if;

  -- §4.5 — export_version counts ATTEMPTS BEFORE ACKNOWLEDGMENT, not corrections after it.
  -- 🚨 ALIAS-QUALIFIED ON PURPOSE. `export_version` is also an OUT parameter of this function's
  -- RETURNS TABLE, and an unqualified reference is `ambiguous column reference` at RUNTIME, not
  -- at create time — so it compiles green and fails on the first real call. Found by
  -- scripts/hr/hrb025_guard_proof.py. Every column reference in this file that collides with an
  -- OUT parameter name is qualified for the same reason.
  select coalesce(max(pe.export_version), 0) + 1 into v_version
    from hr.payroll_export pe
   where pe.organization_id = p_organization_id
     and pe.pay_period_id = p_pay_period_id;

  perform hr.arm_write();
  begin
    insert into hr.payroll_export (
      pay_period_id, export_format, export_version, idempotency_key, generated_at,
      line_count, delivery_state, supersedes_export_id, actor_type, actor_user_id,
      actor_employment_id, organization_id, created_by, metadata)
    values (
      p_pay_period_id, p_export_format, v_version, p_idempotency_key, now(),
      0, 'generated', p_supersedes_export_id, 'hr_admin', v_user, v_actor_employment,
      p_organization_id, v_user,
      jsonb_build_object('includes_pii', p_includes_pii))
    returning id into v_id;
  exception when unique_violation then
    -- A concurrent request won the domain key between the lookup above and this insert. That is
    -- the TOCTOU §1.4 names, and the resolution is the same as the lookup's: return theirs.
    perform set_config('hr.privileged_write', '', true);
    select * into v_existing from hr.payroll_export pe
     where pe.organization_id = p_organization_id and pe.idempotency_key = p_idempotency_key limit 1;
    return query select v_existing.id, v_existing.export_version, true, v_existing.supersedes_export_id;
    return;
  end;
  perform set_config('hr.privileged_write', '', true);

  return query select v_id, v_version, false, p_supersedes_export_id;
end
$function$;

-- ── The guard: every claim above, asserted against the live object ────────────────────
DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef(to_regprocedure(
             'hr.export_claim(uuid,uuid,text,text,boolean,uuid)'));

  -- DECISION 1 — the predicate is CALLED. If this ever stops being true the door has forked.
  IF v_def NOT LIKE '%hr.export_period_facts(%' THEN
    RAISE EXCEPTION 'hr_l13_07: export_claim no longer calls hr.export_period_facts — the finality predicate has been forked';
  END IF;
  IF v_def NOT LIKE '%pending_workweek_ids%' THEN
    RAISE EXCEPTION 'hr_l13_07: export_claim does not read pending_workweek_ids';
  END IF;

  -- DECISION 1, the other direction — it must NOT have grown its own copy of the predicate.
  IF v_def LIKE '%not w.is_final%' OR v_def LIKE '%not workweek.is_final%' THEN
    RAISE EXCEPTION 'hr_l13_07: export_claim re-derives workweek finality instead of calling the facts door';
  END IF;

  -- The facts door itself must still be the single source it is being trusted as.
  IF to_regprocedure('hr.export_period_facts(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'hr_l13_07: hr.export_period_facts is missing — the gate has nothing to read';
  END IF;
  IF pg_get_functiondef(to_regprocedure('hr.export_period_facts(uuid,uuid)'))
       NOT LIKE '%not w.is_final%' THEN
    RAISE EXCEPTION 'hr_l13_07: the facts door no longer scans for unfinalised workweeks';
  END IF;

  -- §1.4 must survive the new gate: a replay still returns before any precondition is evaluated.
  IF position('idempotency_key = p_idempotency_key' in v_def)
     > position('export_period_facts' in v_def) THEN
    RAISE EXCEPTION 'hr_l13_07: the finality gate was placed BEFORE the idempotency replay — a replay would now be refused';
  END IF;
END $$;
