-- LANE DRILL-CUSTOM-PARITY (DRILL-DOWN-DESIGN D2) — A CUSTOM TABLE SAYS ITS OWN DIMENSIONS AND
-- MEASURES, AND THE AGGREGATE DOOR TAKES THEIR NAMES.
--
-- THE USE CASES.
--   PART 1 (real table, read only): Cedar Ridge Physical Therapy's "Visits" table — every booked
--     appointment, its visit type, its status, the patient, the date and its length in minutes.
--     The clinic owner (admin@admin.com) opens it and must be offered: Visit type and Status
--     (choices), Patient (a relation), Date (a date with year > quarter > month > week > day),
--     Added and Last changed; and the count of visits plus total / average / lowest / highest
--     Length. Free text (Therapist, Visit notes) is never offered as a Dimension.
--   PART 2 (fixture, rolled back): the same clinic's front desk renames "Visit type", hides
--     "Last changed", adds "Minutes booked", adds a "Care" drill path and sets the first screen.
--   PART 3 (fixture, rolled back): Dana Ortiz (test@test.com) works the front desk and sees only
--     the five visits she booked; the Copay column is confidential. Her grouped totals must equal
--     the rows she can open, and Copay is never offered to her or totalled for her.
--
-- WHAT MAKES IT FAIL (RED before drillcustom_a_table_says_its_own_dimensions_and_measures.sql):
-- custom.table_dimensions does not exist, and custom.record_aggregate refuses a Dimension at a
-- grain ("appointment_date:month") and a Measure named by its key ("sum_duration_minutes") —
-- a caller had to know Field keys and the {op, key} grammar — and worse, a Measure named by its
-- key was silently answered as a COUNT ({"count": 17} for "sum_duration_minutes"). Two groups, or
-- a group and a date period, failed outright in every grammar ("aggregate functions are not
-- allowed in GROUP BY"). Measured RED on the clone and on the main database
-- 2026-09-29 (see PROGRESS-DRILL-CUSTOM-PARITY.md).

\set ON_ERROR_STOP on
\timing off
\set suite 'drillcustom_green.sql'
\set requires 'row:custom.record:id = \'b79ba573-fb65-46f9-be54-e37d11ee4206\''
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '60s';
set local statement_timeout = '180s';

create temp table dc (k text primary key, v uuid) on commit drop;
grant select on dc to authenticated;

-- ══ FIXTURE for PARTS 2 and 3 (as the owner; rolled back) ══════════════════════════════════
do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid;
  v_tbl  uuid;
  v_id   uuid;
  v_row  jsonb;
begin
  perform set_config('app.actor_system', 'campaign-test/drillcustom', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy ' || substr(v_org::text, 1, 8),
          'cedar-ridge-pt-drill-' || substr(v_org::text, 1, 8), 'CRP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',            'organization', v_org, v_org, 'true'::jsonb,                  'drillcustom fixture'),
    ('custom', 'member_default_visibility', 'organization', v_org, v_org, '"shared_only"'::jsonb,         'drillcustom fixture: the front desk sees the visits she booked'),
    ('custom', 'time_zone',                 'organization', v_org, v_org, '"America/Los_Angeles"'::jsonb, 'drillcustom fixture: the clinic is in Bend, Oregon (Pacific time)'),
    ('custom', 'week_start',                'organization', v_org, v_org, '"monday"'::jsonb,              'drillcustom fixture');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Visits', 'slug', 'visits', 'type', 'entity',
    'label_singular', 'Visit', 'label_plural', 'Visits',
    'title_field', 'patient_name', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'visit_date', 'direction', 'desc')),
    'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'patient_name'))));
  insert into dc values ('org', v_org), ('tbl', v_tbl);

  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key', 'patient_name', 'label', 'Patient', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key', 'visit_date', 'label', 'Visit date', 'type', 'datetime', 'sort', 20));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key', 'visit_type', 'label', 'Visit type', 'type', 'select', 'sort', 30,
    'options', jsonb_build_array('Evaluation', 'Follow-up', 'Discharge')));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'select', 'sort', 40,
    'options', jsonb_build_array('Scheduled', 'Completed', 'No-show')));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key', 'duration_minutes', 'label', 'Length', 'type', 'number', 'unit', 'min', 'sort', 50));
  insert into dc values ('f_copay', custom.field_declare(v_org, v_tbl, jsonb_build_object('key', 'copay', 'label', 'Copay', 'type', 'currency', 'unit', '$', 'sort', 60, 'sensitivity', 'confidential')));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('key', 'insurance_verified', 'label', 'Insurance verified', 'type', 'checkbox', 'sort', 70));
  insert into dc values ('f_therapist', custom.field_declare(v_org, v_tbl, jsonb_build_object('key', 'therapist', 'label', 'Therapist', 'type', 'text', 'sort', 80)));

  -- Twelve September visits. Dana booked the five marked (d): 2 Completed, 2 Scheduled, 1 No-show.
  for v_row in select e from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('patient_name','Harold Brennan',  'visit_date','2026-09-01','visit_type','Evaluation','status','Completed','duration_minutes',60,'copay',40,'insurance_verified',true, 'therapist','Mara Quinlan','d',true),
    jsonb_build_object('patient_name','Lucia Ferreira',  'visit_date','2026-09-02','visit_type','Follow-up', 'status','Completed','duration_minutes',45,'copay',25,'insurance_verified',true, 'therapist','Mara Quinlan'),
    jsonb_build_object('patient_name','Owen Whitlock',   'visit_date','2026-09-03','visit_type','Follow-up', 'status','No-show',  'duration_minutes',45,'copay',0, 'insurance_verified',false,'therapist','Theo Aldana','d',true),
    jsonb_build_object('patient_name','Priya Raman',     'visit_date','2026-09-08','visit_type','Evaluation','status','Completed','duration_minutes',60,'copay',40,'insurance_verified',true, 'therapist','Theo Aldana'),
    jsonb_build_object('patient_name','Gene Castellanos','visit_date','2026-09-09','visit_type','Follow-up', 'status','Completed','duration_minutes',30,'copay',25,'insurance_verified',true, 'therapist','Mara Quinlan','d',true),
    jsonb_build_object('patient_name','Harold Brennan',  'visit_date','2026-09-10','visit_type','Follow-up', 'status','Completed','duration_minutes',45,'copay',25,'insurance_verified',true, 'therapist','Mara Quinlan'),
    jsonb_build_object('patient_name','Nadia Okafor',    'visit_date','2026-09-15','visit_type','Evaluation','status','Completed','duration_minutes',60,'copay',40,'insurance_verified',false,'therapist','Theo Aldana'),
    jsonb_build_object('patient_name','Lucia Ferreira',  'visit_date','2026-09-16','visit_type','Discharge', 'status','Completed','duration_minutes',30,'copay',25,'insurance_verified',true, 'therapist','Mara Quinlan'),
    jsonb_build_object('patient_name','Owen Whitlock',   'visit_date','2026-09-22','visit_type','Follow-up', 'status','Scheduled','duration_minutes',45,'copay',25,'insurance_verified',true, 'therapist','Theo Aldana','d',true),
    jsonb_build_object('patient_name','Priya Raman',     'visit_date','2026-09-23','visit_type','Follow-up', 'status','Scheduled','duration_minutes',45,'copay',25,'insurance_verified',true, 'therapist','Theo Aldana'),
    jsonb_build_object('patient_name','Gene Castellanos','visit_date','2026-09-29','visit_type','Discharge', 'status','Scheduled','duration_minutes',30,'copay',25,'insurance_verified',true, 'therapist','Mara Quinlan','d',true),
    jsonb_build_object('patient_name','Nadia Okafor',    'visit_date','2026-09-30','visit_type','Follow-up', 'status','Scheduled','duration_minutes',45,'copay',25,'insurance_verified',false,'therapist','Theo Aldana')
  )) e loop
    v_id := custom.record_write(v_org, v_tbl, v_row - 'd');
    if coalesce((v_row ->> 'd')::boolean, false) then
      perform custom.share_grant(v_org, v_id, 'person', c_dana, 'viewer'::public.permission_level);
    end if;
  end loop;
