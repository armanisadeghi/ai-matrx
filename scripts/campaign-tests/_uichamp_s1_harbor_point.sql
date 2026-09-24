-- LANE S1' VIEW-KEYS — THE FIXTURE (asserts nothing). Harbor Point Plumbing & Drain's Jobs.
--
-- Marisol Vega dispatches (test@test.com, a member who edits jobs); the owner is admin@admin.com.
-- Twelve jobs on a Thursday in late September across three technicians. The board's stage field is
-- Status (New → Scheduled → On site → Done, and Cancelled). An older "Legacy tag" column was
-- retired last month (archived, never destroyed). Every name, address and price is synthesized.
--
-- Used by uichamp_s1_green.sql and uichamp_s1_red.sql. Leaves its ids in temp table `s1`.

create temp table s1 (k text primary key, v uuid) on commit drop;
grant select on s1 to authenticated;

do $s1_fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_marisol constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_jobs uuid; v_crews uuid; v_row jsonb; v_n integer := 0;
begin
  perform set_config('app.actor_system', 'campaign-test/uichamp_s1', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Harbor Point Plumbing & Drain ' || substr(v_org::text, 1, 8),
          'harbor-point-plumbing-' || substr(v_org::text, 1, 8), 'HPP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin,   'owner',  'active'),
    (v_org, 'organization', v_org, c_marisol, 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',       'organization', v_org, v_org, 'true'::jsonb,     'uichamp_s1 fixture'),
    ('custom', 'member_default_level', 'organization', v_org, v_org, '"editor"'::jsonb, 'uichamp_s1 fixture: dispatch edits jobs');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  v_jobs := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Jobs', 'slug', 'jobs', 'type', 'entity',
    'label_singular', 'Job', 'label_plural', 'Jobs',
    'title_field', 'job_no', 'display', 'list', 'weight', 'light',
    'ordered', true, 'row_order', 'sorted', 'agent_writable', true, 'retention_days', 3650,
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'job_no', 'direction', 'asc')),
    'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'job_no'))));
  insert into s1 values ('org', v_org), ('jobs', v_jobs);

  insert into s1 values ('f_job', custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'key', 'job_no', 'label', 'Job', 'type', 'text', 'sort', 10, 'required', true)));
  insert into s1 values ('f_customer', custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'key', 'customer', 'label', 'Customer', 'type', 'text', 'sort', 20)));
  insert into s1 values ('f_address', custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'key', 'address', 'label', 'Address', 'type', 'text', 'sort', 30)));
  insert into s1 values ('f_tech', custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'key', 'technician', 'label', 'Technician', 'type', 'select', 'sort', 40,
    'options', jsonb_build_array('Dario Reyes', 'Keisha Moore', 'Tom Lindqvist'))));
  insert into s1 values ('f_priority', custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'key', 'priority', 'label', 'Priority', 'type', 'select', 'sort', 50,
    'options', jsonb_build_array('Emergency', 'Warranty', 'Routine'))));
  insert into s1 values ('f_window', custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'key', 'arrival_window', 'label', 'Window', 'type', 'datetime', 'sort', 60)));
  insert into s1 values ('f_price', custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'key', 'price', 'label', 'Price', 'type', 'currency', 'unit', '$', 'sort', 70)));
  insert into s1 values ('f_photo', custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'key', 'site_photo', 'label', 'Site photo', 'type', 'text', 'sort', 80)));
  insert into s1 values ('f_legacy', custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'key', 'legacy_tag', 'label', 'Legacy tag', 'type', 'select', 'sort', 90,
    'options', jsonb_build_array('Red', 'Blue'))));

  perform custom.pipeline_declare(v_org, v_jobs, jsonb_build_object(
    'stage_field', jsonb_build_object('key', 'status', 'label', 'Status',
       'options', jsonb_build_array('New', 'Scheduled', 'On site', 'Done', 'Cancelled'))));
  insert into s1 select 'f_status', f.id from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_jobs and f.data ->> 'key' = 'status';

  for v_row in select e from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('job_no','HP-2201','customer','Odette Varga',    'address','14 Pelican Way',      'technician','Dario Reyes',  'priority','Emergency','status','New',       'arrival_window','2026-09-24T08:00:00Z','price',640),
    jsonb_build_object('job_no','HP-2202','customer','Bram Achterberg', 'address','902 Harbor Blvd',     'technician','Keisha Moore', 'priority','Warranty', 'status','Scheduled', 'arrival_window','2026-09-24T09:00:00Z','price',0),
    jsonb_build_object('job_no','HP-2203','customer','Imani Okafor',    'address','33 Seacliff Ct',      'technician','Tom Lindqvist','priority','Routine',  'status','Scheduled', 'arrival_window','2026-09-24T10:00:00Z','price',185),
    jsonb_build_object('job_no','HP-2204','customer','Walt Hennessey',  'address','7 Anchor Ln',         'technician','Dario Reyes',  'priority','Emergency','status','On site',   'arrival_window','2026-09-24T07:30:00Z','price',1320),
    jsonb_build_object('job_no','HP-2205','customer','Soledad Ibarra',  'address','418 Marina Dr',       'technician','Keisha Moore', 'priority','Emergency','status','Scheduled', 'arrival_window','2026-09-24T11:00:00Z','price',475),
    jsonb_build_object('job_no','HP-2206','customer','Garrett Pryce',   'address','1150 Breakwater Rd',  'technician','Tom Lindqvist','priority','Warranty', 'status','Done',      'arrival_window','2026-09-23T15:00:00Z','price',90),
    jsonb_build_object('job_no','HP-2207','customer','Lena Castellanos','address','56 Tidewater St',     'technician','Dario Reyes',  'priority','Routine',  'status','New',       'arrival_window','2026-09-25T08:00:00Z','price',260),
    jsonb_build_object('job_no','HP-2208','customer','Kofi Mensah',     'address','2 Lighthouse Pt',     'technician','Keisha Moore', 'priority','Emergency','status','Done',      'arrival_window','2026-09-23T13:00:00Z','price',980),
    jsonb_build_object('job_no','HP-2209','customer','Ruth Ostrowski',  'address','77 Jetty Ave',        'technician','Tom Lindqvist','priority','Emergency','status','Cancelled', 'arrival_window','2026-09-24T12:00:00Z','price',350),
    jsonb_build_object('job_no','HP-2210','customer','Dmitri Sokolov',  'address','309 Gull Ter',        'technician','Dario Reyes',  'priority','Warranty', 'status','Scheduled', 'arrival_window','2026-09-24T13:30:00Z','price',120),
    jsonb_build_object('job_no','HP-2211','customer','Ayesha Qureshi',  'address','84 Driftwood Cir',    'technician','Keisha Moore', 'priority','Routine',  'status','On site',   'arrival_window','2026-09-24T08:30:00Z','price',415),
    jsonb_build_object('job_no','HP-2212','customer','Colm Brennan',    'address','610 Starboard Way',   'technician','Tom Lindqvist','priority','Warranty', 'status','New',       'arrival_window','2026-09-25T09:30:00Z','price',210)
  )) e loop
    v_n := v_n + 1;
    insert into s1 values ('j' || lpad(v_n::text, 2, '0'), custom.record_write(v_org, v_jobs, v_row));
  end loop;

  -- The legacy column, retired (archived) last month.
  perform custom.field_retire(v_org, (select v from s1 where k = 'f_legacy'));

  -- Another Table of the same organization, whose Field a view of Jobs may never name.
  v_crews := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Crews', 'slug', 'crews', 'type', 'entity',
    'label_singular', 'Crew', 'label_plural', 'Crews', 'title_field', 'crew',
    'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted', 'agent_writable', true,
    'retention_days', 3650, 'default_sort', jsonb_build_array(jsonb_build_object('field', 'crew', 'direction', 'asc')),
    'parent_id', v_home::text, 'fields', jsonb_build_array(jsonb_build_object('name', 'crew'))));
  insert into s1 values ('crews', v_crews), ('f_crew', custom.field_declare(v_org, v_crews, jsonb_build_object(
    'key', 'crew', 'label', 'Crew', 'type', 'select', 'sort', 10, 'options', jsonb_build_array('North', 'South'))));
end
$s1_fixture$;
