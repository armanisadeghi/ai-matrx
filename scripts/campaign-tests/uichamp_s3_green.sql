-- LANE S3 (UI-CHAMPIONS-PLAN rev 2, rows 17, 18, 20) — PERIOD COMPARISON, DATE GRAIN, TARGETS.
--
-- THE USE CASE. Rincon Plumbing Co is a six-truck residential plumbing shop in Camarillo,
-- California. Its owner (admin@admin.com) opens the Jobs dashboard on Wednesday 23 September 2026 and asks the question every
-- trade business owner asks: what have we invoiced this month, how is that against August, and
-- how far are we from the $25,000 monthly target — and the same week by week, Sunday to Saturday,
-- because that is how the shop runs its schedule. Marisol Vega (test@test.com) dispatches; the
-- shop shares with her only the jobs she booked, so her numbers are hers. Every customer, address
-- and job number below is synthesized.
--
-- THE HAND-COMPUTED ANSWERS (status = Invoiced only; a Completed-not-invoiced job and a Scheduled
-- job in each month must NOT count):
--   September (Sep 1 – Oct 1, Camarillo time): 675 + 1980 + 4250 + 385 + 2720 + 890 + 5600 + 430 = 16,930
--   August    (Aug 1 – Sep 1):                385 + 1240 + 2950 + 460 + 6800 + 320 + 1875 + 540 + 3400 + 410 = 18,380
--   change -1,450, -7.9 %.  Month to date (Sep 1–23 vs Aug 1–23): 16,930 vs 14,030 → +2,900, +20.7 %.
--   Two boundary jobs prove the calendar: RP-4133 "2026-09-01" (a DATE) is September in
--   California, and RP-4131 at 23:30 on Aug 31 Pacific (06:30 Sep 1 UTC) is AUGUST.
--   By week (Sunday start), bucket position: 0 = 2,655 vs 385 · 1 = 4,635 vs 4,190 ·
--   2 = 3,610 vs 7,260 · 3 = 6,030 vs 2,195 · 4 = nothing vs 3,940 · 5 = nothing vs 410.
--   September holds 5 Sunday weeks, so the target's weekly pace is 25,000 / 5 = 5,000.
--   Marisol (shared RP-4140, RP-4150, RP-4155, RP-4115, RP-4129): 5,570 vs 10,200.
--
-- WHAT MAKES IT FAIL: a prior window that is not August; a date read in UTC; a week that starts on
-- Monday; buckets matched by row order instead of position; a member's prior series that counts a
-- job not shared with her; a target that saves on a measure the block does not have; a stranger
-- answered at all. RED before the file (`record_aggregate` has no p_compare), GREEN after.

\set ON_ERROR_STOP on
\timing off
\set suite 'uichamp_s3_green.sql'
\set requires 'function:custom.record_aggregate'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

