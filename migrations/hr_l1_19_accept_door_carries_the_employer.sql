-- HR domain L1 — migration 19 (register item HRB-013, lane l1-employees).
--
-- 🚨 THE ACCEPT DOOR DROPPED THE ONE THING ONLY THE INVITATION KNEW: WHICH EMPLOYER.
--
-- Applied live as `hr_l1_19_accept_door_carries_the_employer`. Idempotent.
-- Authority: SPEC-EMPLOYEES §1 (employer resolution), §5 (self-service); SPEC-ONBOARDING.
--
-- ===================================================================================
-- FOUND BY ACCEPTING AN INVITATION AS A REAL PERSON, WHICH IS WHY THAT TEST EXISTS.
--
-- Dana Ruiz accepted her employee invitation in the browser. The link landed —
-- `hr.employee.login_user_id` was set, grants were re-derived, the envelope said
-- `ok: true` — and the page followed the server's `door` to `/hr/me`, where she was told:
--
--     HR isn't turned on for this organization
--     You can turn it on in this organization's settings.
--
-- That sentence is true of an organization she has nothing to do with. Signing up creates a
-- personal workspace, so the moment she accepted she had TWO employers:
--
--     4a82ec98…  dana.ruiz's Workspace   module_enabled = false  persona = null
--     2643e470…  Write Target Sandbox    module_enabled = true   persona = employee
--
-- `hr_my_context` with no preference resolved `active = null` — correctly, because with two
-- candidates and nothing to choose between them it is not the database's job to guess. So the
-- FIRST thing a new employee ever saw was an invitation to set up HR at a company that is not
-- their employer.
--
-- 🚨 THE FIX IS NOT TO MAKE `hr_my_context` GUESS. Auto-resolving "the one where the module is
-- on" would be wrong the day somebody works for two employers who both use the product — the
-- picker is §1's specified answer whenever more than one employer genuinely resolves, and that
-- behaviour is left exactly as it is.
--
-- The defect is that `hr_invite_accept` THREW AWAY the answer. An invitation is issued by one
-- employer, for one employee, and the function already computes `v_org` and returns it in the
-- envelope — it simply did not put it in the door it told the caller to walk through. The door
-- now carries it, and `hr_my_context(p_organization_id)` — which has taken that argument since
-- `hr_l1_01` — resolves the employer the invitation was actually for.
--
-- Verified in the browser after the fix: `/hr/me?org=…` renders Dana's own record with her legal
-- name (she is `self`), her Platform account link, and the correct employer.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_invite_accept(text)'::regprocedure);

  if v_def ~ 'THE DOOR CARRIES THE EMPLOYER' then
    raise notice 'hr_l1_19: already applied';
    return;
  end if;

  -- The linked-and-done door. `v_org` is in scope here; it is what the envelope already returns.
  v_new := replace(v_def,
    '    ''grants_rederived'', true,' || chr(10) ||
    '    ''door'', ''/hr/me'');',
    '    ''grants_rederived'', true,' || chr(10) ||
    '    -- 🚨 THE DOOR CARRIES THE EMPLOYER. Accepting creates a second employer for anybody who' || chr(10) ||
    '    -- signed up with a personal workspace, and `hr_my_context` rightly refuses to guess' || chr(10) ||
    '    -- between two. Without the organization on the door, a brand-new employee lands on a' || chr(10) ||
    '    -- prompt to switch HR on at a company that is not their employer.' || chr(10) ||
    '    ''door'', ''/hr/me?org='' || v_org::text);');

  if v_new = v_def then
    raise exception 'hr_l1_19: could not find the linked door in hr_invite_accept';
  end if;

  execute v_new;
end $$;

-- ============================================================ assertions

do $$
declare v_src text; v_bad int;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_invite_accept';

  if v_src !~ 'THE DOOR CARRIES THE EMPLOYER' then
    raise exception 'hr_l1_19: the rewrite did not land';
  end if;

  -- a bare `/hr/me` door is the bug returning
  if v_src ~ '''door'', ''/hr/me''' then
    raise exception 'hr_l1_19: hr_invite_accept still returns a door with no organization';
  end if;

  -- 🚨 THE OTHER DOOR IS DELIBERATELY LEFT ALONE. The `hr_linked = false` branch means the token
  -- was an ordinary organization invitation with no employee attached — there is no HR employer
  -- to name, and pointing it at /hr/me would be worse than the bug this file fixes.
  if v_src !~ '''hr_linked'', false' then
    raise exception 'hr_l1_19: the unlinked-success branch has gone missing';
  end if;

  -- F1's class and the anon rule stay closed
  if (select p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='hr_invite_accept') <> 'v' then
    raise exception 'hr_l1_19: hr_invite_accept is not VOLATILE';
  end if;
  if has_function_privilege('anon', 'public.hr_invite_accept(text)', 'execute') then
    raise exception 'hr_l1_19: hr_invite_accept is executable by anon';
  end if;
  select count(*) into v_bad from hr.stable_doors_that_write();
  if v_bad > 0 then
    raise exception 'hr_l1_19: % non-volatile door(s) can reach a writer', v_bad;
  end if;
end $$;
