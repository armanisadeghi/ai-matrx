-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 THE ORG CHART HONOURED `directory_opt_out` NOWHERE AT ALL — measured before building.
--
-- The ruling reads as "stop hiding the node, show it anonymously instead". The live door does not
-- hide anything: `public.hr_org_chart` contains ZERO references to `directory_opt_out` and emits
-- `display_name` verbatim in BOTH of its people arrays (`nodes` and `unplaced`). So relative to the
-- directory — which drops an opted-out person entirely — the chart was the leak, not the eraser.
-- The fix lands in the same place either way, but the starting point is worth recording: this
-- migration ADDS a suppression that was absent, rather than loosening one that was too tight.
--
-- §4.2's structure/directory split is what makes the anonymous node lawful: a chart is structural,
-- so a suppressed node still has to exist or its reports dangle under nobody; a directory is not,
-- so its full suppression stands and is untouched here.
--
-- Authority: coordinator ruling (org chart opt-out); SPEC-ACCESS §4.2 deliberate-disclosure
-- exception; the `hr.employees.disclosure_existence_statements` knob.
--
-- Applied live as `hr_l3_63_org_chart_suppresses_the_name_not_the_node`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. ONE SUPPRESSION RULE, NOW FIVE CALLERS. The name goes through `hr._subject_display_name`, the
--    same helper behind `subject_name`, the audit reads, and the grid's manager column. HR and the
--    subject still see the name because the helper's own arms say so — not because this door
--    re-implements them. A second predicate here is how the chart and the directory would come to
--    disagree about one person.
-- 2. `opted_out` IS THE PERSON'S PREFERENCE, NOT THIS VIEWER'S OUTCOME. It is read from the raw
--    flag, so HR sees `opted_out: true` WITH the name — which is the useful thing for HR to know —
--    while a peer sees the flag with `display_name: null`. Deriving it from "did the name come back
--    null" would have conflated a preference with a permission and made HR's node look ordinary.
-- 3. 🚨 WHAT ELSE RENDERS IS CONFIG, NOT CODE. The ruling is explicit, and the knob's own
--    description agrees: "a statement nobody wrote is not a statement". So the worded statement AND
--    the field list both come from `hr.employees.disclosure_existence_statements`, keyed
--    `org_chart_opted_out`:
--
--        {"org_chart_opted_out": {"statement": "…", "shows": ["job_title","department","location"]}}
--
--    It is `{}` by default, so out of the box a suppressed node renders as structure alone: no
--    name, no title, no department, no statement. An org turns each field on by writing one. I did
--    NOT seed a statement — writing the words on the org's behalf is exactly the thing the knob
--    exists to prevent, and a default sentence would be a disclosure nobody authored.
-- 7. 🚨 THE EXTRA FIELDS ARE GATED ON THIS VIEWER'S OUTCOME, NOT ON THE RAW FLAG. The first cut
--    gated title/department/location/photo on `directory_opt_out` itself, which meant HR saw the
--    NAME but lost the TITLE — an internally contradictory node, and a quiet degradation of the one
--    chart the ruling says must be unchanged. Caught by reading HR's row in the proof rather than
--    the peer's. They now gate on whether the name came back at all: the helper's arms decide once,
--    and everything else follows that single answer. Computed in a lateral so the helper runs once
--    per row rather than once per field.
-- 4. BOTH ARRAYS, BECAUSE `unplaced` IS PEOPLE TOO. `nodes` and `unplaced` each emitted the name.
--    Suppressing only the charted half would have left the opted-out person named in the list of
--    everyone the chart could not place — the same leak, one array over.
-- 5. THE STRUCTURE IS UNTOUCHED. `employment_id`, `manager_employment_id`, the dotted lines and the
--    cycle walk all still carry the real ids, so reports stay attached and the graph still resolves.
--    Only the human-readable fields move.
-- 6. THE DIRECTORY IS NOT TOUCHED. `hr_directory_list` keeps dropping the row entirely, and the
--    proof asserts it, because §4.2's exception is about a surface whose law requires the node —
--    which a directory's is not.

