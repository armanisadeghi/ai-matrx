-- VISION-REACH W5 — A PLANNED FORMULA AGREES WITH custom.formula_eval ON THE VALUES THAT BREAK
-- THINGS, AND THE COMMON SHAPES ARE ACTUALLY PLANNED.
--
-- The all-Fields twin (visionreach_w5_formula_planned_equality.sql) compares what organizations
-- happen to have written. This one writes, in a rolled-back transaction as admin@admin.com in
-- Cedar Ridge Physical Therapy, a "Billing formula audit" Table whose rows carry the values each
-- planned node treats specially — JSON null and "", numbers as text ("1,234", "$5", "1e3",
-- " 7 "), text with no digit ("$", "abc"), booleans, zero divisors, negative and huge numbers,
-- date-only and timestamped dates, a date that does not exist, a bad unit — and a formula for
-- every planned node (and for the short-circuits: an IF / AND / OR whose untaken side fails),
-- plus the Rule nodes (custom.rule_eval's sub / concat / eq …) most older formulas are written in.
-- For every formula and every record:
--   · the planned JSON (custom.formula_compile_sql) as text equals custom.derived_value's, and
--   · the door's text (custom.agg_field_value_sql) equals custom.agg_value_text of it;
-- and every formula on the PLANNED list is planned (no custom.derived_value in its SQL), so a
-- planner that silently gives up on IF, & or DATEADD — the 42-second filter — is RED.
-- It also asks the measure door for the earliest and latest of a DATE formula and of a TEXT
-- formula, which died on `invalid input syntax for type numeric` before W5.
--
-- Clone only (it writes; everything is rolled back).

\set ON_ERROR_STOP on
\timing off
\set suite 'visionreach_w5_formula_planned_edges.sql'
\set requires 'function:custom._fxc_apply'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '900s';
set local lock_timeout = '120s';

do $t$
declare
  c_org     constant uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';   -- Cedar Ridge Physical Therapy
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_values  constant text :=
    '(case when r.data ? ''_computed'' or r.data ? ''_derived'' '
    'then (r.data - ''_computed'' - ''_retired'' - ''_values'' - ''_sources'' - ''_derived'') '
    '|| custom.computed_block(r.data -> ''_computed'') || custom.computed_block(r.data -> ''_derived'') '
    'else r.data end)';
  -- key, formula, must it be planned (no per-record path)?
  c_fx text[][] := array[
    array['f_mul',      '{Copay} * {Sessions}', 'yes'],
    array['f_div',      '{Copay} / {Sessions}', 'yes'],
    array['f_mod',      '{Copay} % {Sessions}', 'yes'],
    array['f_add',      '{Copay} + {Adjustment}', 'yes'],
    array['f_sub',      '{Note} - {Adjustment}', 'yes'],
    array['f_neg',      '-{Note}', 'yes'],
    array['f_round',    'ROUND({Copay} / 3, 2)', 'yes'],
    array['f_abs',      'ABS({Adjustment})', 'yes'],
    array['f_sum',      'SUM({Copay}, {Note}, {Adjustment})', 'yes'],
    array['f_avg',      'AVERAGE({Copay}, {Sessions})', 'yes'],
    array['f_min',      'MIN({Copay}, {Note})', 'yes'],
    array['f_gte',      '{Copay} >= 35', 'yes'],
    array['f_eq_text',  '{Note} = "abc"', 'yes'],
    array['f_eq_num',   '{Note} = 12', 'yes'],
    array['f_lt_mixed', '{Note} < {Copay}', 'yes'],
    array['f_ne_flag',  '{Flag} != {Note}', 'yes'],
    array['f_eq_blank', '{Note} = BLANK()', 'yes'],
    array['f_if',       'IF({Copay} >= 40, "High copay", "Standard")', 'yes'],
    array['f_if_short', 'IF({Sessions} = 0, "none", {Copay} / {Sessions})', 'yes'],
    array['f_if_two',   'IF({Flag}, {Copay})', 'yes'],
    array['f_and',      'AND({Note} = "abc", {Copay} / {Sessions} > 1)', 'yes'],
    array['f_or',       'OR({Flag}, {Copay} / {Sessions} > 1)', 'yes'],
    array['f_not',      'NOT({Note})', 'yes'],
    array['f_isblank',  'ISBLANK({Note})', 'yes'],
    array['f_amp',      '{Note} & " — " & {Copay}', 'yes'],
    array['f_concat',   'CONCATENATE({Flag}, "-", {Adjustment}, {Start})', 'yes'],
    array['f_upper',    'UPPER({Note})', 'yes'],
    array['f_trim',     'TRIM({Note})', 'yes'],
    array['f_len',      'LEN({Note})', 'yes'],
    array['f_left',     'LEFT({Note}, {Sessions})', 'yes'],
    array['f_right',    'RIGHT({Note}, 2)', 'yes'],
    array['f_contains', 'CONTAINS({Note}, "B")', 'yes'],
    array['f_dd_days',  'DATEDIFF({Start}, {End}, "days")', 'yes'],
    array['f_dd_hours', 'DATEDIFF({Start}, {End}, "hours")', 'yes'],
    array['f_dd_unit',  'DATEDIFF({Start}, {End}, {Note})', 'yes'],
    array['f_add_days', 'DATEADD({Start}, {Sessions}, "days")', 'yes'],
    array['f_add_mon',  'DATEADD({Start}, 1, "months")', 'yes'],
    array['f_year',     'YEAR({End})', 'yes'],
    array['f_month',    'MONTH({Start})', 'yes'],
    array['f_day',      'DAY({Start})', 'yes'],
    array['f_today',    'DATEDIFF({Start}, TODAY(), "days") > 0', 'yes'],
    array['f_note_mon', 'MONTH({Note})', 'yes'],
    array['f_note_add', 'DATEADD({Note}, 1, "days")', 'yes'],
    array['f_note_dd',  'DATEDIFF({Note}, {Start}, "minutes")', 'yes'],
    array['f_switch',   'SWITCH({Note}, "abc", "letters", "12", "twelve", "other")', 'no'],
    array['f_find',     'FIND("b", {Note})', 'no']];
  -- RULE NODES (custom.rule_eval's language — what most formulas written before the formula
  -- language are): key, expression with @column@ standing for {"field": "<that column's id>"}.
  -- Every one must be planned too, with rule_eval's meaning: no conversion, = on the JSON value,
  -- a number refused when it is text, words joined skipping empties.
  c_rx text[][] := array[
    array['r_sub',        '{"op":"sub","args":[@copay@,@adjustment@]}'],
    array['r_add_text',   '{"op":"add","args":[@note@,@copay@]}'],
    array['r_mul',        '{"op":"mul","args":[@copay@,@sessions@]}'],
    array['r_div',        '{"op":"div","args":[@copay@,@sessions@]}'],
    array['r_div_const',  '{"op":"div","args":[@copay@,{"const":3}]}'],
    array['r_eq_text',    '{"op":"eq","args":[@note@,{"const":"abc"}]}'],
    array['r_eq_num',     '{"op":"eq","args":[@copay@,{"const":35}]}'],
    array['r_ne_flag',    '{"op":"ne","args":[@flag@,{"const":true}]}'],
    array['r_gt',         '{"op":"gt","args":[@copay@,{"const":35}]}'],
    array['r_lte_text',   '{"op":"lte","args":[@note@,@copay@]}'],
    array['r_one_arg',    '{"op":"sub","args":[@copay@]}'],
    array['r_concat',     '{"op":"concat","args":[@note@,{"const":" — "},@copay@,@flag@,@start@]}'],
    array['r_concat_sep', '{"op":"concat","separator":" · ","args":[@note@,@copay@,{"const":"  "},@adjustment@,@flag@]}'],
    array['r_concat_none','{"op":"concat","args":[{"const":"  "}]}'],
    array['r_fx_inside',  '{"op":"sub","args":[{"op":"fx.round","args":[@copay@,{"const":1}]},@sessions@]}'],
    array['r_in_fx_if',   '{"op":"fx.if","args":[{"op":"gt","args":[@copay@,{"const":35}]},{"op":"concat","args":[@note@]},{"const":"low"}]}'],
    array['r_in_fx_add',  '{"op":"fx.add","args":[{"op":"mul","args":[@copay@,@sessions@]},@adjustment@]}'],
    array['r_and',        '{"op":"and","args":[{"op":"gt","args":[@copay@,{"const":30}]},@flag@]}']];
  v_ids jsonb := '{}';
  v_home uuid; v_t uuid; i int; f record; v_sql text; v_door text; v_n bigint; v_bad text;
  v_fail text[] := '{}'; v_planned int := 0; v_rows bigint := 0; v_m jsonb;
begin
  perform set_config('app.actor_system', 'visionreach-w5-edges', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  v_home := custom.record_write(c_org, custom.person_kernel_id(), jsonb_build_object('name', 'Billing formula audit'));
  v_t := custom.table_declare(c_org, jsonb_build_object('name', 'Billing formula audit', 'slug', 'vr5_fx_' || substr(gen_random_uuid()::text, 1, 8),
     'type', 'entity', 'label_singular', 'Charge', 'label_plural', 'Charges', 'title_field', 'name', 'display', 'list',
     'weight', 'light', 'ordered', false, 'row_order', 'manual', 'default_sort', '[]'::jsonb, 'agent_writable', true,
     'retention_days', 365, 'fields', jsonb_build_array(jsonb_build_object('name', 'name')), 'parent_id', v_home::text));
  perform custom.field_declare(c_org, v_t, '{"key":"copay","label":"Copay","type":"number"}');
  perform custom.field_declare(c_org, v_t, '{"key":"sessions","label":"Sessions","type":"number"}');
  perform custom.field_declare(c_org, v_t, '{"key":"adjustment","label":"Adjustment","type":"number"}');
  perform custom.field_declare(c_org, v_t, '{"key":"note","label":"Note","type":"text"}');
  perform custom.field_declare(c_org, v_t, '{"key":"start","label":"Start","type":"datetime","config":{"kind":"date"}}');
  perform custom.field_declare(c_org, v_t, '{"key":"end","label":"End","type":"datetime","config":{"kind":"date"}}');
  perform custom.field_declare(c_org, v_t, '{"key":"flag","label":"Flag","type":"boolean"}');
  for i in 1 .. array_length(c_fx, 1) loop
    begin
      perform custom.field_declare(c_org, v_t, jsonb_build_object('key', c_fx[i][1], 'label', c_fx[i][1],
        'type', 'formula', 'formula_text', c_fx[i][2]));
    exception when others then
      -- a function this database's formula language does not have yet (lane 10's FIND/SWITCH on
      -- an older body) is refused at declaration; that formula is simply not part of this run
      raise notice 'not declared here: % (%): %', c_fx[i][1], c_fx[i][2], left(sqlerrm, 120);
    end;
  end loop;
  perform set_config('role', 'postgres', true);
  select jsonb_object_agg(fr.data ->> 'key', jsonb_build_object('field', fr.id::text)) into v_ids
    from custom.record fr
   where fr.table_id = custom.field_kernel_id() and fr.deleted_at is null
     and (fr.data ->> 'entity_definition_id')::uuid = v_t;
  perform set_config('role', 'authenticated', true);
  for i in 1 .. array_length(c_rx, 1) loop
    v_sql := c_rx[i][2];
    for f in select key, value from jsonb_each(v_ids) loop
      v_sql := replace(v_sql, '@' || f.key || '@', f.value::text);
    end loop;
    perform custom.field_declare(c_org, v_t, jsonb_build_object('key', c_rx[i][1], 'label', c_rx[i][1],
      'type', 'formula', 'config', jsonb_build_object('expr', v_sql::jsonb)));
  end loop;
  perform custom.record_write_many(c_org, v_t, array[
    '{"name":"Initial evaluation — Okafor","copay":35,"sessions":12,"adjustment":-5.25,"note":"12","start":"2026-09-01","end":"2026-09-29","flag":true}',
    '{"name":"Re-evaluation — Albright","copay":35,"sessions":0,"adjustment":0,"note":"abc","flag":false}',
    '{"name":"Walk-in — Raman","note":""}',
    '{"name":"Manual therapy — Whitcombe","copay":33.335,"sessions":7,"adjustment":0.1,"note":"1e3","start":"2026-09-01T09:30:00Z","end":"2026-09-02T17:15:00Z"}',
    '{"name":"Refund — Kahale","copay":-17,"sessions":-4,"adjustment":-0.0001,"note":" 7 ","start":"2026-03-01","end":"2026-02-28"}',
    '{"name":"Group package — Fennimore","copay":123456789012.345678,"sessions":3,"adjustment":1e-10,"note":"1,234","start":"2026-01-31","end":"2027-01-31"}',
    '{"name":"Copay only — Lindqvist","copay":100,"note":"$"}',
    '{"name":"Recheck — Asante","copay":40,"sessions":2,"note":"2026-02-30","flag":false}',
    '{"name":"Telehealth — Delacroix","copay":20,"sessions":5,"note":"2026-09-01T09:30:00+02:00"}',
    '{"name":"No-show fee — Brennan","copay":0,"sessions":1,"note":"not a date","flag":true}',
    '{"name":"Half session — Ocampo","copay":2.5,"sessions":1,"note":"hours","start":"2026-09-01","end":"2026-09-01T06:00:00Z","flag":true}',
    '{"name":"Cash visit — Marchetti","copay":45,"sessions":3,"note":"$5","adjustment":-1000.5,"start":"2026-12-31","end":"2026-06-30"}'
  ]::jsonb[], null);

  perform set_config('role', 'postgres', true);
  for f in select fr.id, fr.data, fr.data ->> 'key' k, fr.data -> 'config' ->> 'formula_text' txt
             from custom.record fr
            where fr.table_id = custom.field_kernel_id() and fr.deleted_at is null and fr.data ->> 'type' = 'formula'
              and (fr.data ->> 'entity_definition_id')::uuid = v_t
            order by 3 loop
    v_door := custom.agg_field_value_sql(c_org, v_t, f.k);
    v_sql := custom.formula_compile_sql(c_org, f.data -> 'config' -> 'expr', c_values);
    if v_sql is null or v_door like '%custom.derived_value(%' then
      if exists (select 1 from generate_subscripts(c_fx, 1) i where c_fx[i][1] = f.k and c_fx[i][3] = 'yes')
         or exists (select 1 from generate_subscripts(c_rx, 1) i where c_rx[i][1] = f.k) then
        v_fail := v_fail || format('%s [%s] is on the planned list and was NOT planned', f.k, f.txt);
      end if;
      continue;
    end if;
    v_planned := v_planned + 1;
    execute format($q$
      select count(*),
             string_agg(format('[%%s] planned %%s / door %%s, formula_eval %%s', r.data ->> 'name',
                               coalesce(x.planned::text, 'SQL NULL'), coalesce(x.door, 'SQL NULL'),
                               coalesce(x.evaluated::text, 'SQL NULL')), '; ')
               filter (where x.planned::text is distinct from x.evaluated::text
                          or x.door is distinct from custom.agg_value_text(x.evaluated))
        from custom.record r
        cross join lateral (
          select %s as planned, %s as door,
                 custom.derived_value(%L::uuid, r.id, %L::jsonb,
                   (r.data - '_computed' - '_retired' - '_values' - '_sources' - '_derived')
                   || custom.computed_block(r.data -> '_computed') || custom.computed_block(r.data -> '_derived')) as evaluated
        ) x
       where r.organization_id = %L::uuid and r.table_id = %L::uuid and r.deleted_at is null
    $q$, v_sql, v_door, c_org, f.data, c_org, v_t)
    into v_n, v_bad;
    v_rows := v_rows + v_n;
    if v_bad is not null then
      v_fail := v_fail || format('%s [%s]: %s', f.k, f.txt, left(v_bad, 900));
    end if;
  end loop;

  -- THE MEASURE DOOR, TYPED: earliest and latest of a date formula and of a text formula.
  perform set_config('role', 'authenticated', true);
  select x.measures into v_m
    from custom.record_aggregate(c_org, v_t, '[]', '[{"op":"min","key":"f_add_days"},{"op":"max","key":"f_add_days"},{"op":"min","key":"f_upper"},{"op":"max","key":"f_upper"}]') x;
  if v_m is distinct from '{"min_f_add_days": "2026-02-03", "max_f_add_days": "2027-01-03", "min_f_upper": " 7 ", "max_f_upper": "NOT A DATE"}'::jsonb then
    v_fail := v_fail || format('earliest/latest of a date and a text formula: got %s', v_m);
  end if;
  begin
    perform 1 from custom.record_aggregate(c_org, v_t, '[]', '[{"op":"sum","key":"f_add_days"}]');
    v_fail := v_fail || 'adding up a date formula was not refused'::text;
  exception when sqlstate '22023' then
    if sqlerrm not like 'f_add_days holds dates%' then
      v_fail := v_fail || format('adding up a date formula was refused in other words: %s', sqlerrm);
    end if;
  end;

  raise notice 'formulas planned and compared: %; records compared: %', v_planned, v_rows;
  if v_planned < 60 or v_rows = 0 then
    raise exception 'RED — only % formulas planned over % records; the suite proves too little', v_planned, v_rows;
  end if;
  if cardinality(v_fail) > 0 then
    raise exception E'RED — % difference(s):\n  %', cardinality(v_fail), array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'GREEN — every planned formula answers exactly what custom.formula_eval answers on every edge value; the common shapes are planned; a date and a text formula have an earliest and a latest.';
end
$t$;

rollback;