-- The grant is judged BEFORE the fixture, because re-opening declared doors inside this
-- transaction would hide a door a real signed-in connection is refused.
do $g$ begin
  if to_regprocedure('custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb)') is null then
    raise exception 'S3-door: custom.record_aggregate takes no comparison — apply uichamp_s3_a_number_knows_last_month_and_its_target.sql';
  end if;
  if not has_function_privilege('authenticated', 'custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'custom.dashboard_run(uuid, uuid, jsonb, jsonb, text)', 'execute') then
    raise exception 'S3-grant: a signed-in person holds no EXECUTE on the widened record_aggregate / dashboard_run — apply uichamp_s3_a_signed_in_person_may_compare_periods.sql';
  end if;
end $g$;

create temp table s3 (k text primary key, v uuid) on commit drop;
grant select on s3 to authenticated;

do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid;
  v_jobs uuid;
  v_id   uuid;
  v_row  jsonb;
begin
  perform set_config('app.actor_system', 'campaign-test/uichamp-s3', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co ' || substr(v_org::text, 1, 8),
          'rincon-plumbing-s3-' || substr(v_org::text, 1, 8), 'RPC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',            'organization', v_org, v_org, 'true'::jsonb,                  's3 fixture'),
    ('custom', 'member_default_visibility', 'organization', v_org, v_org, '"shared_only"'::jsonb,         's3 fixture: dispatch sees the jobs she booked'),
    ('custom', 'time_zone',                 'organization', v_org, v_org, '"America/Los_Angeles"'::jsonb, 's3 fixture: the shop is in Camarillo, California'),
    ('custom', 'week_start',                'organization', v_org, v_org, '"sunday"'::jsonb,              's3 fixture: the schedule runs Sunday to Saturday');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  v_jobs := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Jobs', 'slug', 'jobs', 'type', 'entity',
    'label_singular', 'Job', 'label_plural', 'Jobs',
    'title_field', 'job_number', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'completed_on', 'direction', 'desc')),
    'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'job_number'))));
  insert into s3 values ('org', v_org), ('jobs', v_jobs);

  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key', 'job_number', 'label', 'Job #', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key', 'customer', 'label', 'Customer', 'type', 'text', 'sort', 20));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key', 'job_type', 'label', 'Job type', 'type', 'text', 'sort', 30));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'select', 'sort', 40,
    'options', jsonb_build_array('Scheduled', 'In progress', 'Completed', 'Invoiced')));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key', 'completed_on', 'label', 'Completed', 'type', 'datetime', 'sort', 50));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key', 'invoice_total', 'label', 'Invoice total', 'type', 'currency', 'unit', '$', 'sort', 60));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key', 'technician', 'label', 'Technician', 'type', 'text', 'sort', 70));

  for v_row in select e from jsonb_array_elements(jsonb_build_array(
    -- August 2026
    jsonb_build_object('job_number','RP-4101','customer','Delgado residence, 214 Calle Alta','job_type','Water heater flush','status','Invoiced','completed_on','2026-08-01','invoice_total',385,'technician','Ruben Ortiz'),
    jsonb_build_object('job_number','RP-4104','customer','Harlan & Sons Dental, 88 Daily Dr','job_type','Backflow test + repair','status','Invoiced','completed_on','2026-08-04','invoice_total',1240,'technician','Kayla Brandt'),
    jsonb_build_object('job_number','RP-4108','customer','Nakamura residence, 1502 Ponderosa Dr','job_type','Partial repipe (PEX)','status','Invoiced','completed_on','2026-08-07','invoice_total',2950,'technician','Ruben Ortiz'),
    jsonb_build_object('job_number','RP-4112','customer','Vista Del Mar HOA, unit 12','job_type','Garbage disposal replace','status','Invoiced','completed_on','2026-08-11','invoice_total',460,'technician','Deshawn Pike'),
    jsonb_build_object('job_number','RP-4115','customer','Okafor residence, 3310 Las Posas Rd','job_type','Sewer lateral replacement','status','Invoiced','completed_on','2026-08-14','invoice_total',6800,'technician','Kayla Brandt'),
    jsonb_build_object('job_number','RP-4119','customer','Brennan residence, 77 Mission Oaks Blvd','job_type','Toilet rebuild','status','Invoiced','completed_on','2026-08-18','invoice_total',320,'technician','Deshawn Pike'),
    jsonb_build_object('job_number','RP-4122','customer','Camarillo Grill, 401 Ventura Blvd','job_type','Grease trap service','status','Invoiced','completed_on','2026-08-21','invoice_total',1875,'technician','Ruben Ortiz'),
    jsonb_build_object('job_number','RP-4126','customer','Fairweather residence, 9 Loma Vista','job_type','Hose bib + shutoff','status','Invoiced','completed_on','2026-08-25','invoice_total',540,'technician','Kayla Brandt'),
    jsonb_build_object('job_number','RP-4129','customer','Lindqvist residence, 640 Arneill Rd','job_type','Tankless water heater','status','Invoiced','completed_on','2026-08-28','invoice_total',3400,'technician','Ruben Ortiz'),
    jsonb_build_object('job_number','RP-4130','customer','Ferreira residence, 25 Glenn Dr','job_type','Slab leak detection','status','Completed','completed_on','2026-08-29','invoice_total',950,'technician','Deshawn Pike'),
    jsonb_build_object('job_number','RP-4131','customer','Castellanos residence, 118 Calle Larga','job_type','Emergency burst line','status','Invoiced','completed_on','2026-08-31T23:30:00-07:00','invoice_total',410,'technician','Kayla Brandt'),
    -- September 2026
    jsonb_build_object('job_number','RP-4133','customer','Abernathy residence, 1920 Flynn Rd','job_type','Kitchen drain clear','status','Invoiced','completed_on','2026-09-01','invoice_total',675,'technician','Deshawn Pike'),
    jsonb_build_object('job_number','RP-4136','customer','Pleasant Valley Preschool','job_type','Fixture replacements (4)','status','Invoiced','completed_on','2026-09-03','invoice_total',1980,'technician','Ruben Ortiz'),
    jsonb_build_object('job_number','RP-4140','customer','Hollis residence, 505 Village at the Park','job_type','Tankless water heater','status','Invoiced','completed_on','2026-09-08','invoice_total',4250,'technician','Kayla Brandt'),
    jsonb_build_object('job_number','RP-4143','customer','Okafor residence, 3310 Las Posas Rd','job_type','Water heater flush','status','Invoiced','completed_on','2026-09-10','invoice_total',385,'technician','Deshawn Pike'),
    jsonb_build_object('job_number','RP-4147','customer','Mesa Verde Apartments, bldg C','job_type','Main shutoff valve','status','Invoiced','completed_on','2026-09-15','invoice_total',2720,'technician','Ruben Ortiz'),
    jsonb_build_object('job_number','RP-4150','customer','Salazar residence, 81 Adolfo Rd','job_type','Water softener install','status','Invoiced','completed_on','2026-09-17','invoice_total',890,'technician','Kayla Brandt'),
    jsonb_build_object('job_number','RP-4152','customer','Ventura County Credit Union','job_type','Restroom rough-in','status','Completed','completed_on','2026-09-19','invoice_total',1150,'technician','Deshawn Pike'),
    jsonb_build_object('job_number','RP-4153','customer','Whitlock residence, 2711 Ridgeview Dr','job_type','Slab leak reroute','status','Invoiced','completed_on','2026-09-21','invoice_total',5600,'technician','Ruben Ortiz'),
    jsonb_build_object('job_number','RP-4155','customer','Tran residence, 44 Paseo Camarillo','job_type','Faucet + supply lines','status','Invoiced','completed_on','2026-09-22','invoice_total',430,'technician','Kayla Brandt'),
    jsonb_build_object('job_number','RP-4157','customer','Harlan & Sons Dental, 88 Daily Dr','job_type','Annual backflow test','status','Scheduled','completed_on','2026-09-28','technician','Deshawn Pike')
  )) e loop
    v_id := custom.record_write(v_org, v_jobs, v_row);
    insert into s3 values (v_row ->> 'job_number', v_id);
    if v_row ->> 'job_number' in ('RP-4140', 'RP-4150', 'RP-4155', 'RP-4115', 'RP-4129') then
      perform custom.share_grant(v_org, v_id, 'person', c_dana, 'viewer'::public.permission_level);
    end if;
  end loop;
