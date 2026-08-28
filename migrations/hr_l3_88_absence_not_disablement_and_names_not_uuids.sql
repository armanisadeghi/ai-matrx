-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- Round 35, two L3 surfaces.
--
-- 1. 🚨 T-13's LAST CLAUSE: THE TIMESHEET ROUTE CONFIRMED A STRANGER THAT A PERSON EXISTS.
--    `/hr/time/timesheets/<employment id>` rendered a period picker — "Pick a pay period to see
--    this person's timesheet" — to a viewer with no reach, and only denied afterwards. No hours
--    leaked, but the pre-denial screen is itself the disclosure: a real id renders a picker, a
--    fake id does not, so the route answers "does this person exist?" to anyone who asks.
--    Ruled under the existence-disclosure law that already governs the directory and the chart —
--    **absence, not disablement**: a viewer who would be refused gets the SAME answer as a
--    nonexistent employment id.
--
--    I READ MY OWN DOOR'S TIERS BEFORE COLLAPSING THEM, as instructed. `hr.timesheet_get` had ONE
--    authority gate — `v_self OR hr.capability(time.read)` — so there was no existing
--    entitled-to-the-person-but-not-the-timesheet tier to preserve. The restructure below CREATES
--    that tier honestly rather than deleting the sentence: reach is now decided EARLY, and the
--    explanatory refusal survives for a viewer who passes reach and still fails the
--    period-specific self test.
--
--    🚨 AND THE OBVIOUS FIX WOULD HAVE LEAKED ANYWAY. Returning not-found at the existing
--    authority check leaves a distinguisher one argument away: a fake employment id answers
--    `employment_not_found`, while a REAL employment with a fake pay-period id answers
--    `pay_period_not_found` — which confirms the employment exists. The gate therefore moves ABOVE
--    the pay-period lookup, so a denied viewer cannot reach any branch that discriminates.
--
-- 2. THE ATTESTATION PANEL IDENTIFIED PEOPLE BY RAW UUID. `hr.pay_period_get`'s `workflow.rows`
--    carried `employment_id` and no name, so the panel whose stated job is showing whether anybody
--    was actually asked printed "Not started · 4c32b064… · row is open" six times. The name comes
--    from the DOOR, through the same suppression-aware helper as the directory, the chart, the
--    grid and the audit reads — never a client-side join, which would be a seventh caller of a
--    rule that has one implementation.
--
-- Authority: coordinator ruling (round 35, both items); SPEC-UI-IA §4.2's deliberate-disclosure
-- exception and the directory-opt-out precedent; hr_l3_64/66's one-name-rule.
--
-- Applied live as `hr_l3_88_absence_not_disablement_and_names_not_uuids`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE NOT-FOUND PAYLOAD IS RETURNED BYTE-FOR-BYTE, not a lookalike. Two objects that differ by
--    one key are two states to any client that inspects them, and the whole point is that the
--    refused viewer and the fake id are indistinguishable. Same `reason`, same `detail`, nothing
--    added — no `capability_required`, no `subject_employment_id`, which would re-confirm the id.
-- 2. THE CAPABILITY ARM IS AS-OF TODAY, which is hr_l3_43's law (current standing governs what
--    history you may read) and is what the door already used for `hr.capability`.
-- 2b. 🚨 THE SELF ARM IS IDENTITY, NOT A DATE WINDOW — AND MY FIRST CUT GOT THIS WRONG, CAUGHT BY
--    ITS OWN PROOF. I first wrote the self arm as `employments_of(v_uid, current_date)`, mirroring
--    the capability arm. That DENIED A PERSON THEIR OWN TIMESHEET whenever their employment window
--    does not contain today: the fixture subject has hire_date 2026-09-09 and status `pending`, so
--    `employments_of(..., current_date)` returns nothing and she got `employment_not_found` for her
--    own record. A future hire, a terminated employee reading last quarter, anyone mid-gap. Self is
--    an IDENTITY fact — this employment's employee is me — and identity is not date-scoped, so the
--    arm now reads `hr.employee.login_user_id = v_uid` off the row already fetched. The
--    period-specific `employments_of(v_uid, v_at)` test still runs below and still governs what the
--    subject may SEE; the early gate only governs whether the record's existence is admitted.
-- 3. THE EXPLANATORY REFUSAL SURVIVES AND NOW HAS A REAL POPULATION. A viewer who holds
--    `time.read` (or is the subject today) passes the early gate; the original period-specific test
--    still runs, and if it fails they get the full sentence naming what was missing. That is
--    exactly the "entitled to the PERSON, not to this TIMESHEET" case, and it did not previously
--    exist as a distinct tier — the ruling asked me to preserve it if it existed, and the honest
--    answer was to make it exist rather than to claim it already did.
-- 4. THE NAME GOES THROUGH `hr._subject_display_name`, SO THE PANEL INHERITS THE OPT-OUT RULE. An
--    opted-out person shows as null to a viewer the helper refuses and by name to HR — the panel
--    does not get its own opinion about who may be named. This is the seventh caller of one rule.
-- 5. THE OTHER IDS IN THAT PAYLOAD STAY. `pay_period_employment_id`, `instance_id`, `failure_id`
--    and `flow_key` are machine handles for rows the viewer is already entitled to see, and they
--    are what makes a stuck flow debuggable. The defect was a PERSON identified only by a raw
--    uuid, not the presence of uuids.

begin;

