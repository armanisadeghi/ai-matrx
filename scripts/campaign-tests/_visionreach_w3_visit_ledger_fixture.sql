-- VISION-REACH W3 — the 5,000-visit ledger the formula-read measurements run on (CLONE ONLY).
--
-- Cedar Ridge Physical Therapy's third-quarter visit ledger: one row per patient visit, with the
-- copay, the sessions the insurer authorized, and four columns worked out on read (the copay
-- total the clinic expects, the follow-up due date, a "high copay" flag, and the line the front
-- desk reads). Built through the doors as admin@admin.com, COMMITTED on the dev clone so the
-- measurements can be repeated; archived (custom.table_archive) when the lane is done, and the
-- nightly refresh removes it anyway.
--
--   node runf.mjs clone scripts/campaign-tests/_visionreach_w3_visit_ledger_fixture.sql
--
-- Prints the table id. Refuses anything but the dev clone (the preamble, `expect clone`).

\set ON_ERROR_STOP on
\set suite '_visionreach_w3_visit_ledger_fixture.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '900s';
set local lock_timeout = '60s';

do $f$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_org     constant uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';   -- Cedar Ridge Physical Therapy
  v_home uuid;
  v_t    uuid;
  v_expr jsonb;
  c_first text[] := array['Marisol','Desmond','Priya','Tobias','Leilani','Graham','Anika','Rafael','Odette','Kwame',
                          'Sienna','Bastian','Noor','Everett','Imogen','Jun','Celeste','Mateo','Harriet','Idris'];
  c_last  text[] := array['Okafor','Albright','Raman','Whitcombe','Kahale','Fennimore','Lindqvist','Ocampo','Marchetti',
                          'Asante','Delacroix','Brennan','Haddad','Sorensen','Pryce','Nakamura','Abernathy','Villanueva',
                          'Castellanos','Ferreira'];
  c_reason text[] := array['Post-op ACL rehab','Rotator cuff strengthening','Lumbar stabilization','Plantar fasciitis',
                           'Cervical strain','Total knee follow-up','Ankle sprain return-to-run','Tennis elbow'];
  c_status text[] := array['Completed','Completed','Completed','Scheduled','No-show','Cancelled'];
  c_copay numeric[] := array[20, 25, 30, 35, 40, 50, 60];
  i integer;
begin
  perform set_config('app.actor_system', 'campaign-test/visionreach_w3_fixture', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  select h.home_record_id into v_home from custom.home h where h.organization_id = c_org limit 1;
  perform set_config('role', 'authenticated', true);
  v_t := custom.table_declare(c_org, jsonb_build_object(
    'name','Visit Ledger — Q3 2026','slug','visit_ledger_q3_2026_'||substr(md5(clock_timestamp()::text),1,6),
    'type','entity','label_singular','Visit','label_plural','Visits','title_field','visit','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','visit'))) ||
    case when v_home is null then '{}'::jsonb else jsonb_build_object('parent_id', v_home::text) end);

  perform custom.field_declare(c_org, v_t, jsonb_build_object('label','Patient','key','patient_name','plain','text'));
  perform custom.field_declare(c_org, v_t, jsonb_build_object('label','Visit date','key','visit_date','type','range','config',jsonb_build_object('kind','date'),'parity_type','datetime'));
  perform custom.field_declare(c_org, v_t, jsonb_build_object('label','Status','key','status','plain','text'));
  perform custom.field_declare(c_org, v_t, jsonb_build_object('label','Copay','key','copay','type','range','unit','USD','format','currency','parity_type','currency'));
  perform custom.field_declare(c_org, v_t, jsonb_build_object('label','Sessions authorized','key','sessions_authorized','type','range'));

  v_expr := custom.formula_parse(c_org, v_t, '{Copay} * {Sessions authorized}') -> 'expr';
  perform custom.field_declare(c_org, v_t, jsonb_build_object('label','Expected copay total','key','expected_copay_total',
    'type','formula','source','formula','compute_on','read','parity_type','formula',
    'config', jsonb_build_object('expr', v_expr, 'formula_text','{Copay} * {Sessions authorized}')));
  v_expr := custom.formula_parse(c_org, v_t, 'DATEADD({Visit date}, 14, "days")') -> 'expr';
  perform custom.field_declare(c_org, v_t, jsonb_build_object('label','Follow-up due','key','follow_up_due',
    'type','formula','source','formula','compute_on','read','parity_type','formula',
    'config', jsonb_build_object('expr', v_expr, 'formula_text','DATEADD({Visit date}, 14, "days")')));
  v_expr := custom.formula_parse(c_org, v_t, 'IF({Copay} >= 40, "High copay", "Standard")') -> 'expr';
  perform custom.field_declare(c_org, v_t, jsonb_build_object('label','Copay tier','key','copay_tier',
    'type','formula','source','formula','compute_on','read','parity_type','formula',
    'config', jsonb_build_object('expr', v_expr, 'formula_text','IF({Copay} >= 40, "High copay", "Standard")')));
  v_expr := custom.formula_parse(c_org, v_t, 'CONCATENATE({Patient}, " — ", UPPER({Status}))') -> 'expr';
  perform custom.field_declare(c_org, v_t, jsonb_build_object('label','Front desk line','key','front_desk_line',
    'type','formula','source','formula','compute_on','read','parity_type','formula',
    'config', jsonb_build_object('expr', v_expr, 'formula_text','CONCATENATE({Patient}, " — ", UPPER({Status}))')));

  for i in 1..5000 loop
    perform custom.record_write(c_org, v_t, jsonb_build_object(
      'visit', c_reason[1 + (i % 8)] || ' — visit ' || (1 + (i % 12)),
      'patient_name', c_first[1 + (i % 20)] || ' ' || c_last[1 + ((i / 20) % 20)],
      'visit_date', to_char(date '2026-07-01' + (i % 92), 'YYYY-MM-DD'),
      'status', c_status[1 + (i % 6)],
      'copay', c_copay[1 + (i % 7)],
      'sessions_authorized', 4 + (i % 21))
      || case when v_home is null then '{}'::jsonb else jsonb_build_object('parent_id', v_home::text) end);
  end loop;
  raise notice 'FIXTURE TABLE %', v_t;
end
$f$;

commit;
