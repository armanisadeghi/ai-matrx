-- VISION-REACH W3 — A FIELD A MEMBER MAY NOT SEE IS WITHHELD BY EVERY QUERY AND AGGREGATE DOOR.
--
-- THE BREAK THIS CATCHES (measured on the clone 2026-10-02, before the fix): a member who may
-- not read a confidential Field got its value back UNMASKED from `custom.query_table_as_of`,
-- `custom.query_record_as_of`, `custom.query_across_homes` and `custom.query_by_coordinates`
-- (all EXECUTE to `authenticated`), and `custom.query_rollup_sum` added the hidden column up for
-- her. The current-time read door (`custom.read_record`) masked the same field for the same
-- person in the same session. Not five bugs: one class — a door that hands back a record's
-- document (or a number worked out of one Field) without asking `custom.read_mask_for`.
--
-- WHAT IT ASSERTS, from the member's seat (`role authenticated`, test@test.com's claims), for
-- one patient record shared with her at `viewer` whose `insurance_member_id` and
-- `outstanding_balance` Fields are `confidential`:
--   every door that returns the document: the value is absent, the key is null, and `_hidden`
--   names it; every door that measures: a hidden column is REFUSED by name (42501), never summed.
--   The control (`custom.read_record`) is asserted too, so a fixture that hides nothing cannot
--   pass this suite.
--
-- RUN IT (clone or main; it is one transaction ending in ROLLBACK — nothing persists):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/visionreach_w3_query_doors_mask_fields.sql
-- RED: on the bodies before migrations/campaign/visionreach_w3_query_doors_mask_fields.sql it fails
-- naming every leaking door; GREEN after.

\set ON_ERROR_STOP on
\timing off
\set suite 'visionreach_w3_query_doors_mask_fields.sql'
\set requires 'grant:authenticated:custom.query_table_as_of|grant:authenticated:custom.query_rollup_sum'
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
  c_secret  constant text := 'BCX-448-219-07';
  c_balance constant numeric := 1875.40;
  v_org  uuid := gen_random_uuid();
  v_home uuid;
  v_pat  uuid;
  v_rec  uuid; v_rec2 uuid;
  v_doc  jsonb; v_txt text; v_n integer; v_sum numeric;
  v_fail text[] := '{}';
  v_state text;
