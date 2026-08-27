-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- Two things, both consequences of another lane seeding the founding authorities while this lane
-- was reporting that nobody had.
--
-- 1. THE ACK DROPS IDS IT IS HOLDING. `hr_activate_employer` calls
--    `hr._seed_founding_authorities(v_org, v_empl, 'activation')` INSIDE the `p_target_ids`
--    argument expression:
--
--        p_target_ids => ARRAY[v_prof, v_emp, v_empl, v_ra]
--                        || hr._seed_founding_authorities(v_org, v_empl, 'activation'),
--
--    so the uuid[] exists only for the length of that argument. It reaches the audit row and is
--    then unreachable — the envelope returns seven ids and not these. The completion panel cannot
--    render the grants activation just made, so the single highest-privilege event in the domain's
--    life confirms itself with the one part of its work left unsaid.
--
-- 2. CHECK 28'S ALLOWLIST NOW EXEMPTS NOTHING, AND ITS STATED REASON IS FALSE.
--    `hr.pay_changes_without_an_approver()` returned two rows when hr_l3_65 shipped and returns
--    ZERO now. Check 26 set the precedent in this same function: when the source is fixed, the
--    allowlist is DELETED, not re-dated.
--
-- Authority: coordinator ruling (activation ack); hr_l3_65's own "re-date only with a fix" note;
-- check 26's deleted-allowlist precedent (hr_c4_20).
--
-- Applied live as `hr_l3_67_activation_ack_names_its_founding_grants`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. HOISTED, NOT CALLED TWICE. The fix is a variable — `v_auth := hr._seed_founding_authorities(…)`
--    once, then used in both `p_target_ids` and the envelope. The tempting one-line version (call
--    it again in the return) would SEED A SECOND SET on every activation: the function is a writer,
--    not a lookup, and its name does not say so at the call site. Hoisting also keeps the audit row
--    and the ack describing the same grants by construction, which two calls could not promise.
-- 2. THE ACTION TYPE IS JOINED, NOT RETURNED. `hr._seed_founding_authorities` keeps its `uuid[]`
--    signature and its other callers keep working; the ack reads `action_type` back out of
--    `hr.approval_authority` by id. Changing a shipped signature to avoid a join is how a lane
--    breaks a caller it never looked at.
-- 3. ORDERED AND SHAPED FOR A PANEL. `jsonb_agg(… order by action_type)` — a completion panel that
--    renders "the twelve grants" in a different order on every activation looks broken. `'[]'` when
--    the seeder returns nothing, never SQL NULL and never a JSON null: hr_l3_59 is this lane's
--    standing lesson that an absent marker and a JSON null are different states to every consumer.
-- 4. THE ALLOWLIST IS DELETED AND SO IS THE SENTENCE THAT JUSTIFIED IT. Check 28's `why` asserted
--    "no authority row exists in ANY org: hr.approval_authority is empty database-wide" — measured
--    true when written, measured FALSE now (62 rows). A gate that explains itself with a claim that
--    has since become untrue teaches the next reader something wrong, so the prose is rewritten
--    rather than left standing next to a passing check.

begin;

-- ── 1. the ack names what activation granted ────────────────────────────────────────────────
do $mig$
declare
  v_def text := pg_get_functiondef('public.hr_activate_employer(jsonb)'::regprocedure);
begin
  if position('''founding_authorities''' in v_def) > 0 then
    return;                                    -- already migrated; replay is a no-op
  end if;
  if position('|| hr._seed_founding_authorities(v_org, v_empl, ''activation'')' in v_def) = 0
     or position('v_party uuid; v_audit uuid; v_jur uuid;' in v_def) = 0 then
    raise exception 'hr_l3_67: hr_activate_employer does not have the expected shape — refusing to guess';
  end if;

  v_def := replace(v_def,
    'v_party uuid; v_audit uuid; v_jur uuid;',
    'v_party uuid; v_audit uuid; v_jur uuid; v_auth uuid[];');

  -- seed ONCE, into a variable both the audit row and the ack read
  v_def := replace(v_def,
    E'  v_audit := hr._record_access_audit(',
    E'  v_auth := hr._seed_founding_authorities(v_org, v_empl, ''activation'');\n\n'
 || E'  v_audit := hr._record_access_audit(');

  v_def := replace(v_def,
    E'    p_target_ids => ARRAY[v_prof, v_emp, v_empl, v_ra]\n'
 || E'                    || hr._seed_founding_authorities(v_org, v_empl, ''activation''),',
    E'    p_target_ids => ARRAY[v_prof, v_emp, v_empl, v_ra] || v_auth,');

  v_def := replace(v_def,
    E'    ''role_assignment_id'', v_ra, ''audit_id'', v_audit);',
    E'    ''role_assignment_id'', v_ra, ''audit_id'', v_audit,\n'
 || E'    ''founding_authorities'', (\n'
 || E'       select coalesce(jsonb_agg(jsonb_build_object(\n'
 || E'                ''id'', aa.id, ''action_type'', aa.action_type) order by aa.action_type), ''[]''::jsonb)\n'
 || E'         from hr.approval_authority aa\n'
 || E'        where aa.id = any(v_auth)));');

  execute v_def;
