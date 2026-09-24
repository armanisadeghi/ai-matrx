-- LANE S3 (UI-CHAMPIONS-PLAN rev 2, row 18) — A TARGET READ FROM A GOAL COLUMN.
--
-- THE USE CASE. Rincon Plumbing Co (Camarillo, California) quotes every job before the truck
-- rolls. On Wednesday 23 September 2026 the owner (admin@admin.com) asks how much of what the shop
-- QUOTED this month it has actually invoiced — the realization number a trade business watches,
-- because a job invoiced under its quote is margin given away. The goal is the Jobs table's own
-- "Quoted" column, not a number typed into the dashboard. Marisol Vega (test@test.com) dispatches
-- and sees only the jobs she booked; the shop's "Job cost" column is confidential and she may not
-- read it. Every customer, address, job number and amount is synthesized.
--
-- THE HAND-COMPUTED ANSWERS (status = Invoiced; the Completed and Scheduled jobs must NOT count):
--   September quoted: 650 + 2100 + 4400 + 385 + 2500 + 950 + 6200 + 430 = 17,615
--   September invoiced 16,930 → progress 16,930 / 17,615 = 0.9611; weekly pace 17,615 / 5 = 3,523.
--   August quoted: 385 + 1300 + 2800 + 460 + 7200 + 320 + 1875 + 600 + 3600 + 410 = 18,950
--   No comparison: every invoiced job, 36,565 quoted against 35,310 invoiced → 0.9657.
--   Marisol (RP-4140, RP-4150, RP-4155 in September): quoted 4400 + 950 + 430 = 5,780 against
--   her 5,570 → 0.9637. The same tile on "Job cost" is refused for her BY THE COLUMN'S NAME and
--   still shows her $5,570; the owner's reads Sept cost 180+940+2600+150+1320+480+2900+170 = 8,740.
--
-- WHAT MAKES IT FAIL: a target that cannot name a column ('"field" is not part of a target' —
-- RED before the file); a goal added up over other jobs than the number (the whole table, the
-- other month, jobs she cannot see); a column she may not read answered, or costing her the whole
-- block; a malformed goal saved.