begin
  perform set_config('app.actor_system', 'campaign-test/visionreach_w3', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy', 'cedar-ridge-pt-'||substr(v_org::text,1,8), 'CRP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active'),
    (v_org,'organization',v_org,c_dana,'member','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/visionreach_w3'),
    ('custom','member_default_visibility','organization',v_org,v_org,'"shared_only"'::jsonb,
     'campaign-test/visionreach_w3');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Cedar Ridge Physical Therapy — Front Desk')) returning id into v_home;

  -- THE SEAT.
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;

  v_pat := custom.table_declare(v_org, jsonb_build_object(
    'name','Patients','slug','patients_'||substr(v_org::text,1,8),'type','entity',
    'label_singular','Patient','label_plural','Patients','title_field','name','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','name')),'parent_id',v_home::text));
  perform custom.field_declare(v_org, v_pat, jsonb_build_object('label','Plan of care','plain','text'));
  perform custom.field_declare(v_org, v_pat, jsonb_build_object(
    'label','Insurance member ID','key','insurance_member_id','plain','text','sensitivity','confidential'));
  perform custom.field_declare(v_org, v_pat, jsonb_build_object(
    'label','Outstanding balance','key','outstanding_balance','plain','number','sensitivity','confidential'));

  v_rec := custom.record_write(v_org, v_pat, jsonb_build_object(
    'name','Marisol Okafor','plan_of_care','Post-op ACL rehab, 2x weekly',
    'insurance_member_id', c_secret, 'outstanding_balance', c_balance, 'parent_id', v_home::text));
  v_rec2 := custom.record_write(v_org, v_pat, jsonb_build_object(
    'name','Desmond Albright','plan_of_care','Rotator cuff strengthening',
    'insurance_member_id','KPX-102-553-81','outstanding_balance', 240, 'parent_id', v_home::text));
  perform custom.record_update(v_org, v_rec, jsonb_build_object('plan_of_care','Post-op ACL rehab, 3x weekly'));
  perform custom.share_grant(v_org, v_rec, 'user', c_dana, 'viewer'::public.permission_level);

  -- ── THE MEMBER. ───────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_dana_j, true);

  -- CONTROL: the current-time read door masks it. If this fails the fixture hides nothing.
  v_doc := custom.read_record(v_org, v_rec);
  if v_doc ->> 'insurance_member_id' is not null or not (v_doc -> '_hidden') ? 'insurance_member_id' then
    raise exception 'CONTROL: custom.read_record did not withhold the confidential field (%); the fixture proves nothing', v_doc::text;
  end if;
  if v_doc ->> 'name' <> 'Marisol Okafor' then
    raise exception 'CONTROL: the member cannot read the shared record at all (%)', v_doc::text;
  end if;

  -- 1. custom.query_table_as_of — now, and at a past moment.
  select string_agg(q.data::text, ' ') into v_txt
    from custom.query_table_as_of(v_org, v_pat, null, null, 50, 0, 'viewer') q;
  if v_txt is null or v_txt not like '%Marisol Okafor%' then
    v_fail := v_fail || format('1 query_table_as_of answered the member nothing (%s)', coalesce(v_txt,'null'));
  elsif v_txt like '%' || c_secret || '%' or v_txt like '%1875.4%' then
    v_fail := v_fail || ('1 query_table_as_of LEAKED the confidential value: ' || v_txt);
  elsif v_txt not like '%"_hidden"%insurance_member_id%' then
    v_fail := v_fail || ('1 query_table_as_of withheld the value and did not name it in _hidden: ' || v_txt);
  end if;
  if v_txt like '%Desmond Albright%' then
    v_fail := v_fail || '1 query_table_as_of returned a record the member was never shown'::text;
  end if;

  select string_agg(q.data::text, ' ') into v_txt
    from custom.query_table_as_of(v_org, v_pat, clock_timestamp(), current_date, 50, 0, 'viewer') q;
  if coalesce(v_txt,'') like '%' || c_secret || '%' or coalesce(v_txt,'') like '%1875.4%' then
    v_fail := v_fail || ('1b query_table_as_of(recorded_at) LEAKED the confidential value: ' || v_txt);
  end if;

  -- 2. custom.query_record_as_of — the one-record door underneath it.
  v_doc := custom.query_record_as_of(v_org, v_rec, null, null, 'viewer');
  if v_doc is null then
    v_fail := v_fail || '2 query_record_as_of answered the member nothing'::text;
  elsif v_doc::text like '%' || c_secret || '%' or v_doc::text like '%1875.4%' then
    v_fail := v_fail || ('2 query_record_as_of LEAKED the confidential value: ' || v_doc::text);
  elsif not coalesce((v_doc -> '_hidden') ? 'outstanding_balance', false) then
    v_fail := v_fail || ('2 query_record_as_of withheld the value and did not name it: ' || v_doc::text);
  end if;

  -- 3. custom.query_by_coordinates — the whole Table, no coordinate constraint.
  select string_agg(q.data::text, ' ') into v_txt
    from custom.query_by_coordinates(v_org, v_pat, '[]'::jsonb, 50, 0, 'viewer') q;
  if v_txt is null or v_txt not like '%Marisol Okafor%' then
    v_fail := v_fail || format('3 query_by_coordinates answered the member nothing (%s)', coalesce(v_txt,'null'));
  elsif v_txt like '%' || c_secret || '%' or v_txt like '%1875.4%' then
    v_fail := v_fail || ('3 query_by_coordinates LEAKED the confidential value: ' || v_txt);
  elsif v_txt not like '%"_hidden"%insurance_member_id%' then
    v_fail := v_fail || ('3 query_by_coordinates withheld the value and did not name it: ' || v_txt);
  end if;

  -- 4. custom.query_across_homes.
  begin
    select string_agg(q.data::text, ' ') into v_txt
      from custom.query_across_homes(v_org, v_pat, 50, 0, 'viewer') q;
    if coalesce(v_txt,'') like '%' || c_secret || '%' or coalesce(v_txt,'') like '%1875.4%' then
      v_fail := v_fail || ('4 query_across_homes LEAKED the confidential value: ' || v_txt);
    elsif v_txt is not null and v_txt like '%Marisol Okafor%' and v_txt not like '%"_hidden"%insurance_member_id%' then
      v_fail := v_fail || ('4 query_across_homes withheld the value and did not name it: ' || v_txt);
    end if;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '42501' then
      v_fail := v_fail || format('4 query_across_homes failed with %s: %s', v_state, sqlerrm);
    end if;
  end;

  -- 5. custom.query_rollup_sum — adding up a column she may not read is refused by name.
  begin
    v_sum := custom.query_rollup_sum(v_org, array[v_rec], 'outstanding_balance', null, null, 33, 'viewer');
    v_fail := v_fail || format('5 query_rollup_sum ADDED UP the confidential column for the member: %s', v_sum);
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> '42501' or sqlerrm not like '%Outstanding balance%' then
      v_fail := v_fail || format('5 query_rollup_sum refused for the wrong reason (%s): %s', v_state, sqlerrm);
    end if;
  end;
  -- …and a column she MAY read still adds up (the door is not simply closed).
  begin
    v_sum := custom.query_rollup_sum(v_org, array[v_rec], 'name', null, null, 33, 'viewer');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = '42501' then
      v_fail := v_fail || format('5b query_rollup_sum refused a column the member may read: %s', sqlerrm);
    end if;
  end;

  -- 6. custom.record_aggregate — a measure, a group and a filter on the hidden column. This door
  -- MASKS in place (the measure answers null and `_withheld` names the column), so the check is
  -- that the number never comes back and the withholding is said.
  select string_agg(coalesce(a.groups::text,'') || coalesce(a.measures::text,''), ' ') into v_txt
    from custom.record_aggregate(v_org, v_pat, '[]'::jsonb,
      '[{"op":"sum","key":"outstanding_balance"}]'::jsonb, null, '{}'::jsonb, 50, 'viewer', null) a;
  if coalesce(v_txt,'') like '%1875.4%' or coalesce(v_txt,'') not like '%_withheld%' then
    v_fail := v_fail || ('6a record_aggregate summed the confidential column or did not say it withheld it: ' || coalesce(v_txt,'null'));
  end if;
  select string_agg(coalesce(a.groups::text,'') || coalesce(a.measures::text,''), ' ') into v_txt
    from custom.record_aggregate(v_org, v_pat, '["insurance_member_id"]'::jsonb,
      '[{"op":"count"}]'::jsonb, null, '{}'::jsonb, 50, 'viewer', null) a;
  if coalesce(v_txt,'') like '%' || c_secret || '%' or coalesce(v_txt,'') not like '%_withheld%' then
    v_fail := v_fail || ('6b record_aggregate grouped by the confidential column: ' || coalesce(v_txt,'null'));
  end if;
  select string_agg(coalesce(a.measures::text,'') || ' rows=' || coalesce(a.row_count::text,'null'), ' ') into v_txt
    from custom.record_aggregate(v_org, v_pat, '[]'::jsonb, '[{"op":"count"}]'::jsonb, null,
      jsonb_build_object('insurance_member_id', c_secret), 50, 'viewer', null) a;
  if coalesce(v_txt,'') not like '%_withheld%' then
    v_fail := v_fail || ('6c record_aggregate answered a filter on the confidential column (an oracle): ' || coalesce(v_txt,'null'));
  end if;

  -- 7. The owner still reads everything through the same doors (the fix masks, it does not blind).
  perform set_config('request.jwt.claims', c_admin_j, true);
  v_doc := custom.query_record_as_of(v_org, v_rec, null, null, 'viewer');
  if coalesce(v_doc ->> 'insurance_member_id', '') <> c_secret then
    v_fail := v_fail || ('7 query_record_as_of hid the field from the OWNER: ' || coalesce(v_doc::text,'null'));
  end if;
  select string_agg(q.data::text, ' ') into v_txt
    from custom.query_by_coordinates(v_org, v_pat, '[]'::jsonb, 50, 0, 'viewer') q;
  if coalesce(v_txt,'') not like '%' || c_secret || '%' then
    v_fail := v_fail || ('7 query_by_coordinates hid the field from the OWNER: ' || coalesce(v_txt,'null'));
  end if;
  v_sum := custom.query_rollup_sum(v_org, array[v_rec, v_rec2], 'outstanding_balance', null, null, 33, 'viewer');
  if v_sum is distinct from c_balance + 240 then
    v_fail := v_fail || format('7 query_rollup_sum for the OWNER answered %s, not %s', v_sum, c_balance + 240);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception E'RED — % door check(s) failed:\n  %', cardinality(v_fail), array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'GREEN — every query and aggregate door withholds the confidential field from the member, and the owner still reads it.';
end
$t$;

rollback;
