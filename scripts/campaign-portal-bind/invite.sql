-- PORTAL-BIND — the office's half of the headless walk, run at the OFFICE'S OWN SEAT.
--
-- It builds the Carpinteria branch of Rincon Plumbing Co (the business runs one per town),
-- its real Customers / Jobs / Invoices / Crews, the portal that exposes Jobs and Invoices,
-- and then INVITES the duplex owner through `custom.portal_invite` — the same door the
-- Portals panel calls, at the same seat (`authenticated`, admin@admin.com's own JWT), with
-- the same arguments.
--
-- It prints the accept path the office copies. That is the whole "copy link" step: the door
-- hands it back, and a plumber texts it to a customer.
--
-- Everything it writes is real for that business and tagged as a test organization by the
-- campaign's own cleanup; nothing here is named "test" or "foo".

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
-- FIXTURE-ORGS 2026-09-23: this walk used to mint a NEW Carpinteria branch on every run
-- ('rincon-plumbing-carpinteria-<random>'), which is how the look-alike rows piled up. It now
-- takes ONE branch by slug through the shared helper and builds its tables and portal only the
-- first time; every later run reuses them and issues a fresh invitation - the part being walked.
begin;
\set fixture_slug 'rincon-plumbing-co-carpinteria-portal-walk'
\set fixture_name 'Rincon Plumbing Co — Carpinteria Branch'
\set fixture_abbr 'RPC'
\i scripts/campaign-tests/_fixture_org.sql

do $walk$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_mail    constant text := 'test@test.com';
  v_org     uuid := current_setting('matrx.fixture_org')::uuid;
  v_home    uuid; v_cust uuid; v_jobs uuid; v_invs uuid; v_crews uuid;
  v_her     uuid; v_him uuid; v_portal uuid; v_out jsonb;
begin
  perform set_config('app.actor_system', 'campaign.portalbind.walk', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  select id into v_jobs from custom."table" where organization_id = v_org and slug = 'jobs';
  if v_jobs is not null then
    -- Built on an earlier run: reuse the tables, the customer and the portal it made.
    select id into v_cust  from custom."table" where organization_id = v_org and slug = 'customers';
    select id into v_invs  from custom."table" where organization_id = v_org and slug = 'invoices';
    select id into v_crews from custom."table" where organization_id = v_org and slug = 'crews';
    select id into v_her from custom.record
     where organization_id = v_org and table_id = v_cust and deleted_at is null
       and data ->> 'customer_name' = 'Marisol Vega'
     order by created_at limit 1;
    select id into v_portal from custom.portal
     where organization_id = v_org and archived_at is null order by created_at limit 1;
    if v_cust is null or v_invs is null or v_her is null or v_portal is null then
      raise exception 'WALK REFUSED: the Carpinteria branch % was half-built on an earlier run (customers %, invoices %, Marisol %, portal %). Archive it through iam.organization_archive and run again.',
        v_org, v_cust, v_invs, v_her, v_portal;
    end if;
    perform set_config('role', 'authenticated', true);
    raise notice 'REUSED the Carpinteria branch built on an earlier run';
  else
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom','system_enabled','organization', v_org, v_org, 'true'::jsonb, 'PORTAL-BIND walk'),
         ('custom','external_principal_enabled','organization', v_org, v_org, 'true'::jsonb, 'PORTAL-BIND walk');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Carpinteria Branch')) returning id into v_home;

  perform set_config('role', 'authenticated', true);

  v_cust := custom.table_declare(v_org, jsonb_build_object(
    'name','Customers','slug','customers','type','entity','display','list',
    'label_singular','Customer','label_plural','Customers','ordered',false,'weight','light',
    'retention_days',3650,'row_order','sorted','agent_writable',true,
    'parent_id', v_home::text,'title_field','customer_name','default_sort','[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','customer_name'))));
  v_jobs := custom.table_declare(v_org, jsonb_build_object(
    'name','Jobs','slug','jobs','type','entity','display','list',
    'label_singular','Job','label_plural','Jobs','ordered',false,'weight','light',
    'retention_days',365,'row_order','sorted','agent_writable',true,
    'parent_id', v_home::text,'title_field','work_order','default_sort','[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','work_order'))));
  v_invs := custom.table_declare(v_org, jsonb_build_object(
    'name','Invoices','slug','invoices','type','entity','display','list',
    'label_singular','Invoice','label_plural','Invoices','ordered',false,'weight','light',
    'retention_days',3650,'row_order','sorted','agent_writable',true,
    'parent_id', v_home::text,'title_field','invoice_no','default_sort','[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','invoice_no'))));
  v_crews := custom.table_declare(v_org, jsonb_build_object(
    'name','Crews','slug','crews','type','entity','display','list',
    'label_singular','Crew','label_plural','Crews','ordered',false,'weight','light',
    'retention_days',3650,'row_order','sorted','agent_writable',true,
    'parent_id', v_home::text,'title_field','crew_name','default_sort','[]'::jsonb,
    'fields', jsonb_build_array(jsonb_build_object('name','crew_name'))));

  perform custom.field_declare(v_org, v_cust, jsonb_build_object('key','customer_name','label','Customer name','plain','text','sort',10));
  perform custom.field_declare(v_org, v_cust, jsonb_build_object('key','service_address','label','Service address','plain','text','sort',20));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key','work_order','label','Work order','plain','text','sort',10));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key','problem','label','Problem','plain','text','sort',20));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key','stage','label','Stage','plain','text','sort',30));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object('key','scheduled_for','label','Scheduled for','plain','text','sort',40));
  perform custom.field_declare(v_org, v_jobs, jsonb_build_object(
    'label','Customer','type','relation','relation_target', v_cust::text,
    'on_target_delete','set_null','multi',false,'sort',5));
  perform custom.field_declare(v_org, v_invs, jsonb_build_object('key','invoice_no','label','Invoice no','plain','text','sort',10));
  perform custom.field_declare(v_org, v_invs, jsonb_build_object('key','amount_due','label','Amount due','plain','text','sort',20));
  perform custom.field_declare(v_org, v_invs, jsonb_build_object('key','status','label','Status','plain','text','sort',30));
  perform custom.field_declare(v_org, v_invs, jsonb_build_object(
    'label','Customer','type','relation','relation_target', v_cust::text,
    'on_target_delete','set_null','multi',false,'sort',5));
  perform custom.field_declare(v_org, v_crews, jsonb_build_object('key','crew_name','label','Crew','plain','text','sort',10));

  v_her := custom.record_write(v_org, v_cust, jsonb_build_object(
    'customer_name','Marisol Vega','service_address','1043 Casitas Pass Rd, Carpinteria'));
  v_him := custom.record_write(v_org, v_cust, jsonb_build_object(
    'customer_name','Ellery Tran','service_address','688 Linden Ave, Carpinteria'));

  perform custom.record_write(v_org, v_jobs, jsonb_build_object(
    'work_order','RPC-2214','problem','Re-pipe upstairs unit — galvanised supply lines, two bathrooms',
    'stage','In progress','scheduled_for','2026-09-23','customer', v_her::text));
  perform custom.record_write(v_org, v_jobs, jsonb_build_object(
    'work_order','RPC-2215','problem','Re-pipe downstairs unit — kitchen and laundry stack',
    'stage','Parts ordered','scheduled_for','2026-09-29','customer', v_her::text));
  perform custom.record_write(v_org, v_jobs, jsonb_build_object(
    'work_order','RPC-2219','problem','Tankless water heater descale — annual service',
    'stage','Scheduled','scheduled_for','2026-10-02','customer', v_him::text));
  perform custom.record_write(v_org, v_invs, jsonb_build_object(
    'invoice_no','INV-2214-A','amount_due','4,180.00','status','Paid','customer', v_her::text));
  perform custom.record_write(v_org, v_invs, jsonb_build_object(
    'invoice_no','INV-2215-A','amount_due','2,940.00','status','Due 30 Sep','customer', v_her::text));
  perform custom.record_write(v_org, v_invs, jsonb_build_object(
    'invoice_no','INV-2219-A','amount_due','285.00','status','Due 9 Oct','customer', v_him::text));
  perform custom.record_write(v_org, v_crews, jsonb_build_object('crew_name','Gil Ortega / apprentice'));

  v_portal := custom.portal_declare(v_org, 'Your jobs and invoices', v_cust, jsonb_build_array(
    jsonb_build_object('table_id', v_jobs::text, 'names_via','customer',
      'visible_fields', jsonb_build_array('work_order','problem','stage','scheduled_for'),
      'editable_fields','[]'::jsonb,'comments',false),
    jsonb_build_object('table_id', v_invs::text, 'names_via','customer',
      'visible_fields', jsonb_build_array('invoice_no','amount_due','status'),
      'editable_fields','[]'::jsonb,'comments',false)));
  end if;

  v_out := custom.portal_invite(v_org, v_portal, v_her, c_mail);

  raise notice 'ORG=%', v_org;
  raise notice 'PORTAL=%', v_portal;
  raise notice 'PRINCIPAL=%', v_out ->> 'principal_id';
  raise notice 'JOBS=%', v_jobs;
  raise notice 'INVOICES=%', v_invs;
  raise notice 'CREWS=%', v_crews;
  raise notice 'TOKEN=%', v_out ->> 'token';
  raise notice 'ACCEPT_PATH=%', v_out ->> 'accept_path';
  raise notice 'SAY=%', v_out ->> 'say';
  raise notice 'DELIVERY=%', v_out ->> 'delivery_say';
end $walk$;
commit;