end
$fixture$;

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_cr_org  constant uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';   -- Cedar Ridge Physical Therapy
  c_visits  constant uuid := 'b79ba573-fb65-46f9-be54-e37d11ee4206';   -- its "Visits" table
  v_org uuid; v_tbl uuid;
  v_def jsonb; v_d jsonb; v_keys text[]; v_mkeys text[];
  v_n numeric; v_n2 numeric; v_rows bigint; v_rows2 bigint; v_msg text;
begin
  select v into v_org from dc where k = 'org';
  select v into v_tbl from dc where k = 'tbl';
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;

  -- ══ PART 1. INFERENCE on Cedar Ridge's real "Visits" table (read only) ═══════════════════
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_def := custom.table_dimensions(c_cr_org, c_visits);
  select array_agg(x ->> 'key' order by x ->> 'key') into v_keys from jsonb_array_elements(v_def -> 'dimensions') x;
  if v_keys is distinct from array['appointment_date', 'created_at', 'patient', 'status', 'updated_at', 'visit_type'] then
    raise exception 'INF-1: Visits offered the dimensions % (want appointment_date, created_at, patient, status, updated_at, visit_type — never free text)', v_keys;
  end if;
  select x into v_d from jsonb_array_elements(v_def -> 'dimensions') x where x ->> 'key' = 'visit_type';
  if v_d ->> 'kind' <> 'choice' or v_d ->> 'label' <> 'Visit type' or jsonb_array_length(v_d -> 'choices') < 2
     or exists (select 1 from jsonb_array_elements(v_d -> 'choices') c where coalesce(c ->> 'label', '') = '') then
    raise exception 'INF-2: Visit type is not a labelled choice dimension: %', v_d;
  end if;
  select x into v_d from jsonb_array_elements(v_def -> 'dimensions') x where x ->> 'key' = 'patient';
  if v_d ->> 'kind' <> 'relation' or v_d -> 'relation' ->> 'table_id' <> '6d3b427c-f272-4118-8f14-3f431c78c75c' then
    raise exception 'INF-3: Patient is not a relation to the Patients table: %', v_d;
  end if;
  select x into v_d from jsonb_array_elements(v_def -> 'dimensions') x where x ->> 'key' = 'appointment_date';
  if v_d ->> 'kind' <> 'time' or v_d -> 'grains' <> '["year","quarter","month","week","day"]'::jsonb then
    raise exception 'INF-4: Date is not a time dimension year..day: %', v_d;
  end if;
  if not exists (select 1 from jsonb_array_elements(v_def -> 'paths') p
                  where p ->> 'key' = 'appointment_date'
                    and p -> 'levels' = '["appointment_date:year","appointment_date:quarter","appointment_date:month","appointment_date:week","appointment_date:day"]'::jsonb) then
    raise exception 'INF-5: no drill path year > quarter > month > week > day on Date: %', v_def -> 'paths';
  end if;
  select array_agg(x ->> 'key' order by x ->> 'key') into v_mkeys from jsonb_array_elements(v_def -> 'measures') x;
  if v_mkeys is distinct from array['avg_duration_minutes', 'count', 'filled_duration_minutes', 'max_duration_minutes', 'min_duration_minutes', 'sum_duration_minutes'] then
    raise exception 'INF-6: Visits offered the measures % (want count and sum/avg/min/max/filled of Length)', v_mkeys;
  end if;
  if (select x ->> 'unit' from jsonb_array_elements(v_def -> 'measures') x where x ->> 'key' = 'sum_duration_minutes') is distinct from 'min'
     or (select x ->> 'label' from jsonb_array_elements(v_def -> 'measures') x where x ->> 'key' = 'sum_duration_minutes') is distinct from 'Total Length' then
    raise exception 'INF-7: Total Length lost its label or its unit: %', v_def -> 'measures';
  end if;
  if v_def -> 'default' -> 'by' <> '["visit_type"]'::jsonb or v_def -> 'inferred' is null or v_def ->> 'overridden' <> 'false' then
    raise exception 'INF-8: the first screen / inferred list is wrong: default %, inferred %, overridden %', v_def -> 'default', v_def -> 'inferred', v_def -> 'overridden';
  end if;
  raise notice 'INF PASS — Visits: dimensions %, measures %; first screen by %', v_keys, v_mkeys, v_def -> 'default' -> 'by';

  -- The names answer, and answer what the Field-key grammar answers.
  select sum(row_count), sum((measures ->> 'sum_duration_minutes')::numeric) into v_rows, v_n
    from custom.record_aggregate(c_cr_org, c_visits, '["visit_type"]'::jsonb, '["count", "sum_duration_minutes"]'::jsonb);
  select row_count, (measures ->> 'sum_duration_minutes')::numeric into v_rows2, v_n2
    from custom.record_aggregate(c_cr_org, c_visits, '[]'::jsonb, '[{"op": "count"}, {"op": "sum", "key": "duration_minutes"}]'::jsonb);
  if v_rows is distinct from v_rows2 or v_n is distinct from v_n2 or v_rows = 0 then
    raise exception 'INF-9: by name % visits / % min; by Field key % visits / % min', v_rows, v_n, v_rows2, v_n2;
  end if;
  select sum(row_count), count(*) filter (where groups ? 'appointment_date_month') into v_rows, v_n
    from custom.record_aggregate(c_cr_org, c_visits, '["appointment_date:month"]'::jsonb, '["count"]'::jsonb);
  if v_rows is distinct from v_rows2 or v_n = 0 then
    raise exception 'INF-10: "appointment_date:month" answered % visits in % month groups (want % visits)', v_rows, v_n, v_rows2;
  end if;
  -- Two groups, and a group with a date period, answer (they died on "aggregate functions are
  -- not allowed in GROUP BY" before this file — in the Field-key grammar too).
  select sum(row_count) into v_rows
    from custom.record_aggregate(c_cr_org, c_visits, '["status", "visit_type"]'::jsonb, '[{"op": "count"}]'::jsonb);
  if v_rows is distinct from v_rows2 then
    raise exception 'INF-12: status x visit type answered % visits (want %)', v_rows, v_rows2;
  end if;
  select sum(row_count) into v_rows
    from custom.record_aggregate(c_cr_org, c_visits, '["status"]'::jsonb, '[{"op": "count"}]'::jsonb,
                                 '{"key": "appointment_date", "by": "month"}'::jsonb);
  if v_rows is distinct from v_rows2 then
    raise exception 'INF-13: status by month (Field-key grammar) answered % visits (want %)', v_rows, v_rows2;
  end if;
  begin
    perform 1 from custom.record_aggregate(c_cr_org, c_visits, '["appointment_date:fortnight"]'::jsonb, '["count"]'::jsonb);
    raise exception 'INF-11: a grain that does not exist was answered';
  exception when sqlstate '22023' then
    get stacked diagnostics v_msg = message_text;
  end;
  raise notice 'INF-ASK PASS — by name = by Field key: % visits, % min; by month answered; "%"', v_rows2, v_n2, v_msg;

  -- ══ PART 2. AN OVERRIDE ═════════════════════════════════════════════════════════════════
  v_def := custom.table_dimensions_set(v_org, v_tbl, jsonb_build_object(
    'dimensions', jsonb_build_array(jsonb_build_object('key', 'visit_type', 'label', 'Kind of visit'),
                                    jsonb_build_object('key', 'updated_at', 'hidden', true)),
    'measures', jsonb_build_array(jsonb_build_object('key', 'minutes_booked', 'label', 'Minutes booked', 'op', 'sum', 'of', 'duration_minutes', 'unit', 'min'),
                                  jsonb_build_object('key', 'min_duration_minutes', 'hidden', true)),
    'paths', jsonb_build_array(jsonb_build_object('key', 'care', 'label', 'Care', 'levels', jsonb_build_array('visit_type', 'status', 'visit_date:week'))),
    'default', jsonb_build_object('by', jsonb_build_array('status'), 'show', jsonb_build_array('count', 'minutes_booked'),
                                  'sort', jsonb_build_object('key', 'minutes_booked', 'direction', 'desc'))));
  if (select x ->> 'label' from jsonb_array_elements(v_def -> 'dimensions') x where x ->> 'key' = 'visit_type') is distinct from 'Kind of visit'
     or exists (select 1 from jsonb_array_elements(v_def -> 'dimensions') x where x ->> 'key' = 'updated_at')
     or exists (select 1 from jsonb_array_elements(v_def -> 'measures') x where x ->> 'key' = 'min_duration_minutes')
     or not exists (select 1 from jsonb_array_elements(v_def -> 'measures') x where x ->> 'key' = 'minutes_booked' and x ->> 'op' = 'sum')
     or not exists (select 1 from jsonb_array_elements(v_def -> 'paths') x where x ->> 'key' = 'care' and jsonb_array_length(x -> 'levels') = 3)
     or v_def -> 'default' -> 'by' <> '["status"]'::jsonb or v_def ->> 'overridden' <> 'true'
     or (v_def -> 'inferred') ? 'visit_type' then
    raise exception 'OVR-1: the override did not take: %', v_def;
  end if;
  -- The override is the TABLE's: a fresh read says the same, and the dimension set is otherwise inferred.
  if custom.table_dimensions(v_org, v_tbl) <> v_def then
    raise exception 'OVR-2: a fresh read disagrees with what the setter returned';
  end if;
  select sum((measures ->> 'minutes_booked')::numeric), sum(row_count) into v_n, v_rows
    from custom.record_aggregate(v_org, v_tbl, '["status"]'::jsonb, '["count", "minutes_booked"]'::jsonb);
  if v_n is distinct from 540 or v_rows is distinct from 12 then
    raise exception 'OVR-3: Minutes booked answered % over % visits (want 540 over 12)', v_n, v_rows;
  end if;
  -- A hidden measure is off the menu but still answers when asked by name.
  select (measures ->> 'min_duration_minutes')::numeric into v_n
    from custom.record_aggregate(v_org, v_tbl, '[]'::jsonb, '["min_duration_minutes"]'::jsonb);
  if v_n is distinct from 30 then raise exception 'OVR-4: hidden Lowest Length answered % (want 30)', v_n; end if;
  -- Refusals by name, nothing written.
  foreach v_msg in array array[
      '{"measures": [{"key": "therapist_total", "op": "sum", "of": "therapist"}]}',
      '{"dimensions": [{"key": "therapist", "label": "Therapist"}]}',
      '{"measures": [{"key": "sum_duration_minutes", "op": "avg", "of": "duration_minutes"}]}',
      '{"paths": [{"key": "x", "levels": ["visit_date:fortnight"]}]}',
      '{"colors": {}}'] loop
    begin
      perform custom.table_dimensions_set(v_org, v_tbl, v_msg::jsonb);
      raise exception 'OVR-5: % was saved', v_msg;
    exception when sqlstate '22023' then null;
    end;
  end loop;
  -- A removed column: its override stops applying and the read SAYS so, once, in words.
  v_def := custom.table_dimensions_set(v_org, v_tbl, jsonb_build_object(
    'measures', jsonb_build_array(jsonb_build_object('key', 'minutes_booked', 'label', 'Minutes booked', 'op', 'sum', 'of', 'duration_minutes'),
                                  jsonb_build_object('key', 'therapist_named', 'label', 'Therapist named', 'op', 'filled', 'of', 'therapist'))));
  if not exists (select 1 from jsonb_array_elements(v_def -> 'measures') x where x ->> 'key' = 'therapist_named')
     or jsonb_array_length(v_def -> 'notes') <> 0 then
    raise exception 'OVR-6: a measure over a text column (filled) did not take, or a clean override carries notes: %', v_def;
  end if;
  perform custom.field_retire(v_org, (select v from dc where k = 'f_therapist'));
  v_def := custom.table_dimensions(v_org, v_tbl);
  if exists (select 1 from jsonb_array_elements(v_def -> 'measures') x where x ->> 'key' = 'therapist_named')
     or not exists (select 1 from jsonb_array_elements(v_def -> 'notes') n where n #>> '{}' like '%Therapist named%removed%') then
    raise exception 'OVR-7: a measure over a removed column still shows or is not named: measures %, notes %', v_def -> 'measures', v_def -> 'notes';
  end if;
  raise notice 'OVR-7 PASS — the removed column is said: "%"', v_def -> 'notes' ->> 0;
  raise notice 'OVR PASS — renamed, hidden, added (Minutes booked = 540), a Care path, a first screen; five bad documents refused';

  -- ══ PART 3. THE MEMBER'S SEAT — her totals are the rows she can open ═══════════════════════
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_def := custom.table_dimensions(v_org, v_tbl);
  if exists (select 1 from jsonb_array_elements(v_def -> 'measures') x where x ->> 'of' = 'copay')
     or (v_def -> 'detail' -> 'columns') ? 'copay' then
    raise exception 'LEAK-1: Dana is offered the confidential Copay column: %', v_def -> 'measures';
  end if;
  select sum(row_count), sum((measures ->> 'sum_duration_minutes')::numeric), sum((measures ->> 'minutes_booked')::numeric)
    into v_rows, v_n, v_n2
    from custom.record_aggregate(v_org, v_tbl, '["status", "visit_date:week"]'::jsonb, '["count", "sum_duration_minutes", "minutes_booked"]'::jsonb);
  select count(*), sum(nullif(coalesce(r.document -> 'data' ->> 'duration_minutes', r.document ->> 'duration_minutes'), '')::numeric)
    into v_rows2, v_msg
    from custom.read_records_matching(v_org, v_tbl, '{}'::jsonb, false, 200, 0) r;
  if v_rows is distinct from v_rows2 or v_rows2 <> 5 or v_n::text is distinct from v_msg or v_n2 is distinct from v_n then
    raise exception 'LEAK-2: Dana''s grouped totals are % visits / % min / % booked; the rows she can open are % / % min', v_rows, v_n, v_n2, v_rows2, v_msg;
  end if;
  if v_n <> 210 then
    raise exception 'LEAK-3: Dana''s five visits total % min (want 60 + 45 + 30 + 45 + 30 = 210)', v_n;
  end if;
  begin
    perform 1 from custom.record_aggregate(v_org, v_tbl, '[]'::jsonb, '["sum_copay"]'::jsonb);
    raise exception 'LEAK-4: Dana was answered a total of Copay by name';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform 1 from custom.record_aggregate(v_org, v_tbl, '[]'::jsonb, '[{"op": "sum", "key": "copay"}]'::jsonb);
    raise exception 'LEAK-5: Dana was answered a total of Copay by Field key';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform custom.table_dimensions_set(v_org, v_tbl, '{"dimensions": [{"key": "status", "label": "Mine now"}]}'::jsonb);
    raise exception 'LEAK-6: Dana (not an editor of the table) changed its dimensions';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'LEAK PASS — Dana: 5 visits, 210 min grouped = 5 rows, 210 min opened; Copay never offered or totalled; she cannot change the table''s dimensions';

  -- The owner's number is bigger, so PART 3 is not equal by accident.
  perform set_config('request.jwt.claims', c_admin_j, true);
  select sum(row_count) into v_rows from custom.record_aggregate(v_org, v_tbl, '["status"]'::jsonb, '["count"]'::jsonb);
  if v_rows <> 12 then raise exception 'LEAK-7: the owner counts % visits (want 12)', v_rows; end if;

  raise notice 'DRILLCUSTOM GREEN — every part passed.';
end $t$;
rollback;
