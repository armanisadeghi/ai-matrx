-- VISION-REACH W5 — the 5,000-visit "formula speed" ledger the W5 measurements run on (CLONE ONLY).
--
-- Cedar Ridge Physical Therapy's third-quarter visits, one row per visit, with every common
-- formula shape worked out on read: arithmetic (Expected copay total), DATEADD (Follow-up due),
-- IF (Copay tier), & and UPPER (Visit label), DATEDIFF (Days in care), MONTH (Visit month),
-- AND with comparisons (Needs a call) and a Rule-node join (Front desk line, {"op": "concat"},
-- the shape most formulas written before the formula language still have).
-- Built through the doors as admin@admin.com and COMMITTED on the dev clone so the measurements
-- (visionreach_w5_formula_speed.sql) can be repeated; the nightly refresh removes it. Prints the
-- table id.

\set ON_ERROR_STOP on
\set suite '_visionreach_w5_formula_speed_fixture.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '1800s';
set local lock_timeout = '120s';

do $t$
declare
  c_org     constant uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';   -- Cedar Ridge Physical Therapy
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_first text[] := array['Marisol','Desmond','Priya','Tobias','Leilani','Graham','Anika','Rafael','Odette','Kwame','Sienna','Bastian','Noor','Everett','Imogen'];
  c_last  text[] := array['Okafor','Albright','Raman','Whitcombe','Kahale','Fennimore','Lindqvist','Ocampo','Marchetti','Asante','Delacroix','Brennan'];
  c_status text[] := array['Completed','Completed','Completed','Scheduled','No-show','Cancelled'];
  v_home uuid; v_t uuid; b int; v_therapist text; v_st text;
begin
  perform set_config('app.actor_system', 'campaign-test/visionreach_w5_speed_fixture', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'authenticated', true);
  v_home := custom.record_write(c_org, custom.person_kernel_id(), jsonb_build_object('name', 'Q3 Visit Ledger Review (formula speed)'));
  v_t := custom.table_declare(c_org, jsonb_build_object('name', 'Q3 Visit Ledger (formula speed)',
     'slug', 'vr5_speed_ledger_' || substr(gen_random_uuid()::text, 1, 8), 'type', 'entity',
     'label_singular', 'Visit', 'label_plural', 'Visits', 'title_field', 'name', 'display', 'list', 'weight', 'light',
     'ordered', false, 'row_order', 'manual', 'default_sort', '[]'::jsonb, 'agent_writable', true, 'retention_days', 365,
     'fields', jsonb_build_array(jsonb_build_object('name', 'name')), 'parent_id', v_home::text));
  perform custom.field_declare(c_org, v_t, '{"key":"visit_date","label":"Visit date","type":"datetime","config":{"kind":"date"}}');
  perform custom.field_declare(c_org, v_t, '{"key":"discharge_date","label":"Discharge date","type":"datetime","config":{"kind":"date"}}');
  perform custom.field_declare(c_org, v_t, '{"key":"status","label":"Status","type":"text"}');
  perform custom.field_declare(c_org, v_t, '{"key":"therapist","label":"Therapist","type":"text"}');
  perform custom.field_declare(c_org, v_t, '{"key":"copay","label":"Copay","type":"currency","unit":"USD"}');
  perform custom.field_declare(c_org, v_t, '{"key":"sessions","label":"Sessions authorized","type":"number"}');
  perform custom.field_declare(c_org, v_t, '{"key":"expected_total","label":"Expected copay total","type":"formula","formula_text":"{Copay} * {Sessions authorized}"}');
  perform custom.field_declare(c_org, v_t, '{"key":"follow_up_due","label":"Follow-up due","type":"formula","formula_text":"DATEADD({Visit date}, 14, \"days\")"}');
  perform custom.field_declare(c_org, v_t, '{"key":"copay_tier","label":"Copay tier","type":"formula","formula_text":"IF({Copay} >= 40, \"High copay\", \"Standard\")"}');
  perform custom.field_declare(c_org, v_t, '{"key":"visit_label","label":"Visit label","type":"formula","formula_text":"{Therapist} & \" — \" & UPPER({Status})"}');
  perform custom.field_declare(c_org, v_t, '{"key":"days_in_care","label":"Days in care","type":"formula","formula_text":"DATEDIFF({Visit date}, {Discharge date}, \"days\")"}');
  perform custom.field_declare(c_org, v_t, '{"key":"visit_month","label":"Visit month","type":"formula","formula_text":"MONTH({Visit date})"}');
  perform custom.field_declare(c_org, v_t, '{"key":"needs_call","label":"Needs a call","type":"formula","formula_text":"AND({Status} = \"No-show\", {Copay} > 25)"}');
  -- a Rule node, as older formulas are stored: the two columns joined by " — ", skipping an empty one
  perform set_config('role', 'postgres', true);
  select f.id::text into v_therapist from custom.record f
   where f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_t and f.data ->> 'key' = 'therapist';
  select f.id::text into v_st from custom.record f
   where f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = v_t and f.data ->> 'key' = 'status';
  perform set_config('role', 'authenticated', true);
  perform custom.field_declare(c_org, v_t, jsonb_build_object('key', 'front_desk_line', 'label', 'Front desk line',
    'type', 'formula', 'config', jsonb_build_object('expr', jsonb_build_object('op', 'concat', 'separator', ' — ',
      'args', jsonb_build_array(jsonb_build_object('field', v_therapist), jsonb_build_object('field', v_st))))));
  for b in 0..9 loop
    perform custom.record_write_many(c_org, v_t, array(select jsonb_build_object(
      'name', c_first[1 + g % 15] || ' ' || c_last[1 + (g * 7) % 12] || ' — visit ' || (1 + g % 9),
      'visit_date', (date '2026-07-01' + (g % 92))::text,
      'discharge_date', case when g % 5 = 0 then null else (date '2026-07-01' + (g % 92) + 7 + g % 40)::text end,
      'status', c_status[1 + g % 6],
      'therapist', (array['Dr. Hollis Vance','Dr. Amara Quist','Jonah Pell, DPT','Rosa Ibarra, PTA'])[1 + g % 4],
      'copay', (array[20,25,30,35,40,45,50])[1 + g % 7], 'sessions', 4 + g % 13)
      from generate_series(b * 500 + 1, b * 500 + 500) g), null);
  end loop;
  raise notice 'FIXTURE TABLE %', v_t;
end
$t$;

commit;
