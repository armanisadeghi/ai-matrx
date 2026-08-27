-- HR domain L1 — migration 15 (register item HRB-013, lane l1-employees).
--
-- 🚨 N1 — `hr._clock_knob` HAD NO ORGANIZATION RUNG, SO THE ORG-LEVEL KIOSK SWITCH WAS INERT.
--
-- Applied live as `hr_l1_15_clock_knob_org_rung`. Idempotent.
-- Authority: G2-VERIFICATION-2026-08-26 § RE-RUN N1; SPEC-EMPLOYEES §10 (the D13 ladder);
-- SPEC-TIME §13; SPEC-UI-IA §10.
--
-- ===================================================================================
-- THIS IS THIS LANE'S DEFECT, INTRODUCED BY THIS LANE'S OWN FIX.
--
-- `hr_l1_11` repointed `hr._clock_knob` from the empty `hr.clock` slug to `hr.time_and_attendance`,
-- which was right and which made the four SPEC-UI-IA §10 keys resolve for the first time. It did
-- not notice that the helper reads **only** `platform.feature_knob`:
--
--     select coalesce(k.value, k.default_value) into v
--       from platform.feature_knob k
--      where k.feature = 'hr.time_and_attendance' and k.key = p_key;
--
-- `platform.feature_knob` is the PLATFORM rung and **has no organization column**. The org rung of
-- the D13 ladder lives in `iam.organizations.settings`, which this function never read. So:
--
--   · `kiosk_enabled` is `false` at platform level (deliberately — a kiosk mints a device secret
--     and admits punches with no `auth.uid()`, so it must be switched on knowingly);
--   · an admin switching it ON in the Devices UI writes `settings->hr->time_and_attendance->
--     kiosk_enabled = true`, which the verifier confirmed lands;
--   · `hr_kiosk_claim_pairing`'s gate reads the helper, sees the platform `false`, and refuses
--     **every claim in every organization, permanently.**
--
-- The verifier proved it end to end: knob flipped on through the product, a valid unexpired code
-- (`PAIR-QDGK3R`), a clean signed-out browser, and *"That pairing code cannot be used."*
--
-- 🚨 AND THE FUNCTION'S OWN COMMENT DESCRIBED THE STATE IT WAS CREATING. It said an absent knob row
-- must never mean false, because *"refusing every device because a platform default is unseeded
-- would be a state nobody could fix from inside the product."* A **present** platform row of
-- `false` produced exactly that state, and the org-level opt-in that would fix it was the one thing
-- the gate could not see. A comment describing the right principle is not the same as code that
-- implements it.
--
-- **The fix is the ladder, not a special case.** `hr._clock_knob` now takes an optional
-- organization and resolves org override → platform value → platform default → the caller's
-- literal, which is §10's ladder for every other HR knob. The three callers pass the org they
-- already hold. `hr.time_and_attendance` scope rungs below the org (pay group, location) are not
-- consulted here because none of these four keys carries one.
--
-- 🚨 THE THREE CALLERS ARE REWRITTEN PROGRAMMATICALLY FROM THEIR LIVE DEFINITIONS, not retyped.
-- Two of them (`hr.clock_state`, `hr.punch_record`) belong to lane L3 and are large; re-authoring
-- them here to change one argument would risk clobbering that lane's in-flight work with a stale
-- copy. Each has exactly ONE `hr._clock_knob(...)` call site, verified by regex before the
-- rewrite, so a targeted string replacement over `pg_get_functiondef` is exact and preserves
-- everything else byte for byte. The same technique the outsider-scope fix used.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ the helper, with the org rung

