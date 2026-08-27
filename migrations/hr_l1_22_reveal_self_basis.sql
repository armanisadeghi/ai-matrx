-- HR domain L1 — migration 22 (register item HRB-013, lane l1-employees).
--
-- 🚨 THE SELF LANE OF THE SSN DOOR CRASHED WITH A 500, AND ONLY THE SELF LANE.
--
-- Applied live as `hr_l1_22_reveal_self_basis`. Idempotent.
-- Authority: SPEC-ACCESS §4.5 (break glass), SPEC-EMPLOYEES §1.3.
--
-- ===================================================================================
-- `hr.reveal_ssn` deliberately grants two kinds of caller:
--
--     if not (hr.capability(v_uid, 'ssn.reveal', v_subject)
--             or (v_subject is not null and v_subject = any(hr.employments_of(v_uid))))
--
-- — somebody holding the capability over this person, OR **the person themselves**.
-- The second arm is the point: your own government identifier is yours to see, and
-- it goes through the same audited door as anybody else's so that the record shows
-- you looked.
--
-- But the grant branch then wrote its audit row with a CONSTANT basis:
--
--     p_basis => 'role',
--     p_is_self_access => (v_subject is not null and v_subject = any(hr.employments_of(v_uid)))
--
-- and `hr.access_audit` carries
--
--     CHECK ((NOT is_self_access) OR (basis = 'self'))
--
-- So for the self caller — and ONLY the self caller — the two arguments contradicted
-- each other, the insert raised 23514, and the endpoint answered
-- **500 CheckViolationError**. An employee could never read their own SSN, and the
-- failure looked like a server fault rather than the contradiction it was.
--
-- 🚨 THE CONSTRAINT IS RIGHT AND THE FUNCTION WAS WRONG. `basis` is the audit log's
-- answer to "why was this allowed", and "role" is a false answer for a read that was
-- allowed because the reader IS the subject. Fixing it in the function keeps the
-- constraint doing its job: it caught a lie about authority, which is exactly what an
-- access log's constraints are for.
--
-- Found by exercising the door as a real employee against her own record while
-- proving T-L1-12 — the same read that had never been run.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('hr.reveal_ssn(uuid,text,text)'::regprocedure);

  if position('THE BASIS MUST AGREE WITH is_self_access' in v_def) > 0 then
    raise notice 'hr_l1_22: already applied';
    return;
  end if;

  v_new := replace(v_def,
    '    p_organization_id => v_org, p_action => ''reveal_field'', p_target_token => ''hr_employee_private'','
      || chr(10) ||
    '    p_purpose => coalesce(p_purpose,''payroll''), p_basis => ''role'', p_granted => true,',
    '    p_organization_id => v_org, p_action => ''reveal_field'', p_target_token => ''hr_employee_private'','
      || chr(10) ||
    '    p_purpose => coalesce(p_purpose,''payroll''),' || chr(10) ||
    '    -- 🚨 THE BASIS MUST AGREE WITH is_self_access. `hr.access_audit` carries' || chr(10) ||
    '    -- CHECK ((NOT is_self_access) OR (basis = ''self'')), and this branch used to pass a' || chr(10) ||
    '    -- constant ''role'' alongside a computed is_self_access — so the SELF caller, the one' || chr(10) ||
    '    -- the gate above deliberately admits, hit 23514 and the endpoint answered 500. An' || chr(10) ||
    '    -- employee could not read their own number. ''role'' was also simply untrue for a read' || chr(10) ||
    '    -- allowed because the reader IS the subject.' || chr(10) ||
    '    p_basis => case when (v_subject is not null and v_subject = any(hr.employments_of(v_uid)))' || chr(10) ||
    '                    then ''self'' else ''role'' end,' || chr(10) ||
    '    p_granted => true,');

  if v_new = v_def then
    raise exception 'hr_l1_22: the granted-branch audit call was not found';
  end if;
  execute v_new;
end $$;

-- ============================================================ assertions

do $$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'reveal_ssn';

  if v_src !~ 'THE BASIS MUST AGREE WITH is_self_access' then
    raise exception 'hr_l1_22: the rewrite did not land';
  end if;

  -- the self arm of the GATE must survive: this fix is about the audit row, and
  -- narrowing who may read their own number would be a different, worse change.
  if v_src !~ 'v_subject = any\(hr\.employments_of\(v_uid\)\)' then
    raise exception 'hr_l1_22: the self arm of the gate has gone missing';
  end if;

  -- and the refusal branches must still be there, both of them
  if v_src !~ 'no_capability' or v_src !~ 'justification_required' then
    raise exception 'hr_l1_22: a refusal branch has gone missing';
  end if;
end $$;

-- 🚨 STANDING GUARD, BY PATTERN. Any writer that hands `_record_access_audit` a
-- literal basis alongside a computed `is_self_access` is this bug wearing another
-- name. Counted rather than listed, so a new one fails here instead of shipping.
do $$
declare v_bad int; v_list text;
begin
  select count(*), string_agg(n.nspname || '.' || p.proname, ', ')
    into v_bad, v_list
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('hr','public')
     and p.prosrc ~ 'p_basis\s*=>\s*''(role|policy)'''
     and p.prosrc ~ 'p_is_self_access\s*=>\s*\('
     and p.proname <> 'reveal_ssn';
  if v_bad > 0 then
    raise exception 'hr_l1_22: % function(s) pair a literal basis with a computed is_self_access: %',
      v_bad, v_list;
  end if;
end $$;