do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_org_chart(uuid,date)'::regprocedure);

  if position('sup.nm' in v_def) > 0 then
    raise notice 'hr_l3_63: the chart already suppresses the name in its final shape';
    return;
  end if;

  -- Converge a build that took the first cut of this migration, where the extra fields were gated
  -- on the raw flag instead of on this viewer's outcome (decision 7).
  if position('hr._subject_display_name(c.employment_id, v_uid)' in v_def) > 0 then
    v_def := replace(v_def,
      '    left join hr.employee   e  on e.id = c.employee_id',
      '    left join hr.employee   e  on e.id = c.employee_id' || E'\n' ||
      '    left join lateral (select hr._subject_display_name(c.employment_id, v_uid) nm) sup on true');
    v_def := replace(v_def,
      '''display_name'', hr._subject_display_name(c.employment_id, v_uid),', '''display_name'', sup.nm,');
    v_def := replace(v_def,
      'case when not coalesce(e.directory_opt_out, false)', 'case when sup.nm is not null');
    execute v_def;
    return;
  end if;

  ---------------------------------------------------------------- the knob, read once (decision 3)
  if position('  v_earliest date; v_cycles jsonb;' in v_def) = 0 then
    raise exception 'hr_l3_63: hr_org_chart''s declare block has moved; refusing to guess';
  end if;
  v_def := replace(v_def,
    '  v_earliest date; v_cycles jsonb;',
    '  v_earliest date; v_cycles jsonb;' || E'\n' ||
    '  v_disc jsonb; v_stmt text; v_shows jsonb;');

  if position('  v_history := coalesce((hr._knob(''hr.employees'',''org_chart_history_enabled'') #>> ''{}'')::boolean, true);' in v_def) = 0 then
    raise exception 'hr_l3_63: the history knob read has moved; refusing to guess';
  end if;
  v_def := replace(v_def,
    '  v_history := coalesce((hr._knob(''hr.employees'',''org_chart_history_enabled'') #>> ''{}'')::boolean, true);',
    '  v_history := coalesce((hr._knob(''hr.employees'',''org_chart_history_enabled'') #>> ''{}'')::boolean, true);' || E'\n\n' ||
    '  -- hr_l3_63 decision 3: §4.2''''s deliberate-disclosure exception is CONFIGURATION. The worded' || E'\n' ||
    '  -- statement and the fields a suppressed node may still show both come from the org''''s own' || E'\n' ||
    '  -- knob; empty by default, because a statement nobody wrote is not a statement.' || E'\n' ||
    '  v_disc  := hr._hr_knob(''hr.employees'', ''disclosure_existence_statements'',' || E'\n' ||
    '                         p_organization_id, ''{}''::jsonb) -> ''org_chart_opted_out'';' || E'\n' ||
    '  v_stmt  := v_disc ->> ''statement'';' || E'\n' ||
    '  v_shows := coalesce(v_disc -> ''shows'', ''[]''::jsonb);');

  ---------------------------------------------------------------- the nodes (decisions 1, 2, 5)
  if position('           ''display_name'', c.display_name, ''job_title_id'', c.job_title_id,' in v_def) = 0 then
    raise exception 'hr_l3_63: the node projection has moved; refusing to guess';
  end if;
  v_def := replace(v_def,
    '           ''display_name'', c.display_name, ''job_title_id'', c.job_title_id,' || E'\n' ||
    '           ''job_title'', jt.title, ''department_id'', c.department_id, ''department'', d.name,' || E'\n' ||
    '           ''location_id'', c.location_id, ''location'', l.name,',
    '           -- hr_l3_63: the NAME is suppressed, never the node. Same helper as the directory' || E'\n' ||
    '           -- and the audit reads (decision 1); HR and the subject still see it.' || E'\n' ||
    '           ''display_name'', sup.nm,' || E'\n' ||
    '           -- decision 2: the person''''s preference, not this viewer''''s outcome' || E'\n' ||
    '           ''opted_out'', coalesce(e.directory_opt_out, false),' || E'\n' ||
    '           ''disclosure_statement'', case when coalesce(e.directory_opt_out, false) then v_stmt end,' || E'\n' ||
    '           ''job_title_id'', c.job_title_id,' || E'\n' ||
    '           -- decision 3: on a suppressed node these render only if the org wrote them in' || E'\n' ||
    '           ''job_title'', case when sup.nm is not null' || E'\n' ||
    '                              or v_shows ? ''job_title'' then jt.title end,' || E'\n' ||
    '           ''department_id'', c.department_id,' || E'\n' ||
    '           ''department'', case when sup.nm is not null' || E'\n' ||
    '                               or v_shows ? ''department'' then d.name end,' || E'\n' ||
    '           ''location_id'', c.location_id,' || E'\n' ||
    '           ''location'', case when sup.nm is not null' || E'\n' ||
    '                             or v_shows ? ''location'' then l.name end,');

  -- the photo is a picture of a face; it goes with the name
  if position('           ''photo_file_id'', e.photo_file_id) order by c.display_name), ''[]''::jsonb)' in v_def) = 0 then
    raise exception 'hr_l3_63: the node tail has moved; refusing to guess';
  end if;
  v_def := replace(v_def,
    '           ''photo_file_id'', e.photo_file_id) order by c.display_name), ''[]''::jsonb)',
    '           ''photo_file_id'', case when sup.nm is not null' || E'\n' ||
    '                                  then e.photo_file_id end) order by c.display_name), ''[]''::jsonb)');

  -- decision 7: one helper call per row, feeding every field's condition
  v_def := replace(v_def,
    '    left join hr.employee   e  on e.id = c.employee_id',
    '    left join hr.employee   e  on e.id = c.employee_id' || E'\n' ||
    '    left join lateral (select hr._subject_display_name(c.employment_id, v_uid) nm) sup on true');

  ---------------------------------------------------------------- the unplaced (decision 4)
  if position('           ''employment_id'', em.id, ''employee_id'', e.id, ''display_name'', e.display_name,' in v_def) = 0 then
    raise exception 'hr_l3_63: the unplaced projection has moved; refusing to guess';
  end if;
  v_def := replace(v_def,
    '           ''employment_id'', em.id, ''employee_id'', e.id, ''display_name'', e.display_name,',
    '           -- decision 4: unplaced people are people. The same rule, one array over.' || E'\n' ||
    '           ''employment_id'', em.id, ''employee_id'', e.id,' || E'\n' ||
    '           ''display_name'', hr._subject_display_name(em.id, v_uid),' || E'\n' ||
    '           ''opted_out'', coalesce(e.directory_opt_out, false),' || E'\n' ||
    '           ''disclosure_statement'', case when coalesce(e.directory_opt_out, false) then v_stmt end,');

  execute v_def;
end
$mig$;

-- ── self-assertions ─────────────────────────────────────────────────────────────────────────
do $chk$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid='public.hr_org_chart(uuid,date)'::regprocedure;

  -- decision 1: the shared helper, in BOTH arrays, and no local re-implementation
  if (select count(*) from regexp_matches(v_src, '_subject_display_name', 'g')) <> 2 then
    raise exception 'hr_l3_63: both people arrays must route through the shared helper';
  end if;
  if position('c.display_name,' in v_src) > 0 or position('''display_name'', e.display_name' in v_src) > 0 then
    raise exception 'hr_l3_63: a raw display_name still reaches the wire';
  end if;

  -- decision 3: the statement and the field list are read from the knob, never written here
  if position('disclosure_existence_statements' in v_src) = 0 then
    raise exception 'hr_l3_63: the disclosure statement is not read from configuration';
  end if;
  if v_src ~ 'This person|at their request|name is not shown' then
    raise exception 'hr_l3_63: a disclosure sentence was hardcoded; that is the org''s to write';
  end if;

  -- decision 7: no field may gate on the raw flag; they gate on the resolved name
  if position('case when not coalesce(e.directory_opt_out, false)' in v_src) > 0 then
    raise exception 'hr_l3_63: a field still gates on the raw flag, so HR would lose it';
  end if;
  if position('left join lateral (select hr._subject_display_name(c.employment_id, v_uid) nm) sup' in v_src) = 0 then
    raise exception 'hr_l3_63: the name is not resolved once per row';
  end if;

  -- decision 5: the structure still carries real ids
  if position('''manager_employment_id'', c.manager_employment_id' in v_src) = 0 then
    raise exception 'hr_l3_63: the chart lost its edges';
  end if;

  -- decision 6: the directory is untouched and still drops the row entirely
  if (select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='hr_directory_list')
     !~ 'not e\.directory_opt_out or v_persona = ''hr_admin'' or e\.login_user_id = v_uid' then
    raise exception 'hr_l3_63: the directory''s own suppression was disturbed';
  end if;

  -- the knob is still empty by default: no statement was seeded on anybody's behalf
  if (select count(*) from platform.feature_knob
       where feature='hr.employees' and key='disclosure_existence_statements'
         and default_value::text <> '{}') > 0 then
    raise exception 'hr_l3_63: the disclosure knob default is no longer empty';
  end if;
end
$chk$;
