-- LANE CHAIR-ACCESS c — A READER FIELD APPLIES WHEN A RULE IS TRUE.
--
-- Cedar Ridge Physical Therapy (a fresh fixture organization each run; rolled back). Dr. Ana Whitfield
-- (admin@admin.com) is the manager; Marisol Vega (test@test.com) is the employee. Performance reviews are a
-- Confidential custom table whose Employee field names its reader ONLY once the review's status is
-- "shared" (`when`), and whose Manager field names its reader always. Ana writes Marisol's review as a
-- draft, then shares it.
--
-- WHAT MUST HOLD:
--   · the Arman-approved door takes readers with `when` (flat map and Rule expression) and refuses a `when`
--     that is not an object or names a column the table does not have;
--   · while status = draft, Marisol gets the header only (read_record), is not opened by the kernel, and
--     the list carries her review as a header row;
--   · once status = shared, Marisol reads the review in full through read_record, the list, the page and
--     the kernel - without anyone sharing it or writing her a grant;
--   · the Rule-expression form turns at the same moment;
--   · Ana (named as manager, no when) reads it at both moments; a coworker never does.
--
-- RED before migrations/campaign/chairaccess_c_a_reader_field_applies_when_a_rule_is_true.sql (`when` is
-- ignored: the employee reads the draft), GREEN after. One transaction, rolled back; prints one row per
-- check and a last line `chairaccess c: N of M checks hold`.

\set ON_ERROR_STOP on
\timing off
\set suite 'chairaccess_c_a_reader_field_applies_when_a_rule_is_true_red_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '300s';

create temp table cc (k text primary key, v uuid) on commit drop;
create temp table cc_out (n serial, check_name text, want text, got text) on commit drop;
grant select, insert on cc, cc_out to authenticated;
grant usage on sequence cc_out_n_seq to authenticated;

