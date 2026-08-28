-- HR domain L5 — migration 23 (register item HRB-017, lane L5 Leave & PTO).
--
-- 🚨 "That leave type is not available on your record." — TRUE, USELESS, AND SOMETIMES A LIE.
--
-- Round 30 hit this: the form OFFERED a policy, the submit refused `policy_not_available`, and one
-- day later the same shape succeeded. The verifier deliberately did not guess at the cause. Here
-- it is, and it is mine twice over.
--
-- **The cause.** `hr.leave_request_submit` collapsed three unrelated facts into one refusal:
--   • the policy id does not resolve **at all** (deleted, or never existed),
--   • the policy exists and is **inactive**,
--   • the policy is fine and the caller simply is not **enrolled across those dates**.
-- The one the verifier hit was the first: this lane's own proof fixture purges and recreates its
-- policy on every run, so a page loaded before a run held an id that no longer existed by submit
-- time. **My test data deleted a policy under a live session.** The date sensitivity was an
-- artifact of two attempts straddling a proof run, not a waiting-period boundary.
--
-- **Why the sentence made it worse.** *"That leave type is not available on your record"* reads as
-- a statement about the EMPLOYEE — as if they lack standing — when the truth was *"the thing you
-- picked stopped existing while this page was open; reload."* An outcome with a reason that
-- explains nothing is, to the person reading it, an outcome without a reason. That is what the
-- verifier saw and reported, and they were right to.
--
-- THE DISPLAY-PINNED-TO-DOOR LAW: whatever the door will refuse, the form says up front. A refusal
-- the form could not have predicted must at least tell the employee what changed and what to do.
--
-- Authority: SPEC-LEAVE §4.1; SPEC-UI-IA §4.1 (a refusal renders in words); the refusals-are-data
-- law. Applied live as `hr_l5_23_a_refusal_names_what_actually_happened`. Idempotent.

do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_request_submit';

  -- Replay is a no-op only when the complete replacement is already present.
  -- A partial prior edit still falls through to the exact-shape checks below.
  if v_def like '%policy_no_longer_exists%'
     and v_def like '%policy_inactive%'
     and v_def like '%not_enrolled_on_these_dates%' then
    return;
  end if;

  v_new := replace(v_def,
E'  v_pol := hr._leave_policy_at(p_leave_policy_id);\n  if v_pol.id is null or not v_pol.is_active then\n    return jsonb_build_object(''granted'', false, ''reason'',''policy_not_available'',\n      ''detail'',''That leave type is not available on your record.'');\n  end if;',
E'  -- hr_l5_23: THREE different facts, three different refusals, each naming what to DO.\n'
|| E'  -- Collapsing them into one "not available on your record" told an employee they lacked\n'
|| E'  -- standing when the actual truth was that the policy had been deleted under their open page.\n'
|| E'  v_pol := hr._leave_policy_at(p_leave_policy_id);\n'
|| E'  if v_pol.id is null then\n'
|| E'    -- The id does not resolve. Almost always a page that has been open across a change.\n'
|| E'    -- `stale_selection` is the client''s cue to refetch and re-offer, not a permissions fact.\n'
|| E'    return jsonb_build_object(''granted'', false, ''reason'',''policy_no_longer_exists'',\n'
|| E'      ''stale_selection'', true,\n'
|| E'      ''detail'',''This leave type no longer exists — it was changed or removed while this page ''\n'
|| E'             || ''was open. Reload the page and pick from the current list.'');\n'
|| E'  end if;\n'
|| E'  if not v_pol.is_active then\n'
|| E'    return jsonb_build_object(''granted'', false, ''reason'',''policy_inactive'',\n'
|| E'      ''stale_selection'', true,\n'
|| E'      ''detail'', format(''%s has been switched off, so no new time can be booked against it. ''\n'
|| E'                      || ''Reload the page to see the leave types you can use now.'', v_pol.name));\n'
|| E'  end if;');
  if v_new = v_def then
    raise exception 'hr_l5_23: the policy-availability block did not match — re-derive it';
  end if;

  -- and the enrollment refusal has to say WHICH dates, because "you are not enrolled" on a policy
  -- the form just offered is exactly as confusing as the one above.
  v_new := replace(v_new,
E'    return jsonb_build_object(''granted'', false, ''reason'',''not_enrolled'',\n      ''detail'', format(''You are not enrolled in %s.'', v_pol.name));',
E'    return jsonb_build_object(''granted'', false, ''reason'',''not_enrolled_on_these_dates'',\n'
|| E'      ''starts_on'', p_starts_on, ''ends_on'', p_ends_on,\n'
|| E'      ''detail'', format(''You are on %s, but not for %s to %s. Pick dates inside the period ''\n'
|| E'                      || ''you are enrolled for, or ask HR to extend it.'', v_pol.name,\n'
|| E'                         to_char(p_starts_on, ''FMMon FMDD''), to_char(p_ends_on, ''FMMon FMDD'')));');
  execute v_new;
end $$;

-- -----------------------------------------------------------------------------------
-- Self-proof — every refusal this door can return names an action
-- -----------------------------------------------------------------------------------

do $$
declare v_def text; v_missing text := '';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_request_submit';

  -- the collapsed refusal must be GONE, not merely supplemented
  if v_def like '%policy_not_available%' then
    raise exception 'hr_l5_23: the collapsed policy_not_available refusal is still reachable';
  end if;
  foreach v_missing in array array['policy_no_longer_exists','policy_inactive',
                                   'not_enrolled_on_these_dates'] loop
    if v_def not like '%' || v_missing || '%' then
      raise exception 'hr_l5_23: the % refusal did not land', v_missing;
    end if;
  end loop;

  -- a stale selection must be FLAGGED, so the client can refetch instead of guessing from prose
  if v_def not like '%stale_selection%' then
    raise exception 'hr_l5_23: a stale selection is not flagged for the client';
  end if;

  -- and no refusal on this door may ship without a detail sentence
  if (length(v_def) - length(replace(v_def, '''reason''', '')))
     > (length(v_def) - length(replace(v_def, '''detail''', ''))) then
    raise exception 'hr_l5_23: this door has a refusal with no detail sentence';
  end if;
end $$;
