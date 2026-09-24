-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- LANE S2-PRIME FILTER-GROUPS — THE SHARED FIXTURE. Included by filtergroups_green.sql and
-- filtergroups_red.sql INSIDE the suite's own `begin; … rollback;`, after the preamble. It asserts
-- nothing.
--
-- THE USE CASE. Rosa Delgado (test@test.com) dispatches for Topa Topa Plumbing & Rooter, a
-- residential plumbing and drain company with a yard in Ojai and technicians across the Ojai
-- Valley, Meiners Oaks, Oak View and Ventura. The owner, Hector Morales (admin@admin.com), set the
-- company to "members see what they are given" and shares the day's jobs with dispatch; two
-- warranty call-backs he keeps to himself. Rosa's morning view is
--   (status is Open OR status is Scheduled) AND (city is Ojai OR technician is Maria)
--   AND NOT priority is Low
-- read three ways: the grid, the board by status, and the count + dollar total on her dashboard.
-- Every name, phone and street below is synthesized.
--
-- WHAT IT LEAVES BEHIND (in the suite's transaction only), in the temp table fg (k, v):
--   org, admin, dana, jobs (the Jobs table), f_job, f_customer, f_city, f_tech, f_status,
--   f_priority, f_amount, rule (Rosa's view as a membership Rule), and j01 … j18 (record ids).
-- ═══════════════════════════════════════════════════════════════════════════════════════════

create temp table fg (k text primary key, v uuid) on commit drop;
grant select on fg to authenticated;

do $fg_fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_jobs    uuid;
  v_id      uuid;
  v_row     jsonb;
  v_n       integer := 0;
  v_keep    boolean;
begin
  perform set_config('app.actor_system', 'campaign-test/filtergroups', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Topa Topa Plumbing & Rooter ' || substr(v_org::text, 1, 8),
          'topa-topa-plumbing-' || substr(v_org::text, 1, 8), 'TTP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',            'organization', v_org, v_org, 'true'::jsonb,          'filtergroups fixture'),
    ('custom', 'member_default_visibility', 'organization', v_org, v_org, '"shared_only"'::jsonb, 'filtergroups fixture: dispatch sees the jobs the owner shares');
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
  insert into fg values ('org', v_org), ('admin', c_admin), ('dana', c_dana), ('jobs', v_jobs), ('home', v_home);

  insert into fg values ('f_job', custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'key', 'job_no', 'label', 'Job', 'type', 'text', 'sort', 10, 'required', true)));
  insert into fg values ('f_customer', custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'key', 'customer', 'label', 'Customer', 'type', 'text', 'sort', 20)));
  insert into fg values ('f_city', custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'key', 'city', 'label', 'City', 'type', 'text', 'sort', 30)));
  insert into fg values ('f_tech', custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'key', 'technician', 'label', 'Technician', 'type', 'select', 'sort', 40,
    'options', jsonb_build_array('Maria', 'Diego', 'Tomás', 'Kevin'))));
  insert into fg values ('f_priority', custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'key', 'priority', 'label', 'Priority', 'type', 'select', 'sort', 50,
    'options', jsonb_build_array('Emergency', 'High', 'Normal', 'Low'))));
  insert into fg values ('f_amount', custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'key', 'amount', 'label', 'Quoted', 'type', 'currency', 'unit', '$', 'sort', 60)));

  -- The board: status is the stage field, declared the way a person declares a pipeline.
  perform custom.pipeline_declare(v_org, v_jobs, jsonb_build_object(
    'stage_field', jsonb_build_object('key', 'status', 'label', 'Status',
       'options', jsonb_build_array('Open', 'Scheduled', 'In progress', 'Completed', 'Invoiced'))));
  insert into fg select 'f_status', f.id from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_jobs and f.data ->> 'key' = 'status';

  -- Eighteen calls on a Wednesday in late September. Quotes are what a valley plumber charges in 2026.
  for v_row in select e from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('job_no','TT-4101','customer','Linnea Hargrove',  'city','Ojai',         'technician','Maria', 'status','Open',        'priority','Emergency','amount',485),
    jsonb_build_object('job_no','TT-4102','customer','Rafael Quintero',  'city','Ojai',         'technician','Diego', 'status','Scheduled',   'priority','Normal',   'amount',320),
    jsonb_build_object('job_no','TT-4103','customer','Beverly Ashcombe', 'city','Ojai',         'technician','Kevin', 'status','Open',        'priority','Low',      'amount',150),
    jsonb_build_object('job_no','TT-4104','customer','Sunil Varghese',   'city','Meiners Oaks', 'technician','Maria', 'status','Scheduled',   'priority','High',     'amount',1240),
    jsonb_build_object('job_no','TT-4105','customer','Colette Imbert',   'city','Oak View',     'technician','Maria', 'status','Open',        'priority','Low',      'amount',95),
    jsonb_build_object('job_no','TT-4106','customer','Dwayne Pickering', 'city','Ventura',      'technician','Tomás', 'status','Open',        'priority','High',     'amount',610),
    jsonb_build_object('job_no','TT-4107','customer','Marguerite Olsen', 'city','Ojai',         'technician','Tomás', 'status','In progress', 'priority','High',     'amount',2750),
    jsonb_build_object('job_no','TT-4108','customer','Hiroshi Tanabe',   'city','Ojai',         'technician','Diego', 'status','Scheduled',   'priority','Emergency','amount',540),
    jsonb_build_object('job_no','TT-4109','customer','Priya Castellano', 'city','Meiners Oaks', 'technician','Kevin', 'status','Open',        'priority','Normal',   'amount',275),
    jsonb_build_object('job_no','TT-4110','customer','Graham Whitlock',  'city','Oak View',     'technician','Maria', 'status','Completed',   'priority','Normal',   'amount',880),
    jsonb_build_object('job_no','TT-4111','customer','Esperanza Ruelas', 'city','Ojai',         'technician','Kevin', 'status','Scheduled',   'amount',365),
    jsonb_build_object('job_no','TT-4112','customer','Tobias Brandt',    'city','Ventura',      'technician','Maria', 'status','Scheduled',   'priority','Normal',   'amount',420),
    jsonb_build_object('job_no','TT-4113','customer','Nadia Farouk',     'city','Ojai',         'technician','Diego', 'status','Invoiced',    'priority','High',     'amount',1985),
    jsonb_build_object('job_no','TT-4114','customer','Wendell Frye',     'city','Ventura',      'technician','Kevin', 'status','Open',        'priority','Emergency','amount',730),
    jsonb_build_object('job_no','TT-4115','customer','Ingrid Solberg',   'city','Meiners Oaks', 'technician','Maria', 'status','Open',        'priority','Emergency','amount',510),
    jsonb_build_object('job_no','TT-4116','customer','Ahmad Karimi',     'city','Ojai',         'technician','Tomás', 'status','Open',        'priority','Normal',   'amount',260),
    jsonb_build_object('job_no','TT-4117','customer','Rosalind Keogh',   'city','Ojai',         'technician','Maria', 'status','Scheduled',   'priority','High',     'amount',1150),
    jsonb_build_object('job_no','TT-4118','customer','Lucas Etxeberria', 'city','Oak View',     'technician','Diego', 'status','Scheduled',   'priority','Low',      'amount',180)
  )) e loop
    v_n := v_n + 1;
    v_id := custom.record_write(v_org, v_jobs, v_row);
    insert into fg values ('j' || lpad(v_n::text, 2, '0'), v_id);
    -- Two warranty call-backs the owner keeps to himself (TT-4108, TT-4117); every other job is
    -- shared with dispatch.
    v_keep := v_row ->> 'job_no' in ('TT-4108', 'TT-4117');
    if not v_keep then
      perform custom.share_grant(v_org, v_id, 'person', c_dana, 'viewer'::public.permission_level);
    end if;
  end loop;
end
$fg_fixture$;