-- ── PART 1: absence, not disablement ────────────────────────────────────────────────────────
do $mig$
declare
  v_def text := pg_get_functiondef('hr.timesheet_get(uuid,uuid)'::regprocedure);
  v_anchor text :=
    E'  select * into v_emp from hr.employment where id = p_employment_id and deleted_at is null;\n'
 || E'  if not found then\n'
 || E'    return jsonb_build_object(''granted'', false, ''reason'', ''employment_not_found'',\n'
 || E'      ''detail'', ''no employment with that id is readable'');\n'
 || E'  end if;';
begin
  if position('v_reach_is_identity_not_a_date_window' in v_def) > 0 then
    return;                                     -- already carries the CORRECTED gate
  end if;
  -- upgrade a first-cut gate that date-windowed the self arm (see decision 2b)
  if position('v_reach' in v_def) > 0 then
    v_def := regexp_replace(v_def, E'\\n  -- 🚨 hr_l3_88: ABSENCE.*?end if;\\n', '', '');
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_88: timesheet_get''s employment lookup is not in the expected shape';
  end if;

  -- only declare once: the upgrade path above strips the gate BLOCK, not the declaration
  if position('v_reach boolean;' in v_def) = 0 then
    v_def := replace(v_def, '  v_self  boolean;', '  v_self  boolean;' || E'\n  v_reach boolean;');
  end if;

  v_def := replace(v_def, v_anchor, v_anchor || E'\n'
 || E'\n'
 || E'  -- 🚨 hr_l3_88: ABSENCE, NOT DISABLEMENT. A viewer with no reach gets the SAME answer as a\n'
 || E'  -- nonexistent employment id, and gets it HERE -- above the pay-period lookup -- because\n'
 || E'  -- returning it later would leave a distinguisher: a real employment with a bad period id\n'
 || E'  -- answers pay_period_not_found, which confirms the employment exists. The CAPABILITY arm is\n'
 || E'  -- as-of today (hr_l3_43); the SELF arm is identity and is NOT date-scoped -- date-scoping it\n'
 || E'  -- denied a future hire her own timesheet (decision 2b).\n'
 || E'  -- v_reach_is_identity_not_a_date_window (decision 2b)\n'
 || E'  v_reach := exists (select 1 from hr.employee e\n'
 || E'                      where e.id = v_emp.employee_id and e.login_user_id = v_uid)\n'
 || E'             or hr.capability(v_uid, ''time.read'', p_employment_id, current_date);\n'
 || E'  if not v_reach then\n'
 || E'    -- decision 1: byte-for-byte the not-found payload, nothing added.\n'
 || E'    return jsonb_build_object(''granted'', false, ''reason'', ''employment_not_found'',\n'
 || E'      ''detail'', ''no employment with that id is readable'');\n'
 || E'  end if;');

  execute v_def;
end
$mig$;

-- ── PART 2: the panel names the people it is reporting on ───────────────────────────────────
do $mig$
declare v_def text := pg_get_functiondef('hr.pay_period_get(uuid)'::regprocedure);
begin
  if position('''subject_name''' in v_def) > 0 then
    return;                                     -- already named
  end if;
  if position(E'                          ''employment_id'', h.employment_id,\n' in v_def) = 0 then
    raise exception 'hr_l3_88: pay_period_get''s workflow row projection is not in the expected shape';
  end if;

  -- decision 4: the same suppression-aware helper the directory, chart, grid and audit reads use
  v_def := replace(v_def,
    E'                          ''employment_id'', h.employment_id,\n',
    E'                          ''employment_id'', h.employment_id,\n'
 || E'                          -- hr_l3_88: the panel reports on PEOPLE; a uuid prefix is not a\n'
 || E'                          -- person. One rule, seventh caller -- opt-out honoured here too.\n'
 || E'                          ''subject_name'', hr._subject_display_name(h.employment_id, auth.uid()),\n');

  execute v_def;
end
$mig$;

-- ── contracts, so neither survives only until the next re-emit ───────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, must_be_definer, reason)
values
  ('hr','timesheet_get','hr_l3_88',
   array['v_reach'], '{}', true,
   'T-13: a viewer with no reach must get the not-found answer, and must get it ABOVE the '
   || 'pay-period lookup — returning it lower leaves a distinguisher, because a real employment '
   || 'with a bad period id answers pay_period_not_found and thereby confirms the person exists.'),
  ('hr','pay_period_get','hr_l3_88',
   array['_subject_display_name'], '{}', true,
   'The attestation progress panel reports on PEOPLE and must name them through the one '
   || 'suppression-aware rule. Losing this returns the panel to raw uuid prefixes; replacing it '
   || 'with a client-side join makes the panel the seventh place that decides who may be named.')
on conflict (schema_name, function_name, home_migration) do update
  set must_contain = excluded.must_contain, must_be_definer = excluded.must_be_definer,
      reason = excluded.reason, is_active = true;

do $chk$
declare v_ts text; v_pp text;
begin
  select prosrc into v_ts from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'timesheet_get';
  select prosrc into v_pp from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_get';

  if position('v_reach' in v_ts) = 0 then
    raise exception 'hr_l3_88: the reach gate did not land in timesheet_get';
  end if;
  -- the gate must precede the pay-period lookup, or the distinguisher survives
  if position('v_reach :=' in v_ts) > position('from hr.pay_period where id = p_pay_period_id' in v_ts) then
    raise exception 'hr_l3_88: the reach gate is BELOW the pay-period lookup — the leak is still open';
  end if;
  if position('_subject_display_name' in v_pp) = 0 then
    raise exception 'hr_l3_88: pay_period_get does not name its subjects';
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_88: a conformance check is failing';
  end if;
end
$chk$;

commit;