do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com, Ana
  c_test    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com, Marisol
  c_person  constant uuid := '11111111-0000-4000-8000-000000000005';
  c_words   constant text := 'Yes, make the performance reviews table Confidential: the manager reads a review, and the employee reads it once it is shared.';
  v_org uuid := gen_random_uuid(); v_home uuid; v_t uuid; v_t2 uuid; v_status uuid; v_code text;
  p_ana uuid; p_marisol uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/chairaccess-c', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy ' || substr(v_org::text, 1, 8), 'cedar-ridge-pt-' || substr(v_org::text, 1, 8), 'CRP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_test,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',       'organization', v_org, v_org, 'true'::jsonb,     'chairaccess c fixture'),
    ('custom', 'member_default_level', 'organization', v_org, v_org, '"editor"'::jsonb, 'chairaccess c fixture: the clinic edits by default');
  insert into custom.record (organization_id, table_id, data) values (v_org, null, jsonb_build_object('name', 'Clinic')) returning id into v_home;
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, c_person, 'record', jsonb_build_object('name', 'Ana Whitfield', 'user_id', c_admin::text)) returning id into p_ana;
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, c_person, 'record', jsonb_build_object('name', 'Marisol Vega', 'user_id', c_test::text)) returning id into p_marisol;

  -- two review tables: one whose `when` is a flat map, one whose `when` is a Rule expression
  for v_t in select null::uuid loop end loop;
  v_t := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Performance reviews', 'slug', 'performance_reviews', 'type', 'entity',
    'label_singular', 'Performance review', 'label_plural', 'Performance reviews',
    'title_field', 'period', 'display', 'list', 'weight', 'light', 'ordered', false,
    'row_order', 'sorted', 'agent_writable', false, 'retention_days', 3650,
    'default_sort', '[]'::jsonb, 'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'period'))));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key', 'period', 'label', 'Review period', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key', 'employee', 'label', 'Employee', 'type', 'relation', 'relation_target', c_person, 'relation_max', 1, 'sort', 20));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key', 'manager', 'label', 'Manager', 'type', 'relation', 'relation_target', c_person, 'relation_max', 1, 'sort', 30));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'text', 'sort', 40));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key', 'summary', 'label', 'Summary', 'type', 'text', 'sort', 50));
  insert into cc values ('org', v_org), ('reviews', v_t), ('p_ana', p_ana), ('p_marisol', p_marisol);

  v_t2 := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Probation reviews', 'slug', 'probation_reviews', 'type', 'entity',
    'label_singular', 'Probation review', 'label_plural', 'Probation reviews',
    'title_field', 'period', 'display', 'list', 'weight', 'light', 'ordered', false,
    'row_order', 'sorted', 'agent_writable', false, 'retention_days', 3650,
    'default_sort', '[]'::jsonb, 'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'period'))));
  perform custom.field_declare(v_org, v_t2, jsonb_build_object('key', 'period', 'label', 'Review period', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_t2, jsonb_build_object('key', 'employee', 'label', 'Employee', 'type', 'relation', 'relation_target', c_person, 'relation_max', 1, 'sort', 20));
  v_status := custom.field_declare(v_org, v_t2, jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'text', 'sort', 40));
  perform custom.field_declare(v_org, v_t2, jsonb_build_object('key', 'summary', 'label', 'Summary', 'type', 'text', 'sort', 50));
  insert into cc values ('probation', v_t2), ('status_field', v_status);

  -- Ana's draft reviews of Marisol
  insert into cc values ('r_draft', custom.record_write(v_org, v_t, jsonb_build_object(
    'period', 'Q3 2026', 'employee', p_marisol::text, 'manager', p_ana::text, 'status', 'draft',
    'summary', 'Marisol led the new vestibular protocol; caseload up 15%.')));
  insert into cc values ('r_rule', custom.record_write(v_org, v_t2, jsonb_build_object(
    'period', 'Probation 2026', 'employee', p_marisol::text, 'status', 'draft',
    'summary', 'Probation passed; documentation timeliness to keep an eye on.')));

  -- THE GATE on `when`
  begin
    perform custom.set_table_confidential_arman_explicitly_approved(v_t,
      '[{"field":"employee","level":"viewer","when":"shared"}]'::jsonb, c_words, current_date, true);
    insert into cc_out (check_name, want, got) values ('gate: a when that is not an object is refused', 'refused 23514', 'written');
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate;
    insert into cc_out (check_name, want, got) values ('gate: a when that is not an object is refused', 'refused 23514', 'refused ' || v_code);
  end;
  begin
    perform custom.set_table_confidential_arman_explicitly_approved(v_t,
      '[{"field":"employee","level":"viewer","when":{"stage":"shared"}}]'::jsonb, c_words, current_date, true);
    insert into cc_out (check_name, want, got) values ('gate: a when naming a column the table lacks is refused', 'refused 23514', 'written');
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate;
    insert into cc_out (check_name, want, got) values ('gate: a when naming a column the table lacks is refused', 'refused 23514', 'refused ' || v_code);
  end;
  -- THE FLIPS: employee reads when shared (flat map); manager always. Probation: a Rule expression.
  perform custom.set_table_confidential_arman_explicitly_approved(v_t,
    '[{"field":"employee","level":"viewer","when":{"status":"shared"}},{"field":"manager","level":"editor"}]'::jsonb, c_words, current_date, true);
  perform custom.set_table_confidential_arman_explicitly_approved(v_t2,
    jsonb_build_array(jsonb_build_object('field', 'employee', 'level', 'viewer',
      'when', jsonb_build_object('op', 'eq', 'args', jsonb_build_array(jsonb_build_object('field', v_status::text), jsonb_build_object('const', 'shared'))))),
    replace(c_words, 'performance reviews', 'probation reviews'), current_date, true);
  insert into cc_out (check_name, want, got) values ('gate: both tables are Confidential with readers', '2',
    (select count(*)::text from custom.record r where r.organization_id = v_org and r.id in (v_t, v_t2) and r.data ->> 'level' = 'confidential' and jsonb_typeof(r.data -> 'readers') = 'array'));
end $fixture$;

create or replace function pg_temp.is_header(j jsonb, id uuid) returns boolean language sql immutable as $$
  select j is not null and jsonb_typeof(j) = 'object' and j ->> 'id' = id::text and j -> 'exists' = 'true'::jsonb
     and not (j ? 'summary') and (select count(*) from jsonb_object_keys(j)) = 3
$$;

-- MARISOL'S SEAT, before and after the share
do $marisol$
declare
  v_org uuid; v_t uuid; v_t2 uuid; r_draft uuid; r_rule uuid; v_j jsonb; v_page jsonb; v_pass int; v_moment text; v_rowj jsonb;
