-- HR domain L1 — migration 18 (register item HRB-013, lane l1-employees).
--
-- 🚨 §1.3 — "ABSENT" MEANT "PRESENT AND NULL", AND THE UI SAID SOMETHING FALSE.
--
-- Applied live as `hr_l1_18_absent_not_null`. Idempotent.
-- Authority: SPEC-EMPLOYEES §1.3; SPEC-UI-IA §4.2; SPEC-EMPLOYEES §2.3.1.
--
-- ===================================================================================
-- FOUND BY LOOKING AT A COLLEAGUE'S PROFILE AS A REAL NON-ADMIN EMPLOYEE.
--
-- Signed in as the first employee login this system has ever had (`hr_l1_16`), opening a
-- colleague's record rendered:
--
--     Dana Ruiz
--     Legal name
--     Not provided
--
-- Dana's legal name is *Dana Ruiz*. It is on the record. A viewer without `identity.read` was
-- being told **it does not exist**, which is worse than the leak §1.3 forbids — it is a false
-- statement about somebody's record, and it is exactly the "masked field" shape the rule was
-- written against: *"a field the viewer cannot access is ABSENT from the DOM — not disabled, not
-- masked, not '•••• (no access)', not a locked icon."*
--
-- 🚨 THE CAUSE IS A `jsonb_build_object` DETAIL, AND THE COMPONENT'S COMMENT ASSERTED THE OPPOSITE.
-- `ProfileHeader.tsx` says, correctly as an intent: *"THE LEGAL NAME IS ABSENT, NOT BLANK … the
-- server simply does not send `header.legal_name` to them, and `<SensitiveField>` cannot render a
-- key that is not there."* But the server built it as
--
--     'legal_name', case when v_kind in ('self','hr_admin') then … end
--
-- and **`jsonb_build_object` keeps a key whose value is NULL** — it emits `"legal_name": null`.
-- The key WAS there, `SensitiveField` found it, and "Not provided" is what it renders for a
-- present-but-empty field. Two correct-looking halves, one false sentence on screen.
--
-- 🚨 AND `jsonb_strip_nulls` WOULD BE THE WRONG FIX. Most nulls in this payload are honest:
-- `pronouns` null means the person did not set pronouns, `manager_name` null means they have no
-- manager, `work_phone` null means there is no work phone — and for every one of those "Not
-- provided" is the RIGHT answer and stripping the key would hide a real, empty field the viewer is
-- entitled to see. **The distinction is not null-ness, it is permission**, so only the two keys
-- that are permission-gated are conditionally merged rather than conditionally valued:
--
--   · `legal_name`      — self / hr_admin only (identity.read)
--   · `login_user_id`   — self / hr_admin only
--
-- Everything else keeps its null and keeps meaning "empty".
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_employee_profile(uuid, date)'::regprocedure);

  if v_def ~ 'ABSENT, NOT NULL' then
    raise notice 'hr_l1_18: already applied';
    return;
  end if;

  -- the two permission-gated keys leave the base object entirely...
  v_new := replace(v_def,
    '    ''legal_name'', case when v_kind in (''self'',''hr_admin'')
                       then trim(concat_ws('' '', v_e.legal_first_name, v_e.legal_middle_name,
                                                v_e.legal_last_name, v_e.legal_name_suffix)) end,',
    '');
  if v_new = v_def then
    raise exception 'hr_l1_18: could not find the legal_name key in hr_employee_profile';
  end if;
  v_def := v_new;

  v_new := replace(v_def,
    '    ''login_user_id'', case when v_kind in (''self'',''hr_admin'') then v_e.login_user_id end,',
    '');
  if v_new = v_def then
    raise exception 'hr_l1_18: could not find the login_user_id key in hr_employee_profile';
  end if;
  v_def := v_new;

  -- ...and are merged back only for a viewer permitted to hold them.
  v_new := replace(v_def,
    '    ''pending_change_count'', v_pending);',
    '    ''pending_change_count'', v_pending)
    -- 🚨 ABSENT, NOT NULL (§1.3). These two keys are permission-gated, so they are MERGED IN for a
    -- permitted viewer rather than emitted with a null value — `jsonb_build_object` keeps a NULL
    -- key, and a present-but-null `legal_name` renders as "Not provided", which tells a colleague
    -- the person HAS no legal name. Every other null in this payload means "empty" and is left
    -- exactly as it is; the distinction is permission, never null-ness.
    || case when v_kind in (''self'',''hr_admin'') then jsonb_build_object(
         ''legal_name'', trim(concat_ws('' '', v_e.legal_first_name, v_e.legal_middle_name,
                                            v_e.legal_last_name, v_e.legal_name_suffix)),
         ''login_user_id'', v_e.login_user_id)
       else ''{}''::jsonb end;');
  if v_new = v_def then
    raise exception 'hr_l1_18: could not find the header terminator to merge onto';
  end if;

  execute v_new;
end $$;

-- ============================================================ assertions

do $$
declare v_src text; v_bad int;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employee_profile';

  if v_src !~ 'ABSENT, NOT NULL' then
    raise exception 'hr_l1_18: the rewrite did not land';
  end if;

  -- the gated keys must NOT appear as conditionally-valued members any more
  if v_src ~ '''legal_name'', case when' then
    raise exception 'hr_l1_18: legal_name is still emitted with a conditional VALUE, which keeps '
                    'the key and renders "Not provided" to a viewer who may not see it';
  end if;
  if v_src ~ '''login_user_id'', case when' then
    raise exception 'hr_l1_18: login_user_id is still emitted with a conditional value';
  end if;

  -- and the honest nulls must survive: these mean "empty", not "forbidden"
  if v_src !~ '''pronouns'', v_e.pronouns' then
    raise exception 'hr_l1_18: pronouns lost its plain null — an unset field must still read as '
                    '"Not provided", which is true';
  end if;

  -- F1's class and the anon rule stay closed
  if (select p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='hr_employee_profile') <> 'v' then
    raise exception 'hr_l1_18: hr_employee_profile is no longer VOLATILE';
  end if;
  if has_function_privilege('anon', 'public.hr_employee_profile(uuid, date)', 'execute') then
    raise exception 'hr_l1_18: hr_employee_profile is executable by anon';
  end if;
  select count(*) into v_bad from hr.stable_doors_that_write();
  if v_bad > 0 then
    raise exception 'hr_l1_18: % non-volatile door(s) can reach a writer', v_bad;
  end if;
end $$;