end
$mig$;

-- ── 2. check 28 loses an allowlist it no longer needs, and a sentence that is no longer true ──
do $mig$
declare
  v_def text := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);
  v_new text;
begin
  -- remove block 28 (the last block) and re-insert exactly one copy
  v_def := regexp_replace(v_def, E'\\n  -{10,} 28\\. .*(?=\\nend\\n)', '', '');

  v_new := E'\n'
  || E'  ---------------------------------------------------------------- 28. a pay change nobody can approve\n'
  || E'  check_key := ''every_pay_change_has_an_approver'';\n'
  || E'  select coalesce(jsonb_agg(jsonb_build_object(\n'
  || E'           ''subject'', t.subject, ''compensation_id'', t.compensation_id,\n'
  || E'           ''has_manager'', t.has_manager, ''shape'', t.shape) order by t.subject), ''[]''::jsonb)\n'
  || E'    into v_bad\n'
  || E'    from hr.pay_changes_without_an_approver() t;\n'
  || E'  ok       := (v_bad = ''[]''::jsonb);\n'
  || E'  severity := ''blocking'';\n'
  || E'  detail   := jsonb_build_object(\n'
  || E'    ''violations'', v_bad,\n'
  || E'    ''why'', ''A pay change nobody can approve stalls with no error anywhere. RULE 2b, the ''\n'
  || E'      || ''reporting-line rung that closed check 26, is gated on sole_authority_mode = ''\n'
  || E'      || ''auto_record, so it reaches timecard/leave/swap and deliberately never reaches ''\n'
  || E'      || ''pay_change_approve -- correctly, since a manager must not approve their report''''s ''\n'
  || E'      || ''pay alone. That left a managed subject failing RULE 2 (no authority row), RULE 2b ''\n'
  || E'      || ''(wrong mode) and RULE 3 (top-of-chart only), so nobody could act: two live rows ''\n'
  || E'      || ''were in exactly that state on 2026-08-27 and rode a dated allowlist here. They are ''\n'
  || E'      || ''fixed at the SOURCE -- activation now seeds the owner as rank-1 holder of the ''\n'
  || E'      || ''require_second_actor actions, so a fresh org can approve a pay change without a ''\n'
  || E'      || ''hand-grant -- so the allowlist is DELETED rather than re-dated, per check 26''''s ''\n'
  || E'      || ''precedent. This check now blocks on ANY unapprovable pay change, with no ''\n'
  || E'      || ''exemptions. NOTE for whoever reads this next: the earlier claim that ''\n'
  || E'      || ''hr.approval_authority was empty database-wide was true when measured and is not ''\n'
  || E'      || ''true now.'');\n'
  || E'  return next;\n';

  v_def := regexp_replace(v_def, E'(?=\\nend\\n)', v_new, '');
  execute v_def;
end
$mig$;

-- ── 3. prove it in the same transaction that changed it ─────────────────────────────────────
do $chk$
declare v_src text; v_n integer; v_28 boolean; v_27 boolean;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_activate_employer';

  -- the seeder is a WRITER: it must be called exactly once, or activation grants two sets
  if (select count(*) from regexp_matches(v_src, '_seed_founding_authorities', 'g')) <> 1 then
    raise exception 'hr_l3_67: hr_activate_employer calls the seeder % times, expected exactly 1',
      (select count(*) from regexp_matches(v_src, '_seed_founding_authorities', 'g'));
  end if;
  if position('''founding_authorities''' in v_src) = 0 then
    raise exception 'hr_l3_67: the ack does not carry founding_authorities';
  end if;

  select count(*) into v_n from hr.punch_write_path_conformance();
  select ok into v_27 from hr.punch_write_path_conformance()
   where check_key = 'directory_names_use_the_one_rule';
  select ok into v_28 from hr.punch_write_path_conformance()
   where check_key = 'every_pay_change_has_an_approver';

  if v_n <> 28 then
    raise exception 'hr_l3_67: expected 28 checks, found %', v_n;
  end if;
  if v_27 is null or not v_27 then
    raise exception 'hr_l3_67: check 27 regressed — block 27 did not survive the block-28 rewrite';
  end if;
  if v_28 is null or not v_28 then
    raise exception 'hr_l3_67: check 28 is failing with the allowlist removed';
  end if;
  if (select count(*) from regexp_matches(
        (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'hr' and p.proname = 'punch_write_path_conformance'),
        'eeb61ea4', 'g')) > 0 then
    raise exception 'hr_l3_67: the dated allowlist is still present in check 28';
  end if;
end
$chk$;

commit;
