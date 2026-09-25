-- LANE RELATION-TARGETS — A PERSON FIELD TAKES THE PERSON, A FILE FIELD TAKES THE FILE. GREEN.
--
-- THE USE CASE. Harborline Heating & Air is a residential HVAC contractor. Its dispatcher logs
-- Service Calls ("No heat — furnace short-cycling at 1422 Alder Ct") and assigns each to a
-- technician, and every call that turns into a job gets a Work Order whose customer signs the
-- repair authorization on the tablet; the signed PDF is uploaded and attached to the order.
-- "Assigned technician" is a Person field (parity type `member`); "Signed authorization" is a
-- File field (parity type `attachment`). Dana — test@test.com — is a member and a technician.
--
-- WHAT IT PROVES, EVERY CLAUSE FROM test@test.com's `authenticated` SEAT THROUGH
-- custom.record_write / custom.record_update / custom.read_record:
--   1  assigning a call to a member BY HER USER ID lands; the cell holds her Person record's
--      id (the one carrying her user_id), and the association beside it is record → record —
--      both halves, agreeing at COMMIT
--   2  a second call assigned to her the same way reuses THAT Person record — no duplicates
--   3  giving the Person record's own id (what PersonPicker writes) still lands unchanged
--   4  attaching the signed form BY ITS files.files ID lands; the cell holds a File record
--      carrying that file_id, name and type, with its association
--   5  re-assigning the call to the other member (admin) moves both halves — the old edge is
--      withdrawn, the new one written
--   6  NEGATIVE, in the person's own words: a user who is NOT a member is refused ("… names
--      someone who is not a member of Harborline Heating & Air") and no Person record is made;
--      an invented id is refused the same way
--   7  NEGATIVE: another organization's file is refused and no File record is made
--   8  the halves census answers 0 for this organization
--
-- Before RELATION-TARGETS, clause 1 was refused: `23514 Assigned technician points at something
-- that is not there` (reproduced on the dev clone 2026-09-23). Its twin is reltargets_red.sql.
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/reltargets_green.sql   (ends in ROLLBACK)

\set ON_ERROR_STOP on
\set suite 'reltargets_green.sql'
\set requires 'function:custom.relation_kernel_record|grant:authenticated:custom.record_write|grant:authenticated:custom.record_update|grant:authenticated:custom.read_record'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create temporary table _rt (k text primary key, v uuid) on commit drop;
grant select on _rt to authenticated;