create or replace function hr._clock_knob(
  p_key text,
  p_default jsonb default 'null'::jsonb,
  p_organization_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare v jsonb;
begin
  -- rung 1: THE ORGANIZATION'S OWN OVERRIDE. This is the rung whose absence made the settings UI
  -- inert — an admin can switch the kiosk on, and until now nothing read the switch.
  if p_organization_id is not null then
    select o.settings #> array['hr','time_and_attendance', p_key] into v
      from iam.organizations o where o.id = p_organization_id;
    if v is not null then return v; end if;
  end if;

  -- rung 2: the platform value, then the value it shipped with
  select coalesce(k.value, k.default_value) into v
    from platform.feature_knob k
   where k.feature = 'hr.time_and_attendance' and k.key = p_key;
  if v is not null then return v; end if;

  -- rung 3: the caller's literal. NOT `hr._knob`'s raise, deliberately — SPEC-TIME §13: "an absent
  -- knob row is not an opt-out and never means false." An administrator issuing a pairing code is
  -- the org's opt-in, and a kiosk that refused every device over an unseeded platform default
  -- would be unfixable from inside the product. That sentence is now true of the code as well.
  return p_default;
end
$fn$;

comment on function hr._clock_knob(text, jsonb, uuid) is
  'The D13 ladder for the four SPEC-UI-IA §10 time keys: org override (iam.organizations.settings) '
  '→ platform.feature_knob → the caller''s literal. The org rung is not optional decoration — '
  'without it the Devices UI''s kiosk switch is inert and hr_kiosk_claim_pairing refuses every '
  'device in every organization (G2 re-run N1).';

-- ============================================================ the three callers, rewritten in place

do $$
declare
  r record;
  v_def text;
  v_new text;
  v_hits int;
  v_rewritten int := 0;
begin
  for r in
    select p.oid, n.nspname, p.proname,
           case
             -- each caller already holds the organization; this is the expression that reaches it
             when n.nspname = 'hr' and p.proname in ('clock_state','punch_record')
               then '(select em.organization_id from hr.employment em where em.id = p_employment_id)'
             when n.nspname = 'public' and p.proname = 'hr_kiosk_claim_pairing'
               then 'd.organization_id'
           end as org_expr
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname = 'hr' and p.proname in ('clock_state','punch_record'))
        or (n.nspname = 'public' and p.proname = 'hr_kiosk_claim_pairing')
  loop
    v_def := pg_get_functiondef(r.oid);

    -- refuse to guess: rewrite only where there is exactly ONE call site of the two-argument form
    select count(*) into v_hits
      from regexp_matches(v_def, 'hr\._clock_knob\([^)]*\)', 'g');
    if v_hits <> 1 then
      raise exception 'hr_l1_15: %.% has % hr._clock_knob call sites, expected exactly 1 — '
                      'rewrite by hand rather than by pattern',
                      r.nspname, r.proname, v_hits;
    end if;

    -- already three-argument? then this file has run before; leave it alone.
    if v_def ~ 'hr\._clock_knob\([^)]*,[^)]*,[^)]*\)' then
      continue;
    end if;

    v_new := regexp_replace(
               v_def,
               '(hr\._clock_knob\([^)]*)\)',
               '\1, ' || r.org_expr || ')');

    if v_new = v_def then
      raise exception 'hr_l1_15: the rewrite of %.% changed nothing', r.nspname, r.proname;
    end if;

    execute v_new;
    v_rewritten := v_rewritten + 1;
  end loop;

  raise notice 'hr_l1_15: rewrote % caller(s) to pass the organization', v_rewritten;
end $$;

-- ============================================================ assertions

do $$
declare v_bad int; v_names text; v_org uuid; v_before jsonb; v_probe jsonb;
begin
  -- every caller must now pass an organization; a two-argument call is the bug returning
  select count(*), string_agg(n.nspname||'.'||p.proname, ', ') into v_bad, v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('hr','public')
     and p.proname in ('clock_state','punch_record','hr_kiosk_claim_pairing')
     and p.prosrc like '%_clock_knob%'
     and p.prosrc !~ 'hr\._clock_knob\([^)]*,[^)]*,[^)]*\)';
  if v_bad > 0 then
    raise exception 'hr_l1_15: % caller(s) still call hr._clock_knob without an organization: %',
      v_bad, v_names;
  end if;

  -- 🚨 A PLANTED KNOWN-BAD CASE, because this is exactly the shape that shipped broken: an org
  -- whose override says TRUE must beat a platform default of FALSE. Rolled back after.
  select id, settings into v_org, v_before from iam.organizations limit 1;

  if (hr._clock_knob('kiosk_enabled', 'null'::jsonb) #>> '{}')::boolean is not false then
    raise exception 'hr_l1_15: the platform default for kiosk_enabled is not false; the probe '
                    'below would prove nothing';
  end if;

  update iam.organizations
     set settings = coalesce(settings, '{}'::jsonb)
                    || jsonb_build_object('hr',
                         coalesce(settings -> 'hr', '{}'::jsonb)
                         || jsonb_build_object('time_and_attendance',
                              coalesce(settings #> '{hr,time_and_attendance}', '{}'::jsonb)
                              || jsonb_build_object('kiosk_enabled', true)))
   where id = v_org;

  v_probe := hr._clock_knob('kiosk_enabled', 'null'::jsonb, v_org);
  if (v_probe #>> '{}')::boolean is not true then
    raise exception 'hr_l1_15: the org override does NOT beat the platform default (got %) — N1 '
                    'is not fixed', v_probe;
  end if;

  -- and with no org supplied it must still fall back to the platform value, not to the org's
  if (hr._clock_knob('kiosk_enabled', 'null'::jsonb) #>> '{}')::boolean is not false then
    raise exception 'hr_l1_15: the org-less form leaked an organization override';
  end if;

  update iam.organizations set settings = v_before where id = v_org;
  if (select settings from iam.organizations where id = v_org) is distinct from v_before then
    raise exception 'hr_l1_15: failed to restore the probed org''s settings';
  end if;

  -- F1's class stays closed
  select count(*) into v_bad from hr.stable_doors_that_write();
  if v_bad > 0 then
    raise exception 'hr_l1_15: % non-volatile door(s) can reach a writer', v_bad;
  end if;
end $$;
