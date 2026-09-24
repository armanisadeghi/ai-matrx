-- LANE S3 — THE WALK'S KEPT ORGANIZATION on the dev clone (never production: the preamble names
-- the target and this file refuses anything but the clone). Rincon Plumbing Co's Ventura branch,
-- a real-shaped Jobs table for August and September 2026 in Camarillo time, Sunday weeks, a
-- dashboard "Revenue this month" with a number tile (target $25,000) and a weekly column chart
-- compared with last month, and Marisol Vega (test@test.com) as a member who sees only the jobs
-- shared with her. Found BY SLUG and reused (_fixture_org.sql); the table and the dashboard are
-- made once and found by name after that. Run:
--   psql "<clone>" -v expect=clone -f scripts/campaign-tests/uichamp_s3_walk_seed.sql
-- It prints the organization, table and dashboard ids for the walk.

\set ON_ERROR_STOP on
\set expect 'clone'
\set suite 'uichamp_s3_walk_seed.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
\set fixture_slug 'rincon-plumbing-co-ventura-periods-walk'
\set fixture_name 'Rincon Plumbing Co — Ventura Branch'
\set fixture_abbr 'RPC'
\i scripts/campaign-tests/_fixture_org.sql

do $seed$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_org  uuid := current_setting('matrx.fixture_org')::uuid;
  v_home uuid;
  v_jobs uuid;
  v_id   uuid;
  v_row  jsonb;
  v_dash uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/uichamp-s3-walk', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_dana, 'member', 'active')
  on conflict (container_type, container_id, user_id) do nothing;
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  select * from (values
    ('custom', 'system_enabled',            'organization', v_org, v_org, 'true'::jsonb,                  's3 walk'),
    ('custom', 'member_default_visibility', 'organization', v_org, v_org, '"shared_only"'::jsonb,         's3 walk: dispatch sees the jobs she booked'),
    ('custom', 'time_zone',                 'organization', v_org, v_org, '"America/Los_Angeles"'::jsonb, 's3 walk: the shop is in Ventura County, California'),
    ('custom', 'week_start',                'organization', v_org, v_org, '"sunday"'::jsonb,              's3 walk: the schedule runs Sunday to Saturday')
  ) v(feature, key, scope_kind, scope_id, organization_id, value, set_note)
  where not exists (select 1 from platform.knob_override o
                     where o.feature = v.feature and o.key = v.key and o.scope_kind = 'organization' and o.scope_id = v_org);

  select r.id into v_jobs from custom.record r
   where r.organization_id = v_org and r.table_id = custom.table_kernel_id() and r.deleted_at is null
     and r.data ->> 'name' = 'Jobs' limit 1;
  if v_jobs is null then
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
    perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key', 'job_number', 'label', 'Job #', 'type', 'text', 'sort', 10, 'required', true));
    perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key', 'customer', 'label', 'Customer', 'type', 'text', 'sort', 20));
    perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key', 'job_type', 'label', 'Job type', 'type', 'text', 'sort', 30));
    perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'select', 'sort', 40,
      'options', jsonb_build_array('Scheduled', 'In progress', 'Completed', 'Invoiced')));
    perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key', 'completed_on', 'label', 'Completed', 'type', 'datetime', 'sort', 50));
    perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key', 'invoice_total', 'label', 'Invoice total', 'type', 'currency', 'unit', '$', 'sort', 60));
    perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key', 'technician', 'label', 'Technician', 'type', 'text', 'sort', 70));

    for v_row in select e from jsonb_array_elements(jsonb_build_array(
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
      if v_row ->> 'job_number' in ('RP-4140', 'RP-4150', 'RP-4155', 'RP-4115', 'RP-4129') then
        perform custom.share_grant(v_org, v_id, 'person', c_dana, 'viewer'::public.permission_level);
      end if;
    end loop;
  end if;

  select d.id into v_dash from custom.record d
   where d.organization_id = v_org and d.table_id = custom.presentation_kernel_id()
     and d.data_class = custom.dashboard_class() and d.deleted_at is null
     and d.data ->> 'name' = 'Revenue this month' limit 1;
  v_dash := custom.dashboard_declare(v_org, v_jobs, 'Revenue this month', jsonb_build_array(
    jsonb_build_object('title', 'Invoiced this month', 'kind', 'number', 'span', 4,
      'measures', '[{"op": "sum", "key": "invoice_total"}]'::jsonb, 'filter', '{"status": "Invoiced"}'::jsonb,
      'compare', '{"against": "previous_period", "period": "month", "key": "completed_on"}'::jsonb,
      'target', '{"value": 25000, "label": "Monthly target"}'::jsonb),
    jsonb_build_object('title', 'Invoiced by week', 'kind', 'column', 'span', 8,
      'measures', '[{"op": "sum", "key": "invoice_total"}]'::jsonb, 'filter', '{"status": "Invoiced"}'::jsonb,
      'bucket', '{"key": "completed_on", "by": "week"}'::jsonb,
      'compare', '{"against": "previous_period", "period": "month", "key": "completed_on"}'::jsonb,
      'target', '{"value": 25000, "label": "Monthly target"}'::jsonb),
    jsonb_build_object('title', 'Jobs by status', 'kind', 'bar', 'group_by', '["status"]'::jsonb)),
    '{}'::jsonb, v_dash);

  raise notice 'S3 WALK org=% table=% dashboard=%', v_org, v_jobs, v_dash;
  perform set_config('matrx.s3_walk', v_org || ' ' || v_jobs || ' ' || v_dash, true);
end
$seed$;
select current_setting('matrx.s3_walk') as s3_walk;
commit;
