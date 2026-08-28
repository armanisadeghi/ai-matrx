-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- SPEC-LEAVE §9.6 rules the existence disclosure is governed by "one switch and only one" —
-- `hr.employees.disclosure_existence_statements`, per record class — and strikes
-- `hr.leave.case_existence_visible_to_manager`. This migration performs that retirement in the
-- ONE order that never opens a window where managers stop being told absences exist.
--
-- 🚨 THE TRAP, MEASURED BEFORE TOUCHING ANYTHING. The retiring knob is `boolean DEFAULT true` —
-- it is the switch currently turning the disclosure ON — and the survivor's platform value is
-- `{}`. Retire first and the §9.6 statement resolves through nothing, so a manager silently stops
-- being told an absence exists and schedules over approved leave. Seed first, then drop.
--
-- 🚨 AND A SECOND SWITCH THE ORDER ALONE WOULD NOT HAVE KILLED. `hr.leave_calendar` reads the
-- struck key as `hr._hr_knob(...,'true'::jsonb)` wrapped in `coalesce(..., true)` — defaulted to
-- true TWICE. So dropping the row does not turn the disclosure off; it makes it permanently ON and
-- **org-unoverridable**, because rung 1 (the org's `settings` path) and rung 2 (the platform
-- register) would both be gone and only the caller's hardcoded `true` would remain. That is
-- hr_l3_24's defect class one level down — a reader pointed at a KEY that no longer exists, rather
-- than a feature — and it would have left §9.6 with two switches again: a phantom one nobody can
-- reach, and a real one nobody reads. So the calendar is REWIRED onto the survivor between the
-- seed and the drop. §9.6 says one switch; one switch is what this leaves.
--
-- 🚨 AND THE WORDS WERE IN THE CODE. `hr.leave_calendar` emitted the §9.6 sentence as a string
-- literal in its own body, so an org could never have changed it even with the knob. The chart's
-- precedent (hr_l3_63 decision 3) is that the worded statement IS configuration; the calendar now
-- reads the sentence from the same entry that decides whether to show it. One entry, one meaning.
--
-- Authority: SPEC-LEAVE §9.6 ("one switch and only one", the struck knob named); SPEC-UI-IA §4.2's
-- verbatim example sentence and §10's declared `leave cases: on` default (§10 knob table, row
-- `hr.employees.disclosure_existence_statements`); hr_l3_63's config-not-code precedent.
--
-- Applied live as `hr_l3_69_one_switch_for_the_existence_disclosure`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE SEED GOES IN `value`, NOT `default_value`, AND THAT IS THE RECONCILIATION. The knob's
--    own description says "Empty by default because a statement nobody wrote is not a statement" —
--    and that stance must survive for every OTHER record class. `hr._hr_knob` resolves the platform
--    rung as `coalesce(k.value, k.default_value)`, so writing `value` makes §10's declared
--    `leave cases: on` true while `default_value` stays `{}`: the floor is one entry the SPEC
--    wrote, not a general licence to invent statements.
-- 2. PROVENANCE IS RECORDED IN THE ENTRY, BECAUSE THE BAR IS "WHOSE WORDS ARE THESE". The chart's
--    rule bars inventing the ORG's voice. This sentence is SPEC-UI-IA §4.2's own example, so the
--    entry carries `"provenance": "platform_authored"` and cites the section. An org override
--    replaces it wholesale and inherits no provenance claim — which is correct, because then the
--    words really are the org's.
-- 3. PRESENCE OF A STATEMENT IS THE SWITCH. `v_case_visible` becomes "this entry has a statement",
--    exactly the chart's test. It makes §9.6's own sentence — "When the knob is false, the calendar
--    entry is simply Out" — true again through the survivor: an org that clears the entry gets
--    "Out", which is the behaviour the struck boolean used to provide.
-- 4. THE DROP IS ASSERTED TO BE UNREACHABLE FIRST. The migration refuses to delete the struck row
--    while any function still references the key. Deleting a knob a live reader still names is the
--    unadministrable-ON defect above, and an assertion is cheaper than rediscovering it.

begin;