begin
  select v into v_org from cc where k = 'org'; select v into v_t from cc where k = 'reviews'; select v into v_t2 from cc where k = 'probation';
  select v into r_draft from cc where k = 'r_draft'; select v into r_rule from cc where k = 'r_rule';
  for v_pass in 1 .. 2 loop
    v_moment := case v_pass when 1 then 'draft' else 'shared' end;
    if v_pass = 2 then
      -- Ana shares: the row's own state turns, nothing else is written for Marisol
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
      perform custom.record_update(v_org, r_draft, jsonb_build_object('status', 'shared'), null);
      perform custom.record_update(v_org, r_rule, jsonb_build_object('status', 'shared'), null);
    end if;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
    -- read_record
    begin
      v_j := custom.read_record(v_org, r_draft, false);
      insert into cc_out (check_name, want, got) values (v_moment || ': employee read_record of her review (flat when)',
        case v_pass when 1 then 'header' else 'full' end,
        case when v_j ? 'summary' then 'full' when pg_temp.is_header(v_j, r_draft) then 'header' else 'other' end);
    exception when others then
      insert into cc_out (check_name, want, got) values (v_moment || ': employee read_record of her review (flat when)', case v_pass when 1 then 'header' else 'full' end, 'refused');
    end;
    begin
      v_j := custom.read_record(v_org, r_rule, false);
      insert into cc_out (check_name, want, got) values (v_moment || ': employee read_record of her review (Rule when)',
        case v_pass when 1 then 'header' else 'full' end,
        case when v_j ? 'summary' then 'full' when pg_temp.is_header(v_j, r_rule) then 'header' else 'other' end);
    exception when others then
      insert into cc_out (check_name, want, got) values (v_moment || ': employee read_record of her review (Rule when)', case v_pass when 1 then 'header' else 'full' end, 'refused');
    end;
    -- the kernel
    insert into cc_out (check_name, want, got) values (v_moment || ': kernel has_access for the employee (flat when)', case v_pass when 1 then 'false' else 'true' end, iam.has_access('record', r_draft, 'viewer')::text);
    insert into cc_out (check_name, want, got) values (v_moment || ': kernel has_access for the employee (Rule when)', case v_pass when 1 then 'false' else 'true' end, iam.has_access('record', r_rule, 'viewer')::text);
    insert into cc_out (check_name, want, got) values (v_moment || ': the employee never edits it', 'false', iam.has_access('record', r_draft, 'editor')::text);
    -- the list and the page
    select x.document into v_rowj from custom.read_records(v_org, v_t, false, 200, 0) x where x.id = r_draft;
    insert into cc_out (check_name, want, got) values (v_moment || ': list row for the employee', case v_pass when 1 then 'header' else 'full' end,
      case when v_rowj is null then 'not listed' when v_rowj ? 'summary' then 'full' when pg_temp.is_header(v_rowj, r_draft) then 'header' else 'other' end);
    v_page := custom.read_records_page(v_org, v_t, '{}'::jsonb, null, '[]'::jsonb, null, false, 50, 0);
    select x -> 'document' into v_rowj from jsonb_array_elements(v_page -> 'rows') x where x ->> 'id' = r_draft::text;
    insert into cc_out (check_name, want, got) values (v_moment || ': page row for the employee', case v_pass when 1 then 'header' else 'full' end,
      case when v_rowj is null then 'not listed' when v_rowj ? 'summary' then 'full' when pg_temp.is_header(v_rowj, r_draft) then 'header' else 'other' end);
    perform set_config('role', 'postgres', true);
  end loop;
end $marisol$;

-- ANA (manager, no when) reads at both moments - checked after the share; a coworker never does.
do $others$
declare v_org uuid; r_draft uuid; v_j jsonb; c_other uuid := gen_random_uuid();
begin
  select v into v_org from cc where k = 'org'; select v into r_draft from cc where k = 'r_draft';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  v_j := custom.read_record(v_org, r_draft, false);
  insert into cc_out (check_name, want, got) values ('manager: reads the review in full', 'full', case when v_j ? 'summary' then 'full' else 'other' end);
  perform set_config('role', 'postgres', true);
  insert into cc_out (check_name, want, got) values ('coworker: a person named nowhere never opens it', 'false',
    coalesce(custom.confidential_answer(c_other, r_draft, 'viewer'), false)::text);
end $others$;

select n, check_name, want, got, case when want = got then 'HOLDS' else 'FAILS' end as verdict from cc_out order by n;
select format('chairaccess c: %s of %s checks hold', count(*) filter (where want = got), count(*)) from cc_out;
rollback;
