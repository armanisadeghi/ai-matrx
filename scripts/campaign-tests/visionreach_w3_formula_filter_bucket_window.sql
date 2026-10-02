-- VISION-REACH W3 — A FILTER, A DATE PERIOD AND A WINDOW ON A FORMULA COLUMN READ THE FORMULA.
--
-- THE BREAK THIS CATCHES (measured on the clone 2026-10-02, before the fix): wave 2 taught
-- custom.record_aggregate to MEASURE and GROUP BY a formula column, but a flat filter
-- (`{"copay_tier": "High copay"}`), a date period (`bucket`) and a window on a formula column
-- still read the stored `r.data`, where a formula has no value — the filter matched nothing, every
-- visit fell into one empty period, and the window counted zero, each under a success.
--
-- Cedar Ridge Physical Therapy, six visits; two formula columns worked out on read:
--   copay_tier     = IF({Copay} >= 40, "High copay", "Standard")
--   follow_up_due  = DATEADD({Visit date}, 14, "days")
-- Every expected number is worked by hand from the six rows below (never by the code under test).
--
-- One transaction ending in ROLLBACK; runs as the table's owner from the seat (`role authenticated`).
-- RED before migrations/campaign/visionreach_w3_formula_columns_filter_bucket_window.sql, GREEN after.

\set ON_ERROR_STOP on
\timing off
\set suite 'visionreach_w3_formula_filter_bucket_window.sql'
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
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org  uuid := gen_random_uuid();
  v_home uuid;
  v_t    uuid;
  v_txt  text;
  v_n    numeric;
  v_got  jsonb;
  v_fail text[] := '{}';
