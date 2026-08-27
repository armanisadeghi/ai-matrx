-- HR domain L1 — migration 23 (register item HRB-013, lane l1-employees).
--
-- 🚨 EVERY SELF-SERVICE WRITE IN THIS LANE WAS DEAD, AND `hr_l1_22` FIXED ONLY ONE
-- INSTANCE OF THE CLASS INSTEAD OF THE CLASS.
--
-- Applied live as `hr_l1_23_write_audit_self_basis`. Idempotent.
-- Authority: SPEC-EMPLOYEES §7.1 (self-service), §4.9 (verification consent).
--
-- ===================================================================================
-- `hr.access_audit` carries
--
--     CHECK ((NOT is_self_access) OR (basis = 'self'))
--
-- because "why was this allowed" must not say `capability` about a read or write that
-- was allowed because the actor IS the subject. `hr._l1_write_audit` — the helper this
-- whole lane's writers share — takes `p_self boolean` and then hard-codes
--
--     p_basis => 'capability', ... p_is_self_access => p_self
--
-- so the two arguments contradicted each other for **every caller that passed
-- `true`**, and the insert raised 23514 before anything was returned.
--
-- Two callers pass `true`, and both are load-bearing:
--
--   public.hr_self_update         THE ENTIRE SELF-SERVICE WRITE LANE. Every `self_free`
--                                 field — preferred name, pronouns, personal email and
--                                 phone, photo, and `directory_opt_out` — was
--                                 unwritable. Nobody could change their own preferred
--                                 name, and nobody could hide themselves from the
--                                 staff directory.
--   public.hr_verification_consent §4.9's consent record, which gates whether a
--                                 verification letter may state pay. This one is
--                                 ALWAYS self by definition — it is the employee
--                                 consenting — so it could never have worked at all.
--
-- 🚨 THE FIX IS IN THE HELPER, NOT IN THE TWO CALLERS. Patching the call sites would
-- leave the next caller that passes `true` to rediscover this the same way: through a
-- 23514 surfaced to a person who was only trying to update their own phone number. The
-- helper owns the audit row, so the helper owns the agreement between its own two
-- arguments.
--
-- 🚨 AND THE GUARD FROM `hr_l1_22` WAS TOO NARROW, WHICH IS WHY THIS SURVIVED IT. That
-- migration asserted no function pairs a literal `p_basis => 'role'|'policy'` with a
-- computed `is_self_access`. This helper writes `'capability'` and passes a
-- *parameter* rather than an inline expression, so it matched neither half. The guard
-- below is rewritten to catch a literal basis beside ANY non-false `is_self_access`,
-- whatever the literal and whatever shape the flag arrives in.
--
-- Found by wiring the directory opt-out toggle and clicking it as a real employee.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('hr._l1_write_audit(uuid,text,text,uuid[],uuid,text,text,boolean)'::regprocedure);

  if position('THE BASIS MUST AGREE WITH p_self' in v_def) > 0 then
    raise notice 'hr_l1_23: already applied';
    return;
  end if;

  v_new := replace(v_def,
    'p_purpose => p_purpose, p_basis => ''capability'', p_granted => true,',
    'p_purpose => p_purpose,' || chr(10) ||
    '    -- 🚨 THE BASIS MUST AGREE WITH p_self. `hr.access_audit` carries' || chr(10) ||
    '    -- CHECK ((NOT is_self_access) OR (basis = ''self'')), and a constant ''capability''' || chr(10) ||
    '    -- beside a caller-supplied p_self raised 23514 for EVERY caller that passed true —' || chr(10) ||
    '    -- which was the whole self-service write lane and the verification consent record.' || chr(10) ||
    '    -- ''capability'' is also untrue for an act allowed because the actor IS the subject.' || chr(10) ||
    '    p_basis => case when p_self then ''self'' else ''capability'' end, p_granted => true,');

  if v_new = v_def then
    raise exception 'hr_l1_23: the hard-coded basis was not found in _l1_write_audit';
  end if;
  execute v_new;
end $$;

-- ============================================================ assertions

do $$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_l1_write_audit';

  if v_src !~ 'THE BASIS MUST AGREE WITH p_self' then
    raise exception 'hr_l1_23: the rewrite did not land';
  end if;
  if v_src ~ 'p_basis\s*=>\s*''capability''\s*,' then
    raise exception 'hr_l1_23: the constant basis is still there';
  end if;
  -- the action vocabulary clamp must survive the edit
  if v_src !~ 'reveal_field' then
    raise exception 'hr_l1_23: the closed action vocabulary has gone missing';
  end if;
end $$;

-- 🚨 THE WIDENED STANDING GUARD, replacing `hr_l1_22`'s. Catches a literal basis of
-- ANY value paired with an `is_self_access` that is not the literal `false` — which is
-- the shape of both defects found so far, in three different functions.
do $$
declare v_bad int; v_list text;
begin
  select count(*), string_agg(n.nspname || '.' || p.proname, ', ')
    into v_bad, v_list
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('hr','public')
     and p.prosrc ~ 'p_basis\s*=>\s*''[a-z_]+'''
     and p.prosrc ~ 'p_is_self_access\s*=>\s*(?!false)'
     and p.prosrc !~ 'p_basis\s*=>\s*case';
  if v_bad > 0 then
    raise exception 'hr_l1_23: % function(s) pair a literal basis with a non-false is_self_access: %',
      v_bad, v_list;
  end if;
end $$;
