-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 AN OPEN PERIOD'S BOUNDARY PANEL ASSERTED A WORLD-FACT IT HAD NOT COMPUTED.
--
--   "No workweek straddles this period's edges. Every week in this period is wholly inside it,
--    so no overtime is attributed to a neighbouring period."
--
-- That sentence renders whenever `boundary_workweek_ids` is empty. But the column is written by
-- **`hr.recompute_apply`** and by nothing else — measured: of the six functions that mention it,
-- only recompute ASSIGNS it. So on a period whose intervals have never been recomputed, empty
-- means "nobody has looked", and the panel was reading that as "we looked and found none".
--
-- 🚨 THE DISCRIMINATOR'S ANSWER IS NEITHER OF THE TWO EXPECTED WORLDS, so it is worth stating
-- exactly. Submitting does NOT populate the column — `hr.pay_period_transition` never touches it,
-- so a disclosure reading "computed at submission" would itself have been false. And the straddle
-- detection is NOT broken: its rule is that a workweek is a boundary week when its CURRENT
-- INTERVALS land in more than one `pay_period_id`, and measured live, **zero workweeks do**. Empty
-- on all 54 periods is the correct answer to the question actually asked.
--
-- Calla's week does not falsify it either. Her 18 current intervals run 2026-08-31 → 09-05 and sit
-- in ONE period — `0ba99b47` (G2S Scenario Weekly, Aug 30 → Sep 5) — because the workweek starts
-- Sunday and Aug 30 2026 IS a Sunday, so the week aligns exactly with that weekly period. The
-- "Sep 1 edge" belongs to the SEMIMONTHLY calendar, and her intervals are not stamped to it:
-- moving an employment's pay group does not re-stamp interval-days already computed.
--
-- So the defect is the one the ruling names: disclose what you know. The door now says whether the
-- boundary answer has been COMPUTED, and the panel speaks only when it has.
--
-- Authority: coordinator ruling (round 38 item 2 — a panel must never state a world-fact from an
-- unpopulated column); SPEC-TIME §2.7; hr_l3_32's boundary-week rule.
--
-- Applied live as `hr_l3_92_the_boundary_panel_says_what_it_knows`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE KNOWN-NESS TEST IS "HAS THIS PERIOD ANY CURRENT INTERVAL", because that is exactly the
--    input the boundary rule consumes. `hr.recompute_apply` decides boundary-ness by counting the
--    distinct `pay_period_id`s of a workweek's CURRENT intervals, so a period with none has had the
--    question asked of nothing. Using row count or period state instead would be a proxy: a period
--    can hold timecard rows and still have no computed interval behind them.
-- 2. IT IS A NEW FIELD, NOT A CHANGED ONE. `boundary_workweek_ids` and `boundary_note` keep their
--    exact meanings so every existing reader is untouched; `boundary_computed` is additive, and a
--    client that ignores it behaves precisely as before.
-- 3. THE SERVER DOES NOT WRITE THE UNKNOWN SENTENCE. `boundary_note` stays null when there are no
--    boundary weeks — the wording of an absence is the surface's, and the surface now has the one
--    fact it was missing to word it honestly.

begin;

do $mig$
declare
  v_def text := pg_get_functiondef('hr.pay_period_get(uuid)'::regprocedure);
  v_anchor text := E'           ''boundary_workweek_ids'', to_jsonb(coalesce(v_per.boundary_workweek_ids,''{}''::uuid[])),\n';
begin
  if position('boundary_computed' in v_def) > 0 then
    return;                                      -- already discloses
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_92: pay_period_get''s boundary projection is not in the expected shape';
  end if;

  v_def := replace(v_def, v_anchor, v_anchor
 || E'           -- 🚨 hr_l3_92: WHETHER THE BOUNDARY ANSWER IS KNOWN, not just what it is.\n'
 || E'           -- boundary_workweek_ids is written ONLY by hr.recompute_apply, whose rule counts\n'
 || E'           -- the distinct pay_period_ids of a workweek''s CURRENT intervals. A period with no\n'
 || E'           -- current interval has had that question asked of nothing, so its empty array means\n'
 || E'           -- "not computed", not "none found" -- and the panel must not read the second from\n'
 || E'           -- the first (decision 1).\n'
 || E'           ''boundary_computed'', exists (select 1 from hr.work_interval wi\n'
 || E'                                           where wi.pay_period_id = v_per.id and wi.is_current),\n');

  execute v_def;
end
$mig$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, must_be_definer, reason)
values
  ('hr','pay_period_get','hr_l3_92',
   array['boundary_computed','_subject_display_name'], '{}', true,
   'Two disclosures this door owes its panels. boundary_computed: the boundary array is written '
   || 'only by hr.recompute_apply, so empty means "not computed" on a period with no current '
   || 'intervals -- without this flag the panel asserts "no workweek straddles this period" as a '
   || 'world-fact it has not computed. _subject_display_name: the attestation panel reports on '
   || 'PEOPLE and must name them through the one suppression-aware rule (hr_l3_88).')
on conflict (schema_name, function_name, home_migration) do update
  set must_contain = excluded.must_contain, must_be_definer = excluded.must_be_definer,
      reason = excluded.reason, is_active = true;

do $chk$
declare v_src text; v_known integer; v_unknown integer;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_get';
  if position('boundary_computed' in v_src) = 0 then
    raise exception 'hr_l3_92: the disclosure did not land';
  end if;
  -- decision 2: the existing meanings are untouched
  if position('''boundary_workweek_ids''' in v_src) = 0 or position('''boundary_note''' in v_src) = 0 then
    raise exception 'hr_l3_92: an existing boundary field was disturbed';
  end if;

  -- both populations must exist, or the flag is decorative
  select count(*) filter (where exists (select 1 from hr.work_interval wi
                                         where wi.pay_period_id = pp.id and wi.is_current)),
         count(*) filter (where not exists (select 1 from hr.work_interval wi
                                             where wi.pay_period_id = pp.id and wi.is_current))
    into v_known, v_unknown
    from hr.pay_period pp;
  raise notice 'hr_l3_92: % periods have computed intervals, % do not', v_known, v_unknown;
  if v_known = 0 or v_unknown = 0 then
    raise exception 'hr_l3_92: only one population exists (known=%, unknown=%) — the flag cannot be proven both ways',
      v_known, v_unknown;
  end if;

  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_92: a conformance check is failing';
  end if;
end
$chk$;

commit;