begin
  perform set_config('app.actor_system', 'campaign-test/visionreach_w3_formula', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy', 'cedar-ridge-pt-'||substr(v_org::text,1,8), 'CRP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/visionreach_w3_formula');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Cedar Ridge Physical Therapy — Front Desk')) returning id into v_home;

  perform set_config('role', 'authenticated', true);
  v_t := custom.table_declare(v_org, jsonb_build_object(
    'name','Visit Ledger','slug','visit_ledger_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Visit','label_plural','Visits','title_field','visit','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','visit')),'parent_id',v_home::text));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('label','Visit date','key','visit_date','type','range','config',jsonb_build_object('kind','date'),'parity_type','datetime'));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('label','Copay','key','copay','type','range','unit','USD','format','currency','parity_type','currency'));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('label','Copay tier','key','copay_tier',
    'type','formula','source','formula','compute_on','read','parity_type','formula',
    'config', jsonb_build_object('expr', custom.formula_parse(v_org, v_t, 'IF({Copay} >= 40, "High copay", "Standard")') -> 'expr')));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('label','Follow-up due','key','follow_up_due',
    'type','formula','source','formula','compute_on','read','parity_type','formula',
    'config', jsonb_build_object('expr', custom.formula_parse(v_org, v_t, 'DATEADD({Visit date}, 14, "days")') -> 'expr')));

  -- visit                                         date        copay  -> tier        follow-up due
  perform custom.record_write(v_org, v_t, jsonb_build_object('visit','Marisol Okafor — ACL rehab, visit 4','visit_date','2026-09-01','copay',35,'parent_id',v_home::text)); -- Standard   2026-09-15
  perform custom.record_write(v_org, v_t, jsonb_build_object('visit','Desmond Albright — rotator cuff, eval','visit_date','2026-09-03','copay',50,'parent_id',v_home::text)); -- High copay 2026-09-17
  perform custom.record_write(v_org, v_t, jsonb_build_object('visit','Priya Raman — lumbar, visit 2','visit_date','2026-09-10','copay',40,'parent_id',v_home::text)); -- High copay 2026-09-24
  perform custom.record_write(v_org, v_t, jsonb_build_object('visit','Tobias Whitcombe — ankle, visit 3','visit_date','2026-09-20','copay',25,'parent_id',v_home::text)); -- Standard   2026-10-04
  perform custom.record_write(v_org, v_t, jsonb_build_object('visit','Leilani Kahale — plantar fasciitis, eval','visit_date','2026-09-22','copay',60,'parent_id',v_home::text)); -- High copay 2026-10-06
  perform custom.record_write(v_org, v_t, jsonb_build_object('visit','Graham Fennimore — knee, visit 5','visit_date','2026-09-28','copay',30,'parent_id',v_home::text)); -- Standard   2026-10-12

  -- 0. CONTROL: the read door works the formula out (otherwise this suite proves nothing).
  select string_agg(d.document ->> 'copay_tier', ',' order by d.document ->> 'visit') into v_txt
    from custom.read_records(v_org, v_t, false, 50, 0) d;
  if v_txt is distinct from 'High copay,Standard,High copay,Standard,High copay,Standard' then
    raise exception 'CONTROL: the read door does not work the formula out (%); the suite proves nothing', v_txt;
  end if;

  -- 1. A FLAT FILTER on a formula column — the aggregate count, and the rows the read door hands back.
  select a.row_count into v_n from custom.record_aggregate(v_org, v_t, '[]'::jsonb, '[{"op":"count"}]'::jsonb,
    null, '{"copay_tier":"High copay"}'::jsonb, 50, 'viewer', null) a;
  if v_n is distinct from 3 then
    v_fail := v_fail || format('1a record_aggregate filter {copay_tier: High copay} counted %s, not 3', coalesce(v_n::text,'nothing'));
  end if;
  select string_agg(d.document ->> 'visit', ' | ' order by d.document ->> 'visit') into v_txt
    from custom.read_records_matching(v_org, v_t, '{"copay_tier":"Standard"}'::jsonb, false, 50, 0) d;
  if v_txt is distinct from 'Graham Fennimore — knee, visit 5 | Marisol Okafor — ACL rehab, visit 4 | Tobias Whitcombe — ankle, visit 3' then
    v_fail := v_fail || format('1b read_records_matching {copay_tier: Standard} handed back [%s]', coalesce(v_txt,'nothing'));
  end if;
  -- …a window filter on the formula DATE: follow-ups due in the first week of October (Oct 1 – Oct 8).
  select a.row_count into v_n from custom.record_aggregate(v_org, v_t, '[]'::jsonb, '[{"op":"count"}]'::jsonb,
    null, '{"follow_up_due":{"from":"2026-10-01","to":"2026-10-08"}}'::jsonb, 50, 'viewer', null) a;
  if v_n is distinct from 2 then
    v_fail := v_fail || format('1c record_aggregate window filter on follow_up_due counted %s, not 2', coalesce(v_n::text,'nothing'));
  end if;
  -- …and a plain stored column still filters exactly as before (the fix touched nothing else).
  select a.row_count into v_n from custom.record_aggregate(v_org, v_t, '[]'::jsonb, '[{"op":"count"}]'::jsonb,
    null, '{"copay":"40"}'::jsonb, 50, 'viewer', null) a;
  if v_n is distinct from 1 then
    v_fail := v_fail || format('1d record_aggregate filter on stored copay counted %s, not 1', coalesce(v_n::text,'nothing'));
  end if;

  -- 2. A DATE PERIOD of the formula date: follow-ups by month — September 3, October 3.
  select jsonb_object_agg(coalesce(a.groups ->> 'follow_up_due_month', 'no period'), a.row_count) into v_got
    from custom.record_aggregate(v_org, v_t, '[]'::jsonb, '[{"op":"count"}]'::jsonb,
      '{"key":"follow_up_due","by":"month"}'::jsonb, '{}'::jsonb, 50, 'viewer', null) a;
  if v_got is null or (select count(*) from jsonb_each(v_got)) <> 2
     or (select string_agg(left(k, 7) || '=' || (v_got ->> k), ',' order by k) from jsonb_object_keys(v_got) k)
        is distinct from '2026-09=3,2026-10=3' then
    v_fail := v_fail || format('2 record_aggregate bucket follow_up_due by month answered %s, not Sep 3 / Oct 3', coalesce(v_got::text,'nothing'));
  end if;

  -- 3. A WINDOW (the compare door) on the formula date: this week (Oct 1–8) against the one before
  --    (Sep 24 – Oct 1): 2 follow-ups due now, 1 the week before (Sep 24).
  select jsonb_build_object('now', sum(a.row_count), 'before', sum(a.prior_row_count)) into v_got
    from custom.record_aggregate(v_org, v_t, '[]'::jsonb, '[{"op":"count"}]'::jsonb, null, '{}'::jsonb, 50, 'viewer',
      '{"key":"follow_up_due","from":"2026-10-01","to":"2026-10-08","against":"previous_period"}'::jsonb) a;
  if v_got is distinct from '{"now": 2, "before": 1}'::jsonb then
    v_fail := v_fail || format('3 record_aggregate compare window on follow_up_due answered %s, not now 2 / before 1', coalesce(v_got::text,'nothing'));
  end if;

  if cardinality(v_fail) > 0 then
    raise exception E'RED — % formula check(s) failed:\n  %', cardinality(v_fail), array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'GREEN — a filter, a date period and a window on a formula column read the formula.';
end
$t$;

rollback;