\set ON_ERROR_STOP on
\timing off
\set suite 'uichamp_s3_target_field_green.sql'
\set requires 'function:custom.dashboard_run'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

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
  perform set_config('app.actor_system', 'campaign-test/uichamp-s3-goal-column', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co ' || substr(v_org::text, 1, 8),
          'rincon-plumbing-s3g-' || substr(v_org::text, 1, 8), 'RPC', c_admin);
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
  -- THE GOAL COLUMN: what the shop quoted the customer before the truck rolled.
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key', 'quoted_total', 'label', 'Quoted', 'type', 'currency', 'unit', '$', 'sort', 65));
  -- The shop's own cost of the job (parts + labor) — CONFIDENTIAL: dispatch does not see margins.
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key', 'job_cost', 'label', 'Job cost', 'type', 'currency', 'unit', '$', 'sort', 66, 'sensitivity', 'confidential'));

  for v_row in select e from jsonb_array_elements(jsonb_build_array(
    -- August 2026
    jsonb_build_object('job_number','RP-4101','customer','Delgado residence, 214 Calle Alta','job_type','Water heater flush','status','Invoiced','completed_on','2026-08-01','invoice_total',385,'quoted_total',385,'job_cost',150,'technician','Ruben Ortiz'),
    jsonb_build_object('job_number','RP-4104','customer','Harlan & Sons Dental, 88 Daily Dr','job_type','Backflow test + repair','status','Invoiced','completed_on','2026-08-04','invoice_total',1240,'quoted_total',1300,'job_cost',520,'technician','Kayla Brandt'),
    jsonb_build_object('job_number','RP-4108','customer','Nakamura residence, 1502 Ponderosa Dr','job_type','Partial repipe (PEX)','status','Invoiced','completed_on','2026-08-07','invoice_total',2950,'quoted_total',2800,'job_cost',1480,'technician','Ruben Ortiz'),
    jsonb_build_object('job_number','RP-4112','customer','Vista Del Mar HOA, unit 12','job_type','Garbage disposal replace','status','Invoiced','completed_on','2026-08-11','invoice_total',460,'quoted_total',460,'job_cost',210,'technician','Deshawn Pike'),
    jsonb_build_object('job_number','RP-4115','customer','Okafor residence, 3310 Las Posas Rd','job_type','Sewer lateral replacement','status','Invoiced','completed_on','2026-08-14','invoice_total',6800,'quoted_total',7200,'job_cost',3900,'technician','Kayla Brandt'),
    jsonb_build_object('job_number','RP-4119','customer','Brennan residence, 77 Mission Oaks Blvd','job_type','Toilet rebuild','status','Invoiced','completed_on','2026-08-18','invoice_total',320,'quoted_total',320,'job_cost',95,'technician','Deshawn Pike'),
    jsonb_build_object('job_number','RP-4122','customer','Camarillo Grill, 401 Ventura Blvd','job_type','Grease trap service','status','Invoiced','completed_on','2026-08-21','invoice_total',1875,'quoted_total',1875,'job_cost',610,'technician','Ruben Ortiz'),
    jsonb_build_object('job_number','RP-4126','customer','Fairweather residence, 9 Loma Vista','job_type','Hose bib + shutoff','status','Invoiced','completed_on','2026-08-25','invoice_total',540,'quoted_total',600,'job_cost',230,'technician','Kayla Brandt'),
    jsonb_build_object('job_number','RP-4129','customer','Lindqvist residence, 640 Arneill Rd','job_type','Tankless water heater','status','Invoiced','completed_on','2026-08-28','invoice_total',3400,'quoted_total',3600,'job_cost',2050,'technician','Ruben Ortiz'),
    jsonb_build_object('job_number','RP-4130','customer','Ferreira residence, 25 Glenn Dr','job_type','Slab leak detection','status','Completed','completed_on','2026-08-29','invoice_total',950,'quoted_total',950,'job_cost',400,'technician','Deshawn Pike'),
    jsonb_build_object('job_number','RP-4131','customer','Castellanos residence, 118 Calle Larga','job_type','Emergency burst line','status','Invoiced','completed_on','2026-08-31T23:30:00-07:00','invoice_total',410,'quoted_total',410,'job_cost',160,'technician','Kayla Brandt'),
    -- September 2026
    jsonb_build_object('job_number','RP-4133','customer','Abernathy residence, 1920 Flynn Rd','job_type','Kitchen drain clear','status','Invoiced','completed_on','2026-09-01','invoice_total',675,'quoted_total',650,'job_cost',180,'technician','Deshawn Pike'),
    jsonb_build_object('job_number','RP-4136','customer','Pleasant Valley Preschool','job_type','Fixture replacements (4)','status','Invoiced','completed_on','2026-09-03','invoice_total',1980,'quoted_total',2100,'job_cost',940,'technician','Ruben Ortiz'),
    jsonb_build_object('job_number','RP-4140','customer','Hollis residence, 505 Village at the Park','job_type','Tankless water heater','status','Invoiced','completed_on','2026-09-08','invoice_total',4250,'quoted_total',4400,'job_cost',2600,'technician','Kayla Brandt'),
    jsonb_build_object('job_number','RP-4143','customer','Okafor residence, 3310 Las Posas Rd','job_type','Water heater flush','status','Invoiced','completed_on','2026-09-10','invoice_total',385,'quoted_total',385,'job_cost',150,'technician','Deshawn Pike'),
    jsonb_build_object('job_number','RP-4147','customer','Mesa Verde Apartments, bldg C','job_type','Main shutoff valve','status','Invoiced','completed_on','2026-09-15','invoice_total',2720,'quoted_total',2500,'job_cost',1320,'technician','Ruben Ortiz'),
    jsonb_build_object('job_number','RP-4150','customer','Salazar residence, 81 Adolfo Rd','job_type','Water softener install','status','Invoiced','completed_on','2026-09-17','invoice_total',890,'quoted_total',950,'job_cost',480,'technician','Kayla Brandt'),
    jsonb_build_object('job_number','RP-4152','customer','Ventura County Credit Union','job_type','Restroom rough-in','status','Completed','completed_on','2026-09-19','invoice_total',1150,'quoted_total',1150,'job_cost',700,'technician','Deshawn Pike'),
    jsonb_build_object('job_number','RP-4153','customer','Whitlock residence, 2711 Ridgeview Dr','job_type','Slab leak reroute','status','Invoiced','completed_on','2026-09-21','invoice_total',5600,'quoted_total',6200,'job_cost',2900,'technician','Ruben Ortiz'),
    jsonb_build_object('job_number','RP-4155','customer','Tran residence, 44 Paseo Camarillo','job_type','Faucet + supply lines','status','Invoiced','completed_on','2026-09-22','invoice_total',430,'quoted_total',430,'job_cost',170,'technician','Kayla Brandt'),
    jsonb_build_object('job_number','RP-4157','customer','Harlan & Sons Dental, 88 Daily Dr','job_type','Annual backflow test','status','Scheduled','completed_on','2026-09-28','quoted_total',180,'job_cost',60,'technician','Deshawn Pike')
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
  c_invoiced   constant jsonb := '{"status": "Invoiced"}';
  c_revenue    constant jsonb := '[{"op": "sum", "key": "invoice_total"}]';
  c_month      constant jsonb := '{"against": "previous_period", "period": "month", "key": "completed_on", "at": "2026-09-23"}';
  c_quoted     constant jsonb := '{"field": "quoted_total", "label": "Quoted"}';
  v_org  uuid; v_jobs uuid; v_dash uuid;
  v_run jsonb;
  v_b jsonb;
  v_state text;
begin
  select v into v_org from s3 where k = 'org';
  select v into v_jobs from s3 where k = 'jobs';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ══ G1. the tile, the weekly chart and an uncompared tile, all against the Quoted column ══
  v_dash := custom.dashboard_declare(v_org, v_jobs, 'Rincon — invoiced against quoted', jsonb_build_array(
    jsonb_build_object('title', 'Invoiced against quoted', 'kind', 'number', 'measures', c_revenue, 'filter', c_invoiced,
                       'compare', c_month, 'target', c_quoted),
    jsonb_build_object('title', 'Invoiced by week', 'kind', 'column', 'measures', c_revenue, 'filter', c_invoiced,
                       'bucket', jsonb_build_object('key', 'completed_on', 'by', 'week'),
                       'compare', c_month, 'target', c_quoted),
    jsonb_build_object('title', 'Every invoiced job against its quote', 'kind', 'number', 'measures', c_revenue,
                       'filter', c_invoiced, 'target', c_quoted),
    jsonb_build_object('title', 'Invoiced against cost', 'kind', 'number', 'measures', c_revenue, 'filter', c_invoiced,
                       'compare', c_month, 'target', '{"field": "job_cost", "label": "Job cost"}'::jsonb)), '{}'::jsonb, null);
  v_run := custom.dashboard_run(v_org, v_dash);
  v_b := v_run -> 'blocks' -> 0;
  if v_b #>> '{target,field}' is distinct from 'quoted_total' or v_b #>> '{target,op}' is distinct from 'sum'
     or (v_b #>> '{target,value}')::numeric is distinct from 17615
     or (v_b #>> '{target,current}')::numeric is distinct from 16930
     or (v_b #>> '{target,progress}')::numeric is distinct from 0.9611 then
    raise exception 'S3G-1: the tile''s goal answered % (want quoted_total sum 17615, current 16930, progress 0.9611)', v_b;
  end if;
  v_b := v_run -> 'blocks' -> 1;
  if (v_b #>> '{target,value}')::numeric is distinct from 17615 or (v_b #>> '{target,pace}')::numeric is distinct from 3523 then
    raise exception 'S3G-1b: the weekly chart''s goal answered % (want 17615, pace 3523 over five Sunday weeks)', v_b -> 'target';
  end if;
  v_b := v_run -> 'blocks' -> 2;
  if (v_b #>> '{target,value}')::numeric is distinct from 36565 or (v_b #>> '{target,progress}')::numeric is distinct from 0.9657 then
    raise exception 'S3G-1c: an uncompared tile''s goal answered % (want every invoiced job: 36565, 0.9657)', v_b -> 'target';
  end if;
  v_b := v_run -> 'blocks' -> 3;
  if (v_b #>> '{target,value}')::numeric is distinct from 8740 or v_b -> 'target' ? 'refused' then
    raise exception 'S3G-1d: the owner''s cost goal answered % (want 8740, not refused)', v_b -> 'target';
  end if;
  raise notice 'S3G-1 PASS — invoiced $16,930 of $17,615 quoted this month (96.1 %%); weekly pace $3,523; all invoiced jobs $35,310 of $36,565; the owner reads the cost goal ($8,740)';

  -- ══ G2. Marisol: her own jobs' quotes, and the confidential column refused by name ══
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_run := custom.dashboard_run(v_org, v_dash);
  v_b := v_run -> 'blocks' -> 0;
  if (v_b #>> '{target,value}')::numeric is distinct from 5780 or (v_b #>> '{target,progress}')::numeric is distinct from 0.9637 then
    raise exception 'S3G-2: Marisol''s goal answered % (want her own jobs'' quotes 5780, progress 0.9637)', v_b -> 'target';
  end if;
  v_b := v_run -> 'blocks' -> 3;
  if v_b ? 'refused' or (v_b #>> '{totals,current}')::numeric is distinct from 5570 then
    raise exception 'S3G-2b: the cost block cost Marisol the whole block: %', v_b;
  end if;
  if coalesce(v_b #>> '{target,refused}', '') not like '%Job cost%' or v_b #> '{target,value}' <> 'null'::jsonb
     or v_b #> '{target,progress}' <> 'null'::jsonb then
    raise exception 'S3G-2c: a column Marisol may not read was answered or refused without its name: %', v_b -> 'target';
  end if;
  raise notice 'S3G-2 PASS — Marisol: $5,570 of her own $5,780 quoted (96.4 %%); the Job cost goal refused to her by name — "%" — and her number still drawn', v_b #>> '{target,refused}';

  -- ══ G3. a malformed goal is refused on the way in, by name ══
  perform set_config('request.jwt.claims', c_admin_j, true);
  foreach v_state in array array[
      '{"title": "x", "kind": "number", "measures": [{"op": "sum", "key": "invoice_total"}], "target": {"field": "estimate_total"}}',
      '{"title": "x", "kind": "number", "measures": [{"op": "sum", "key": "invoice_total"}], "target": {"field": "quoted_total", "value": 20000}}',
      '{"title": "x", "kind": "number", "measures": [{"op": "sum", "key": "invoice_total"}], "target": {"value": 20000, "op": "sum"}}',
      '{"title": "x", "kind": "number", "measures": [{"op": "sum", "key": "invoice_total"}], "target": {"field": "quoted_total", "op": "median"}}',
      '{"title": "x", "kind": "column", "measures": [{"op": "sum", "key": "invoice_total"}], "bucket": {"key": "completed_on", "by": "week"}, "target": {"field": "quoted_total", "per": "bucket"}}'] loop
    begin
      perform custom.dashboard_declare(v_org, v_jobs, 'Rincon — broken on purpose', jsonb_build_array(v_state::jsonb), '{}'::jsonb, null);
      raise exception 'S3G-3: % saved instead of being refused', v_state;
    exception when sqlstate '22023' or sqlstate '22004' then null;
    end;
  end loop;
  raise notice 'S3G-3 PASS — a column the table lacks, a value and a column at once, op on a fixed number, a median goal and a per-bucket goal column are each refused by name';

  -- ══ G4. a fixed-number target is exactly what it was ══
  v_dash := custom.dashboard_declare(v_org, v_jobs, 'Rincon — the fixed target', jsonb_build_array(
    jsonb_build_object('title', 'Invoiced this month', 'kind', 'number', 'measures', c_revenue, 'filter', c_invoiced,
                       'compare', c_month, 'target', jsonb_build_object('value', 25000, 'label', 'Monthly target'))), '{}'::jsonb, null);
  v_b := custom.dashboard_run(v_org, v_dash) -> 'blocks' -> 0;
  if (v_b #>> '{target,value}')::numeric is distinct from 25000 or (v_b #>> '{target,progress}')::numeric is distinct from 0.6772
     or v_b -> 'target' ? 'field' then
    raise exception 'S3G-4: the fixed target moved: %', v_b -> 'target';
  end if;
  raise notice 'S3G-4 PASS — a fixed $25,000 target still reads 67.7 %%';
  raise notice 'UICHAMP S3 GOAL COLUMN GREEN — every part passed.';
end $t$;
rollback;