end
$fixture$;

do $t$
declare
  c_admin_j    constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j     constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_stranger_j constant text := '{"sub":"000eaa28-cf5d-402a-8f01-5e2c24191323","role":"authenticated"}';
  c_invoiced   constant jsonb := '{"status": "Invoiced"}';
  c_revenue    constant jsonb := '[{"op": "sum", "key": "invoice_total"}]';
  c_month      constant jsonb := '{"against": "previous_period", "period": "month", "key": "completed_on", "at": "2026-09-23"}';
  v_org  uuid; v_jobs uuid; v_dash uuid;
  r record;
  v_n integer;
  v_run jsonb;
  v_b jsonb;
  v_state text;
begin
  select v into v_org from s3 where k = 'org';
  select v into v_jobs from s3 where k = 'jobs';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ 1. the number tile: this month against last month ══
  select * into r from custom.record_aggregate(v_org, v_jobs, '[]', c_revenue, null, c_invoiced, 200, 'viewer', c_month);
  if (r.measures ->> 'sum_invoice_total')::numeric is distinct from 16930
     or (r.prior_measures ->> 'sum_invoice_total')::numeric is distinct from 18380 then
    raise exception 'S3-1: September % vs August % (want 16930 vs 18380: the date-only Sep 1 job in September, the 23:30 Aug 31 Pacific job in August, the uninvoiced jobs out)',
      r.measures ->> 'sum_invoice_total', r.prior_measures ->> 'sum_invoice_total';
  end if;
  if (r.delta -> 'sum_invoice_total' ->> 'change')::numeric is distinct from -1450
     or (r.delta -> 'sum_invoice_total' ->> 'change_pct')::numeric is distinct from -7.9 then
    raise exception 'S3-1b: the delta is % (want change -1450, change_pct -7.9)', r.delta;
  end if;
  if r.compare #>> '{window,from}' <> '2026-09-01T00:00:00-07:00' or r.compare #>> '{window,to}' <> '2026-10-01T00:00:00-07:00'
     or r.compare #>> '{prior_window,from}' <> '2026-08-01T00:00:00-07:00' or r.compare #>> '{prior_window,to}' <> '2026-09-01T00:00:00-07:00' then
    raise exception 'S3-1c: the windows are % (want September and August, midnight in Camarillo)', r.compare;
  end if;
  if r.row_count <> 8 or r.prior_row_count <> 10 then
    raise exception 'S3-1d: counted % and % invoiced jobs (want 8 and 10)', r.row_count, r.prior_row_count;
  end if;
  raise notice 'S3-1 PASS — Invoiced this month $16,930 against August $18,380: -$1,450, -7.9 %%; windows %', r.compare -> 'window';

  -- ══ 2. month to date ══
  select * into r from custom.record_aggregate(v_org, v_jobs, '[]', c_revenue, null, c_invoiced, 200, 'viewer',
                                               c_month || '{"to_date": true}');
  if (r.prior_measures ->> 'sum_invoice_total')::numeric is distinct from 14030
     or (r.delta -> 'sum_invoice_total' ->> 'change_pct')::numeric is distinct from 20.7
     or r.compare #>> '{prior_window,to}' <> '2026-08-23T00:00:00-07:00' then
    raise exception 'S3-2: month to date prior % pct % window % (want 14030, 20.7, to Aug 23)',
      r.prior_measures ->> 'sum_invoice_total', r.delta -> 'sum_invoice_total' ->> 'change_pct', r.compare -> 'prior_window';
  end if;
  raise notice 'S3-2 PASS — month to date: $16,930 against $14,030 for Aug 1–22, +20.7 %%';

  -- ══ 3. by week, Sunday to Saturday, matched by position ══
  select jsonb_agg(jsonb_build_object(
           'n', (a.compare ->> 'bucket_count')::integer, 'pos', a.compare -> 'position',
           'wk', a.groups ->> 'completed_on_week', 'pwk', a.prior_groups ->> 'completed_on_week',
           'cur', a.measures -> 'sum_invoice_total', 'pri', a.prior_measures -> 'sum_invoice_total'))
    into v_run
    from custom.record_aggregate(v_org, v_jobs, '[]', c_revenue, '{"key": "completed_on", "by": "week"}', c_invoiced, 200, 'viewer', c_month) a;
  v_n := jsonb_array_length(v_run);
  if v_n <> 6 then raise exception 'S3-3: % week rows (want 6: four with both months, two with August alone)', v_n; end if;
  select string_agg(case when jsonb_typeof(e -> 'cur') = 'number' then e ->> 'cur' else '-' end || '/' ||
                    case when jsonb_typeof(e -> 'pri') = 'number' then e ->> 'pri' else '-' end, ' ' order by o)
    into v_state from jsonb_array_elements(v_run) with ordinality x(e, o);
  if v_state <> '2655/385 4635/4190 3610/7260 6030/2195 -/3940 -/410' then
    raise exception 'S3-3b: weeks were % (want 2655/385 4635/4190 3610/7260 6030/2195 -/3940 -/410)', v_state;
  end if;
  if v_run -> 0 ->> 'wk' <> '2026-08-30T00:00:00-07:00' or v_run -> 0 ->> 'pwk' <> '2026-07-26T00:00:00-07:00'
     or v_run -> 1 ->> 'wk' <> '2026-09-06T00:00:00-07:00' or (v_run -> 0 ->> 'n')::integer <> 5
     or (v_run -> 5 ->> 'pos')::integer <> 5 or v_run -> 5 ->> 'wk' is not null then
    raise exception 'S3-3c: the first weeks are % (want Sunday Aug 30 beside Sunday Jul 26, then Sunday Sep 6; 5 buckets)', v_run -> 0;
  end if;
  raise notice 'S3-3 PASS — six Sunday weeks, each beside the same week of August: %', v_state;

  -- ══ 4. the other two comparisons ══
  select * into r from custom.record_aggregate(v_org, v_jobs, '[]', c_revenue, null, c_invoiced, 200, 'viewer',
    '{"against": "same_period_last_year", "period": "month", "key": "completed_on", "at": "2026-09-23"}');
  if r.compare #>> '{prior_window,from}' <> '2025-09-01T00:00:00-07:00' or r.prior_row_count <> 0 then
    raise exception 'S3-4a: same month last year is % with % jobs (want September 2025, none)', r.compare -> 'prior_window', r.prior_row_count;
  end if;
  select * into r from custom.record_aggregate(v_org, v_jobs, '[]', c_revenue, null, c_invoiced, 200, 'viewer',
    '{"against": "range", "period": "month", "key": "completed_on", "at": "2026-09-23", "baseline": {"from": "2026-08-09", "to": "2026-08-16"}}');
  if (r.prior_measures ->> 'sum_invoice_total')::numeric is distinct from 7260 then
    raise exception 'S3-4b: the fixed baseline Aug 9–15 answered % (want 7260)', r.prior_measures ->> 'sum_invoice_total';
  end if;
  select * into r from custom.record_aggregate(v_org, v_jobs, '[]', c_revenue, null, c_invoiced, 200, 'viewer',
    '{"against": "previous_period", "key": "completed_on", "from": "2026-09-13", "to": "2026-09-20"}');
  if (r.measures ->> 'sum_invoice_total')::numeric is distinct from 3610 or (r.prior_measures ->> 'sum_invoice_total')::numeric is distinct from 4635 then
    raise exception 'S3-4c: the week of Sep 13 against the week before answered % / % (want 3610 / 4635)', r.measures, r.prior_measures;
  end if;
  raise notice 'S3-4 PASS — same month last year (September 2025, no jobs), a fixed baseline ($7,260), an explicit week against the week before ($3,610 vs $4,635)';

  -- ══ 5. every malformed comparison is told, by name ══
  foreach v_state in array array['{"against": "last_week"}', '{"against": "previous_period", "basline": {}}',
                                 '{"against": "previous_period", "period": "month"}',
                                 '{"against": "range", "key": "completed_on"}',
                                 '{"against": "previous_period", "key": "completed_on", "from": "2026-09-20", "to": "2026-09-13"}'] loop
    begin
      perform custom.record_aggregate(v_org, v_jobs, '[]', c_revenue, null, c_invoiced, 200, 'viewer', v_state::jsonb);
      raise exception 'S3-5: % was answered instead of refused', v_state;
    exception when sqlstate '22023' or sqlstate '22004' then null;
    end;
  end loop;
  raise notice 'S3-5 PASS — an unknown comparison, a typo, no date, a range with no baseline and a backwards window are each refused with a sentence';

  -- ══ 6. no comparison: the answer it always was, with the calendar applied ══
  select count(*) into v_n from custom.record_aggregate(v_org, v_jobs, '[]', c_revenue, null, c_invoiced) a
   where a.prior_measures is null and a.delta is null and a.compare is null and (a.measures ->> 'sum_invoice_total')::numeric = 35310;
  if v_n <> 1 then raise exception 'S3-6: an uncompared total was not the one row of $35,310 with null comparison columns'; end if;
  select count(*) into v_n from custom.record_aggregate(v_org, v_jobs, '[]', c_revenue, '{"key": "completed_on", "by": "month"}', c_invoiced) a
   where a.groups ->> 'completed_on_month' in ('2026-08-01T00:00:00-07:00', '2026-09-01T00:00:00-07:00');
  if v_n <> 2 then raise exception 'S3-6b: month buckets are not local Camarillo months (got % of 2)', v_n; end if;
  raise notice 'S3-6 PASS — without a comparison the door answers what it did, and a month is a Camarillo month';

  -- ══ 7. the dashboard: a tile with a target, a weekly chart with the target's pace ══
  v_dash := custom.dashboard_declare(v_org, v_jobs, 'Rincon — revenue this month', jsonb_build_array(
    jsonb_build_object('title', 'Invoiced this month', 'kind', 'number', 'measures', c_revenue, 'filter', c_invoiced,
                       'compare', c_month, 'target', jsonb_build_object('value', 25000, 'label', 'Monthly target')),
    jsonb_build_object('title', 'Invoiced by week', 'kind', 'column', 'measures', c_revenue, 'filter', c_invoiced,
                       'bucket', jsonb_build_object('key', 'completed_on', 'by', 'week'),
                       'compare', c_month, 'target', jsonb_build_object('value', 25000, 'label', 'Monthly target')),
    jsonb_build_object('title', 'Jobs by status', 'kind', 'bar', 'group_by', jsonb_build_array('status'))), '{}'::jsonb, null);
  v_run := custom.dashboard_run(v_org, v_dash);
  v_b := v_run -> 'blocks' -> 0;
  if (v_b #>> '{totals,current}')::numeric is distinct from 16930 or (v_b #>> '{totals,prior}')::numeric is distinct from 18380
     or (v_b #>> '{target,progress}')::numeric is distinct from 0.6772 or v_b #>> '{target,label}' <> 'Monthly target' then
    raise exception 'S3-7: the tile answered totals % target % (want 16930 / 18380, progress 0.6772)', v_b -> 'totals', v_b -> 'target';
  end if;
  v_b := v_run -> 'blocks' -> 1;
  if (v_b #>> '{target,pace}')::numeric is distinct from 5000 or jsonb_array_length(v_b -> 'rows') <> 6
     or (v_b #>> '{totals,current}')::numeric is distinct from 16930 or (v_b #>> '{compare,bucket_count}')::integer <> 5 then
    raise exception 'S3-7b: the weekly chart answered pace % rows % totals % (want 5000, 6, 16930)', v_b #> '{target,pace}', jsonb_array_length(v_b -> 'rows'), v_b -> 'totals';
  end if;
  if (v_run -> 'blocks' -> 2) ? 'compare_refused' or (v_run -> 'blocks' -> 2 -> 'compare') <> 'null'::jsonb then
    raise exception 'S3-7c: an uncompared block grew a comparison: %', v_run -> 'blocks' -> 2;
  end if;
  raise notice 'S3-7 PASS — the tile: $16,930 of $25,000 (67.7 %%), -7.9 %% on August; the weekly chart: six weeks, a $5,000 weekly pace';

  -- ══ 8. the canvas's grain and comparison ══
  v_run := custom.dashboard_run(v_org, v_dash, '{}', '{"against": "previous_period", "period": "month", "at": "2026-09-23"}', 'day');
  if v_run -> 'blocks' -> 1 #>> '{bucket,by}' <> 'day' or v_run ->> 'grain' <> 'day'
     or (v_run -> 'blocks' -> 1 #>> '{compare,bucket_count}')::integer <> 30 then
    raise exception 'S3-8: the grain picker did not re-cut the chart to days: %', v_run -> 'blocks' -> 1 -> 'compare';
  end if;
  if not ((v_run -> 'blocks' -> 2) ? 'compare_refused') then
    raise exception 'S3-8b: a block with no date took the canvas comparison silently: %', v_run -> 'blocks' -> 2;
  end if;
  begin
    perform custom.dashboard_run(v_org, v_dash, '{}', null, 'fortnight');
    raise exception 'S3-8c: a grain the store does not cut was answered';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'S3-8 PASS — the canvas grain re-cut the chart to 30 days; the status block said it has no date to compare along; "fortnight" refused';

  -- ══ 9. a target is judged on the way in ══
  foreach v_state in array array[
      '{"title": "x", "kind": "number", "measures": [{"op": "sum", "key": "invoice_total"}], "target": {"value": 25000, "measure": "avg_invoice_total"}}',
      '{"title": "x", "kind": "number", "target": {"value": "a lot"}}',
      '{"title": "x", "kind": "number", "target": {"value": 10, "per": "bucket"}}',
      '{"title": "x", "kind": "number", "target": {"value": 10, "goal": 12}}',
      '{"title": "x", "kind": "stuck", "state_key": "status", "target": {"value": 10}}',
      '{"title": "x", "kind": "number", "compare": {"against": "previous_period", "key": "warranty_expires"}}'] loop
    begin
      perform custom.dashboard_declare(v_org, v_jobs, 'Rincon — broken on purpose', jsonb_build_array(v_state::jsonb), '{}'::jsonb, null);
      raise exception 'S3-9: % saved instead of being refused', v_state;
    exception when sqlstate '22023' or sqlstate '22004' then null;
    end;
  end loop;
  raise notice 'S3-9 PASS — a target on a measure the block lacks, a target that is not a number, per-bucket on a tile, a typo, a target on a not-moving list and a comparison along a missing field are each refused by name';

  -- ══ 10. Marisol's seat: only the jobs she booked, in BOTH windows ══
  perform set_config('request.jwt.claims', c_dana_j, true);
  select * into r from custom.record_aggregate(v_org, v_jobs, '[]', c_revenue, null, c_invoiced, 200, 'viewer', c_month);
  if (r.measures ->> 'sum_invoice_total')::numeric is distinct from 5570 or (r.prior_measures ->> 'sum_invoice_total')::numeric is distinct from 10200 then
    raise exception 'S3-10: Marisol saw % vs % (want her own 5570 vs 10200)', r.measures ->> 'sum_invoice_total', r.prior_measures ->> 'sum_invoice_total';
  end if;
  v_run := custom.dashboard_run(v_org, v_dash);
  if (v_run -> 'blocks' -> 0 #>> '{totals,current}')::numeric is distinct from 5570
     or (v_run -> 'blocks' -> 0 #>> '{totals,prior}')::numeric is distinct from 10200 then
    raise exception 'S3-10b: Marisol''s dashboard answered %', v_run -> 'blocks' -> 0 -> 'totals';
  end if;
  raise notice 'S3-10 PASS — Marisol''s tile: her $5,570 this month against her $10,200 in August, on the organization''s own dashboard';

  -- ══ 11. a stranger ══
  perform set_config('request.jwt.claims', c_stranger_j, true);
  begin
    perform custom.record_aggregate(v_org, v_jobs, '[]', c_revenue, null, c_invoiced, 200, 'viewer', c_month);
    raise exception 'S3-11: a stranger was told Rincon''s revenue';
  exception when insufficient_privilege then null;
  end;
  begin
    perform custom.dashboard_run(v_org, v_dash);
    raise exception 'S3-11b: a stranger ran Rincon''s dashboard';
  exception when insufficient_privilege then null;
  end;
  raise notice 'UICHAMP S3 GREEN — every part passed.';
end $t$;
rollback;
