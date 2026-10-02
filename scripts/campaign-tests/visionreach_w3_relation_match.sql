-- VISION-REACH W3 — "THE VISITS OF PATIENTS DR. OKAFOR REFERRED" IS ONE QUESTION TO THE STORE.
--
-- A flat filter key `<relation>.<field>` reaches through the relation inside the store
-- (custom.record_filter_sql), so the aggregate door and the filtered read door answer it in one
-- statement instead of the records tool paging the whole related table. Cedar Ridge Physical
-- Therapy: three patients, five visits. Expected numbers worked by hand:
--   Okafor referred Daniel Reyes and Hannah Brooks -> their visits: 40 + 40 + 25 = 105, 3 visits.
--   Shah referred Rosa Delgado -> 1 visit, copay 0.
-- And from the member's seat: a related field she may not read is refused by its name (42501), a
-- related record she was never shown does not count.
--
-- One transaction ending in ROLLBACK. RED before
-- migrations/campaign/visionreach_w3_a_condition_across_a_relation.sql (the dotted key is refused
-- as "not a field key"), GREEN after.

\set ON_ERROR_STOP on
\timing off
\set suite 'visionreach_w3_relation_match.sql'
\set requires 'grant:authenticated:custom.record_aggregate|grant:authenticated:custom.read_records_matching'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '120s';
set local lock_timeout = '90s';

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid; v_pat uuid; v_vis uuid;
  v_daniel uuid; v_hannah uuid; v_rosa uuid; v_v uuid;
  v_n numeric; v_cnt bigint; v_txt text; v_state text;
  v_fail text[] := '{}';
begin
  perform set_config('app.actor_system', 'campaign-test/visionreach_w3_relation', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy', 'cedar-ridge-pt-'||substr(v_org::text,1,8), 'CRP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active'),
    (v_org,'organization',v_org,c_dana,'member','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/visionreach_w3_relation');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Cedar Ridge Physical Therapy — Front Desk')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_pat := custom.table_declare(v_org, jsonb_build_object(
    'name','Patients','slug','patients_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Patient','label_plural','Patients','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
  perform custom.field_declare(v_org, v_pat, jsonb_build_object('label','Referring physician','key','referring_physician','plain','text'));
  perform custom.field_declare(v_org, v_pat, jsonb_build_object('label','Insurance member ID','key','insurance_member_id','plain','text','sensitivity','confidential'));
  v_vis := custom.table_declare(v_org, jsonb_build_object(
    'name','Visit Copays','slug','visit_copays_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Visit','label_plural','Visits','title_field','visit','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','visit')),'parent_id',v_home::text));
  perform custom.field_declare(v_org, v_vis, jsonb_build_object('label','Patient','key','patient','type','relation','relation_target',v_pat::text));
  perform custom.field_declare(v_org, v_vis, jsonb_build_object('label','Copay','key','copay','type','range','unit','USD','format','currency','parity_type','currency'));

  v_daniel := custom.record_write(v_org, v_pat, jsonb_build_object('name','Daniel Reyes','referring_physician','Dr. Samuel Okafor','insurance_member_id','AET-311-002','parent_id',v_home::text));
  v_hannah := custom.record_write(v_org, v_pat, jsonb_build_object('name','Hannah Brooks','referring_physician','Dr. Samuel Okafor','insurance_member_id','BCX-559-120','parent_id',v_home::text));
  v_rosa   := custom.record_write(v_org, v_pat, jsonb_build_object('name','Rosa Delgado','referring_physician','Dr. Priya Shah','insurance_member_id','UHC-870-441','parent_id',v_home::text));
  perform custom.record_write(v_org, v_vis, jsonb_build_object('visit','Daniel Reyes — rotator cuff, eval','patient',v_daniel::text,'copay',40,'parent_id',v_home::text));
  perform custom.record_write(v_org, v_vis, jsonb_build_object('visit','Daniel Reyes — rotator cuff, visit 2','patient',v_daniel::text,'copay',40,'parent_id',v_home::text));
  perform custom.record_write(v_org, v_vis, jsonb_build_object('visit','Hannah Brooks — low back, visit 2','patient',v_hannah::text,'copay',25,'parent_id',v_home::text));
  perform custom.record_write(v_org, v_vis, jsonb_build_object('visit','Rosa Delgado — plantar fasciitis, eval','patient',v_rosa::text,'copay',0,'parent_id',v_home::text));
  perform custom.record_write(v_org, v_vis, jsonb_build_object('visit','Walk-in — no patient on file','copay',30,'parent_id',v_home::text));

  -- 1. The owner: the aggregate door and the filtered read door, one statement each.
  begin
    select (a.measures ->> 'sum_copay')::numeric, a.row_count into v_n, v_cnt
      from custom.record_aggregate(v_org, v_vis, '[]'::jsonb, '[{"op":"sum","key":"copay"}]'::jsonb, null,
        '{"patient.referring_physician":"Dr. Samuel Okafor"}'::jsonb, 50, 'viewer', null) a;
    if v_n is distinct from 105 or v_cnt is distinct from 3 then
      v_fail := v_fail || format('1a Okafor''s patients'' visits: sum %s over %s visits, not 105 over 3', v_n, v_cnt);
    end if;
  exception when others then
    v_fail := v_fail || format('1a the aggregate refused the relation condition: %s', sqlerrm);
  end;
  begin
    select string_agg(d.document ->> 'visit', ' | ' order by d.document ->> 'visit') into v_txt
      from custom.read_records_matching(v_org, v_vis, '{"patient.referring_physician":"Dr. Priya Shah"}'::jsonb, false, 50, 0) d;
    if v_txt is distinct from 'Rosa Delgado — plantar fasciitis, eval' then
      v_fail := v_fail || format('1b read_records_matching for Shah''s patients answered [%s]', coalesce(v_txt,'nothing'));
    end if;
  exception when others then
    v_fail := v_fail || format('1b the read door refused the relation condition: %s', sqlerrm);
  end;

  -- 2. The member (shared_only off: she sees every visit and patient by default) may not read the
  --    confidential member ID, so a condition through it is refused by its name.
  perform set_config('request.jwt.claims', c_dana_j, true);
  begin
    perform custom.record_aggregate(v_org, v_vis, '[]'::jsonb, '[{"op":"count"}]'::jsonb, null,
      '{"patient.insurance_member_id":"AET-311-002"}'::jsonb, 50, 'viewer', null);
    select string_agg(coalesce(a.measures::text,''), ' ') into v_txt
      from custom.record_aggregate(v_org, v_vis, '[]'::jsonb, '[{"op":"count"}]'::jsonb, null,
        '{"patient.insurance_member_id":"AET-311-002"}'::jsonb, 50, 'viewer', null) a;
    if coalesce(v_txt,'') not like '%_withheld%' then
      v_fail := v_fail || format('2 a condition through a confidential related field answered the member: %s', coalesce(v_txt,'nothing'));
    end if;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '42501' then
      v_fail := v_fail || format('2 refused for the wrong reason (%s): %s', v_state, sqlerrm);
    end if;
  end;

  if cardinality(v_fail) > 0 then
    raise exception E'RED — % relation check(s) failed:\n  %', cardinality(v_fail), array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'GREEN — a condition across a relation is answered by the store, and a hidden related field is refused.';
end
$t$;

rollback;