-- ── STEP 1 (FIRST, ALWAYS): the survivor learns the sentence ────────────────────────────────
update platform.feature_knob
   set value = coalesce(value, default_value, '{}'::jsonb) || jsonb_build_object(
         'leave_case', jsonb_build_object(
           'statement',  'This person has an approved leave. Details are held by HR.',
           'shows',      '[]'::jsonb,
           'provenance', 'platform_authored',
           'source',     'SPEC-UI-IA 4.2 verbatim example; SPEC-LEAVE 9.6; SPEC-UI-IA 10 default "leave cases: on"')),
       description = 'Section 1.3''s ONE permitted disclosure: a worded statement that a record '
         || 'exists without showing it. `default_value` stays {} because a statement nobody wrote '
         || 'is not a statement; the platform `value` carries the single entry the SPEC itself '
         || 'wrote (leave_case, SPEC-UI-IA 4.2''s example), which is how SPEC-UI-IA 10''s declared '
         || '"leave cases: on" default is honoured without fabricating any org''s voice. Per record '
         || 'class; org-overridable at rung 1. Presence of a statement IS the switch (SPEC-LEAVE 9.6).'
 where feature = 'hr.employees' and key = 'disclosure_existence_statements';

do $chk$
begin
  if (select value -> 'leave_case' ->> 'statement' from platform.feature_knob
       where feature='hr.employees' and key='disclosure_existence_statements')
     is distinct from 'This person has an approved leave. Details are held by HR.' then
    raise exception 'hr_l3_69 step 1: the survivor did not take the seed — refusing to proceed to the drop';
  end if;
end
$chk$;

-- ── STEP 2: the calendar moves onto the survivor (switch AND words) ─────────────────────────
do $mig$
declare
  v_def text := pg_get_functiondef('hr.leave_calendar(uuid,date,date,jsonb)'::regprocedure);
begin
  if position('v_case_stmt' in v_def) > 0 then
    return;                                    -- already rewired; replay is a no-op
  end if;
  if position('case_existence_visible_to_manager' in v_def) = 0 then
    raise exception 'hr_l3_69 step 2: hr.leave_calendar no longer reads the struck knob — shape changed, refusing to guess';
  end if;

  v_def := replace(v_def,
    'v_peers boolean; v_shows_type boolean; v_case_visible boolean; v_rung_for text;',
    'v_peers boolean; v_shows_type boolean; v_case_visible boolean; v_rung_for text; v_case_stmt text;');

  -- the ONE switch: a statement that exists is a disclosure that is on (SPEC-LEAVE §9.6)
  v_def := replace(v_def,
    E'  v_case_visible := coalesce((hr._hr_knob(''hr.leave'',''case_existence_visible_to_manager'', p_organization_id,''true''::jsonb) #>> ''{}'')::boolean, true);',
    E'  v_case_stmt := hr._hr_knob(''hr.employees'', ''disclosure_existence_statements'',\n'
 || E'                             p_organization_id, ''{}''::jsonb) -> ''leave_case'' ->> ''statement'';\n'
 || E'  v_case_visible := (v_case_stmt is not null);');

  -- the words come from the same entry that decided to show them
  v_def := replace(v_def,
    E'          then ''This person has an approved leave. Details are held by HR.''',
    E'          then v_case_stmt');

  execute v_def;
end
$mig$;

-- ── STEP 3 (ONLY NOW): the struck row dies ──────────────────────────────────────────────────
do $mig$
declare v_readers text;
begin
  select coalesce(string_agg(n.nspname||'.'||p.proname, ', '), '')
    into v_readers
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('hr','public')
     and p.prosrc ~ ('case_existence_visible' || '_to_manager');

  if v_readers <> '' then
    raise exception 'hr_l3_69 step 3: refusing to drop a knob these functions still read: %', v_readers;
  end if;

  delete from platform.feature_knob
   where feature = 'hr.leave' and key = 'case_existence_visible_to_manager';
end
$mig$;

-- ── prove the end state in the same transaction that made it ───────────────────────────────
do $chk$
declare v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_calendar';

  if position(('case_existence_visible' || '_to_manager') in v_src) > 0 then
    raise exception 'hr_l3_69: the calendar still names the struck knob';
  end if;
  if position('v_case_stmt' in v_src) = 0 then
    raise exception 'hr_l3_69: the calendar does not resolve the statement through the survivor';
  end if;
  if position('This person has an approved leave' in v_src) > 0 then
    raise exception 'hr_l3_69: the sentence is still hardcoded in the calendar body';
  end if;
  if exists (select 1 from platform.feature_knob
              where feature='hr.leave' and key='case_existence_visible_to_manager') then
    raise exception 'hr_l3_69: the struck knob row survived';
  end if;
  -- the two-switch state is dead: exactly one knob governs the disclosure
  if (select count(*) from platform.feature_knob
       where key in ('disclosure_existence_statements','case_existence_visible_to_manager')) <> 1 then
    raise exception 'hr_l3_69: the disclosure is not governed by exactly one knob';
  end if;
end
$chk$;

commit;