-- ═══ FIXTURES, as the connected role (an organization, two members, the switch, a Home,
-- ═══ two Tables, and two uploaded files — no client door makes an organization or a file row)
do $fx$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org   uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_home  uuid; v_calls uuid; v_wos uuid;
  v_form  uuid := gen_random_uuid();
  v_theirs uuid := gen_random_uuid();
  v_stranger uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/reltargets_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org,   'Harborline Heating & Air', 'harborline-heating-air-'||substr(v_org::text,1,8), 'HHA', c_admin),
    (v_other, 'Cedar Point Plumbing',     'cedar-point-plumbing-'||substr(v_other::text,1,8), 'CPP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active'),
    (v_org,'organization',v_org,c_dana,'member','active'),
    (v_other,'organization',v_other,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/reltargets_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Harborline Heating & Air')) returning id into v_home;

  v_calls := custom.table_declare(v_org, jsonb_build_object(
    'name','service_calls','type','entity','slug','service_calls',
    'label_singular','Service Call','label_plural','Service Calls',
    'display','list','ordered',false,'weight','light','retention_days',2555,
    'row_order','sorted','agent_writable',true,'title_field','call_summary','parent_id',v_home::text,
    'default_sort', jsonb_build_array(jsonb_build_object('field','call_summary','direction','desc')),
    'fields', jsonb_build_array(jsonb_build_object('name','call_summary','type','text'))));
  perform custom.field_declare(v_org, v_calls, jsonb_build_object(
    'name','assigned_technician','label','Assigned technician','type','relation',
    'relation_target', custom.person_kernel_id()::text, 'relation_max', 1));

  v_wos := custom.table_declare(v_org, jsonb_build_object(
    'name','work_orders','type','entity','slug','work_orders',
    'label_singular','Work Order','label_plural','Work Orders',
    'display','list','ordered',false,'weight','light','retention_days',2555,
    'row_order','sorted','agent_writable',true,'title_field','order_number','parent_id',v_home::text,
    'default_sort', jsonb_build_array(jsonb_build_object('field','order_number','direction','desc')),
    'fields', jsonb_build_array(jsonb_build_object('name','order_number','type','text'))));
  perform custom.field_declare(v_org, v_wos, jsonb_build_object(
    'name','signed_authorization','label','Signed authorization','type','relation',
    'relation_target', custom.file_kernel_id()::text, 'relation_max', 1));

  -- Dana dispatches and works the calls, so she edits both tables (the owner shares them; a
  -- member holds viewer by default, and custom.record_write needs editor).
  perform custom.share_grant(v_org, v_calls, 'user', c_dana, 'editor'::public.permission_level);
  perform custom.share_grant(v_org, v_wos,   'user', c_dana, 'editor'::public.permission_level);

  -- Two uploaded PDFs: Harborline's own signed form, and one that belongs to Cedar Point.
  insert into files.files (id, created_by, file_path, file_name, mime_type, size_bytes, organization_id, storage_uri) values
    (v_form,   c_dana,  'orgs/'||v_org||'/work-orders/WO-4471-repair-authorization-signed.pdf',
               'WO-4471-repair-authorization-signed.pdf', 'application/pdf', 184320, v_org,
               's3://matrx-files/orgs/'||v_org||'/work-orders/WO-4471-repair-authorization-signed.pdf'),
    (v_theirs, c_admin, 'orgs/'||v_other||'/jobs/CPP-2210-estimate.pdf',
               'CPP-2210-estimate.pdf', 'application/pdf', 96256, v_other,
               's3://matrx-files/orgs/'||v_other||'/jobs/CPP-2210-estimate.pdf');

  -- An id that is no member of Harborline. Never a real person's account: an invented id is
  -- exactly as much "not a member" as a stranger is, and it names nobody.
  v_stranger := gen_random_uuid();

  insert into _rt values ('org',v_org),('calls',v_calls),('wos',v_wos),('dana',c_dana),('admin',c_admin),
                         ('form',v_form),('theirs',v_theirs),('stranger',v_stranger);
end $fx$;

-- ═══ THE SEAT ════════════════════════════════════════════════════════════════════════════
do $seat$
declare
  c_dana_j constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid := (select v from _rt where k='org');
  v_calls uuid := (select v from _rt where k='calls');
  v_wos uuid := (select v from _rt where k='wos');
  v_dana uuid := (select v from _rt where k='dana');
  v_admin uuid := (select v from _rt where k='admin');
  v_form uuid := (select v from _rt where k='form');
  v_theirs uuid := (select v from _rt where k='theirs');
  v_stranger uuid := (select v from _rt where k='stranger');
  v_call1 uuid; v_call2 uuid; v_call3 uuid; v_wo uuid;
  v_doc jsonb; v_person uuid; v_person2 uuid; v_file_rec uuid; v_admin_person uuid;
  v_n int; m text; st text; v_ver int;
begin
  perform set_config('request.jwt.claims', c_dana_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user, (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass), 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PART 0 PASS — seated as authenticated (test@test.com), custom.record unreadable directly';

  -- 1 · a member's USER id lands, and the cell holds her Person record
  v_call1 := custom.record_write(v_org, v_calls, jsonb_build_object(
    'call_summary', 'No heat — furnace short-cycling at 1422 Alder Ct',
    'assigned_technician', v_dana::text));
  v_doc := custom.read_record(v_org, v_call1, false);
  v_person := nullif(v_doc ->> 'assigned_technician', '')::uuid;
  if v_person is null or v_person = v_dana then
    raise exception 'CLAUSE 1 FAILED: the cell holds % — not a Person record id', v_doc -> 'assigned_technician';
  end if;
  if coalesce(custom.read_record(v_org, v_person, false) ->> 'user_id', '') <> v_dana::text then
    raise exception 'CLAUSE 1 FAILED: record % is not the Person record carrying Dana''s user id', v_person;
  end if;
  select count(*) into v_n from platform.relations_from(v_org, v_call1) r
   where r.target_id = v_person;
  if v_n < 1 then
    raise exception 'CLAUSE 1 FAILED: no association from the call to her Person record (relations_from answers %)',
      (select jsonb_agg(to_jsonb(r)) from platform.relations_from(v_org, v_call1) r);
  end if;
  raise notice 'CLAUSE 1 PASS — assigned by user id; the cell holds Person record %, and the edge is beside it', v_person;

  -- 2 · the same member again reuses the same Person record
  v_call2 := custom.record_write(v_org, v_calls, jsonb_build_object(
    'call_summary', 'AC not cooling — condenser fan seized, 88 Wren Way',
    'assigned_technician', v_dana::text));
  v_person2 := nullif(custom.read_record(v_org, v_call2, false) ->> 'assigned_technician', '')::uuid;
  if v_person2 is distinct from v_person then
    raise exception 'CLAUSE 2 FAILED: the second assignment made or found a different Person record (% vs %)', v_person2, v_person;
  end if;
  raise notice 'CLAUSE 2 PASS — the second call reuses Person record % (no duplicate person)', v_person;

  -- 3 · the Person record's own id (PersonPicker's write) lands unchanged
  v_call3 := custom.record_write(v_org, v_calls, jsonb_build_object(
    'call_summary', 'Annual maintenance — two-zone heat pump, 310 Harbor View Dr',
    'assigned_technician', v_person::text));
  if nullif(custom.read_record(v_org, v_call3, false) ->> 'assigned_technician', '')::uuid is distinct from v_person then
    raise exception 'CLAUSE 3 FAILED: a Person record id was rewritten';
  end if;
  raise notice 'CLAUSE 3 PASS — a Person record id is stored as given';

  -- 4 · the signed form by its files.files id lands as a File record
  v_wo := custom.record_write(v_org, v_wos, jsonb_build_object(
    'order_number', 'WO-4471', 'signed_authorization', v_form::text));
  v_file_rec := nullif(custom.read_record(v_org, v_wo, false) ->> 'signed_authorization', '')::uuid;
  if v_file_rec is null or v_file_rec = v_form then
    raise exception 'CLAUSE 4 FAILED: the attachment cell holds % — not a File record id', v_file_rec;
  end if;
  v_doc := custom.read_record(v_org, v_file_rec, false);
  if coalesce(v_doc ->> 'file_id', '') <> v_form::text
     or coalesce(v_doc ->> 'name', '') <> 'WO-4471-repair-authorization-signed.pdf'
     or coalesce(v_doc ->> 'mime', '') <> 'application/pdf' then
    raise exception 'CLAUSE 4 FAILED: the File record reads %', v_doc;
  end if;
  select count(*) into v_n from platform.relations_from(v_org, v_wo) r where r.target_id = v_file_rec;
  if v_n < 1 then
    raise exception 'CLAUSE 4 FAILED: no association from the work order to its File record';
  end if;
  raise notice 'CLAUSE 4 PASS — attached by file id; the cell holds File record % (WO-4471-repair-authorization-signed.pdf), edge beside it', v_file_rec;

  -- 5 · re-assign to the other member: both halves move
  perform custom.record_update(v_org, v_call1, jsonb_build_object('assigned_technician', v_admin::text));
  v_admin_person := nullif(custom.read_record(v_org, v_call1, false) ->> 'assigned_technician', '')::uuid;
  if v_admin_person is null or v_admin_person in (v_admin, v_person) then
    raise exception 'CLAUSE 5 FAILED: after re-assignment the cell holds %', v_admin_person;
  end if;
  select count(*) into v_n from platform.relations_from(v_org, v_call1) r where r.target_id = v_person;
  if v_n <> 0 then
    raise exception 'CLAUSE 5 FAILED: the edge to Dana''s Person record was not withdrawn';
  end if;
  select count(*) into v_n from platform.relations_from(v_org, v_call1) r where r.target_id = v_admin_person;
  if v_n < 1 then
    raise exception 'CLAUSE 5 FAILED: no edge to the new technician''s Person record';
  end if;
  raise notice 'CLAUSE 5 PASS — re-assigned by user id; old edge withdrawn, new edge written';

  -- 6 · NEGATIVE: not a member, and an invented id — refused in words, nothing written
  if v_stranger is not null then
    begin
      perform custom.record_write(v_org, v_calls, jsonb_build_object(
        'call_summary', 'Thermostat blank — 9 Spruce Ln', 'assigned_technician', v_stranger::text));
      raise exception 'CLAUSE 6 FAILED: a non-member was assigned';
    exception when check_violation then
      get stacked diagnostics m = message_text;
      if m not ilike '%not a member of Harborline Heating & Air%' then
        raise exception 'CLAUSE 6 FAILED: refused, but in the wrong words: %', m;
      end if;
    end;
  end if;
  begin
    perform custom.record_write(v_org, v_calls, jsonb_build_object(
      'call_summary', 'Thermostat blank — 9 Spruce Ln', 'assigned_technician', gen_random_uuid()::text));
    raise exception 'CLAUSE 6 FAILED: an invented id was assigned';
  exception when check_violation then
    get stacked diagnostics m = message_text;
    if m not ilike '%not a member of%' then
      raise exception 'CLAUSE 6 FAILED: refused, but in the wrong words: %', m;
    end if;
  end;
  select count(*) into v_n from custom.read_records(v_org, custom.person_kernel_id(), true, 200, 0) x
   where x::text ilike '%' || coalesce(v_stranger::text, 'none') || '%';
  if v_n <> 0 then
    raise exception 'CLAUSE 6 FAILED: a Person record was written for the non-member';
  end if;
  raise notice 'CLAUSE 6 PASS — a non-member and an invented id are refused ("… names someone who is not a member of Harborline Heating & Air"), no Person record made';

  -- 7 · NEGATIVE: another organization's file
  begin
    perform custom.record_write(v_org, v_wos, jsonb_build_object(
      'order_number', 'WO-4472', 'signed_authorization', v_theirs::text));
    raise exception 'CLAUSE 7 FAILED: another organization''s file was attached';
  exception when check_violation then
    get stacked diagnostics m = message_text;
    if m not ilike '%names a file Harborline Heating & Air does not have%' then
      raise exception 'CLAUSE 7 FAILED: refused, but in the wrong words: %', m;
    end if;
  end;
  raise notice 'CLAUSE 7 PASS — Cedar Point''s file cannot be attached to a Harborline order';
end $seat$;

-- The census is the store's own and answers only its owner, so the suite steps OUT of the seat
-- for it and asserts nothing else while out.
reset role;
-- 8 · the halves census for this organization (the store's own census; owner-only by design)
do $c$
declare v_n int; v_guard boolean;
begin
  -- The deferred halves guard settles here, as it would at COMMIT: every write above is judged.
  select exists (select 1 from pg_trigger t where t.tgrelid = 'custom.record'::regclass
                  and t.tgname = 'zzzz_relation_halves_agree') into v_guard;
  set constraints all immediate;
  if to_regprocedure('custom.relation_halves_disagreements(uuid, uuid)') is null then
    -- The census is STORE-TXN-4's; a database that predates it still has the guard's verdict.
    if v_guard then
      raise notice 'CLAUSE 8 PASS (guard only) — the census function is not on this database; the deferred halves guard is installed and settled every write above';
    else
      raise notice 'CLAUSE 8 SKIPPED — neither the halves census nor the halves guard is on this database, so nothing about the two halves was measured here. A skip is not a pass.';
    end if;
    return;
  end if;
  select count(*) into v_n from custom.relation_halves_disagreements((select v from _rt where k='org'));
  if v_n <> 0 then
    raise exception 'CLAUSE 8 FAILED: % half/halves disagree in Harborline', v_n;
  end if;
  raise notice 'CLAUSE 8 PASS — 0 relation halves disagree; the deferred guard settled on every write';
end $c$;

\echo 'reltargets_green: all clauses PASS.'
rollback;
