-- LANE S2-PRIME, FOLLOW-UP AGG-FIELD-READ (lane S3's finding 5) — A SUM NEVER READS A COLUMN ITS
-- READER MAY NOT.
--
-- THE USE CASE (lane S3's Rincon fixture, rebuilt here and rolled back). Rincon Plumbing Co
-- (Camarillo, California): the owner (admin@admin.com) watches the shop's "Job cost" column,
-- which is CONFIDENTIAL. Marisol Vega (test@test.com) dispatches and sees only the five jobs she
-- booked (RP-4115, RP-4129, RP-4140, RP-4150, RP-4155); she may not read Job cost. Every customer,
-- address, job number and amount is synthesized.
--
-- HAND-COMPUTED ANSWERS: owner, sum of Job cost over all 21 jobs = 9,805 (August) + 9,500
-- (September) = 19,305. Marisol: 5 jobs; her invoiced total 6,800 + 3,400 + 4,250 + 890 + 430 = 15,770.
--
-- WHAT MAKES IT FAIL (RED before filtergroups_a_sum_never_reads_a_column_its_reader_may_not.sql):
-- Marisol's sum of Job cost is ANSWERED (her five jobs' cost, 9,200 = 3,900 + 2,050 + 2,600 + 480 +
-- 170; measured RED on the clone 2026-09-24) instead of refused by the column's name; so are a group, a median, a count of distinct
-- values and a flat filter on it; a dashboard block on it answers her; or — the other way — the
-- refusal costs her the columns she may read, or the owner's number.

\set ON_ERROR_STOP on
\timing off
\set suite 'filtergroups_aggread_green.sql'
\set requires 'function:custom.record_aggregate'
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
  perform set_config('app.actor_system', 'campaign-test/filtergroups-aggread', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co ' || substr(v_org::text, 1, 8),
          'rincon-plumbing-agr-' || substr(v_org::text, 1, 8), 'RPC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',            'organization', v_org, v_org, 'true'::jsonb,                  's2 aggread fixture'),
    ('custom', 'member_default_visibility', 'organization', v_org, v_org, '"shared_only"'::jsonb,         's2 aggread fixture: dispatch sees the jobs she booked'),
    ('custom', 'time_zone',                 'organization', v_org, v_org, '"America/Los_Angeles"'::jsonb, 's2 aggread fixture: the shop is in Camarillo, California'),
    ('custom', 'week_start',                'organization', v_org, v_org, '"sunday"'::jsonb,              's2 aggread fixture: the schedule runs Sunday to Saturday');
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
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid; v_jobs uuid; v_dash uuid;
  v_n numeric; v_rows bigint; v_msg text; v_state text;
  v_q jsonb; v_b jsonb;
begin
  select v into v_org from s3 where k = 'org';
  select v into v_jobs from s3 where k = 'jobs';
  perform set_config('role', 'authenticated', true);

  -- ══ A1. the owner still reads the shop's cost ══
  perform set_config('request.jwt.claims', c_admin_j, true);
  select (measures ->> 'sum_job_cost')::numeric into v_n
    from custom.record_aggregate(v_org, v_jobs, '[]'::jsonb, '[{"op": "sum", "key": "job_cost"}]'::jsonb);
  if v_n is distinct from 19305 then
    raise exception 'AGR-1: the owner''s Job cost total answered % (want 19,305)', v_n;
  end if;
  raise notice 'AGR-1 PASS — the owner reads the shop''s cost: $19,305';

  -- ══ A2. Marisol: every question that reads Job cost is refused by the column's name ══
  perform set_config('request.jwt.claims', c_dana_j, true);
  foreach v_state in array array[
      '{"m": [{"op": "sum", "key": "job_cost"}]}',
      '{"m": [{"op": "avg", "key": "job_cost"}]}',
      '{"m": [{"op": "max", "key": "job_cost"}]}',
      '{"m": [{"op": "median", "key": "job_cost"}]}',
      '{"m": [{"op": "unique", "key": "job_cost"}]}',
      '{"m": [{"op": "filled", "key": "job_cost"}]}',
      '{"m": [{"op": "count"}, {"op": "sum", "key": "invoice_total"}], "g": ["job_cost"]}',
      '{"m": [{"op": "count"}], "f": {"job_cost": 2600}}'] loop
    v_q := v_state::jsonb;
    v_msg := null;
    begin
      select (measures)::text into v_msg
        from custom.record_aggregate(v_org, v_jobs, coalesce(v_q -> 'g', '[]'::jsonb), v_q -> 'm',
                                     null, coalesce(v_q -> 'f', '{}'::jsonb)) limit 1;
      raise exception 'AGR-2: % was ANSWERED to Marisol (%), not refused', v_state, v_msg;
    exception when sqlstate '42501' then
      get stacked diagnostics v_msg = message_text;
      if v_msg not like '%Job cost%' then
        raise exception 'AGR-2: % was refused without the column''s name: %', v_state, v_msg;
      end if;
    end;
  end loop;
  raise notice 'AGR-2 PASS — sum, avg, max, median, unique, filled, a group and a flat filter on Job cost are each refused to Marisol: "%"', v_msg;

  -- ══ A3. the list door refuses narrowing by it too ══
  begin
    perform 1 from custom.read_records_matching(v_org, v_jobs, '{"job_cost": 2600}'::jsonb, false, 50, 0);
    raise exception 'AGR-3: the list door narrowed Marisol''s jobs by Job cost';
  exception when sqlstate '42501' then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%Job cost%' then raise exception 'AGR-3: refused without the name: %', v_msg; end if;
  end;
  raise notice 'AGR-3 PASS — the list door refuses "jobs whose cost is 2,600" to Marisol by name';

  -- ══ A4. what she may read still answers ══
  select (measures ->> 'sum_invoice_total')::numeric, row_count into v_n, v_rows
    from custom.record_aggregate(v_org, v_jobs, '[]'::jsonb, '[{"op": "sum", "key": "invoice_total"}]'::jsonb,
                                 null, '{"status": "Invoiced"}'::jsonb);
  if v_n is distinct from 15770 or v_rows is distinct from 5 then
    raise exception 'AGR-4: Marisol''s own invoiced total answered % over % jobs (want 15,770 over 5)', v_n, v_rows;
  end if;
  raise notice 'AGR-4 PASS — Marisol still reads her five invoiced jobs: $15,770';

  -- ══ A5. a dashboard: the cost block is refused by name, her revenue block still draws ══
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_dash := custom.dashboard_declare(v_org, v_jobs, 'Rincon — revenue and cost', jsonb_build_array(
    jsonb_build_object('title', 'Invoiced', 'kind', 'number', 'measures', '[{"op": "sum", "key": "invoice_total"}]'::jsonb,
                       'filter', '{"status": "Invoiced"}'::jsonb),
    jsonb_build_object('title', 'Job cost', 'kind', 'number', 'measures', '[{"op": "sum", "key": "job_cost"}]'::jsonb)),
    '{}'::jsonb, null);
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_b := custom.dashboard_run(v_org, v_dash) -> 'blocks';
  if v_b -> 0 ? 'refused' then
    raise exception 'AGR-5: the refusal cost Marisol her revenue block: %', v_b -> 0;
  end if;
  if coalesce(v_b -> 1 ->> 'refused', '') not like '%Job cost%' then
    raise exception 'AGR-5: the Job cost block answered Marisol or was refused without its name: %', v_b -> 1;
  end if;
  raise notice 'AGR-5 PASS — her canvas: revenue drawn, the cost block says "%"', v_b -> 1 ->> 'refused';
  raise notice 'FILTERGROUPS AGG-FIELD-READ GREEN — every part passed.';
end $t$;
rollback;
