-- LANE CHAIR-ACCESS b — A LOCKED ROW SHOWS ITS HEADER, AND NOTHING ELSE.
--
-- Cedar Ridge Physical Therapy (a fresh fixture organization each run; rolled back). Dr. Ana Whitfield
-- (admin@admin.com) is the clinic director and the manager; Marisol Vega (test@test.com) is a physical
-- therapist, the employee. Performance reviews are a Confidential custom table (the HR employee record of
-- the access ladder) whose readers are the Employee and the Manager fields; the Table belongs to the
-- organization (maker_is_reader). Ana writes a review of Elena Park (a Person with no account) that names
-- Ana as manager; Marisol is neither its owner nor named on it. Both Ana's review and Marisol's own
-- self-review are "Shown to: only me" for the second half, as lane 12's proof had them.
--
-- WHAT MUST HOLD for Marisol, as a member and as an organization admin:
--   · read_record of Ana's review answers exactly {id, exists: true, submitted_at} - no summary, no rating;
--   · record_headers answers the row (id, table_id, created_at) - it never carried a value;
--   · read_records lists it as a header row while it is shown to everyone, and not at all once it is
--     "only me" (Only me hides; Confidential locks);
--   · read_records_page: the header on a plain page; never on a search, a filter or a sort;
--   · record_aggregate counts only what she may open; field_history and record_history give nothing;
--     io_export leaves it out; the platform kernel (iam.has_access) says false;
--   · her own review and the review that names her still open in full.
--
-- RED before migrations/campaign/chairaccess_b_a_locked_row_shows_its_header.sql (read_record refuses,
-- the lists leave the row out), GREEN after. One transaction, rolled back; prints one row per check and a
-- last line `chairaccess b: N of M checks hold`.

\set ON_ERROR_STOP on
\timing off
\set suite 'chairaccess_b_a_locked_row_shows_its_header_red_green.sql'
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
  c_words   constant text := 'Yes, make the performance reviews table Confidential: only the writer, the employee and the manager may read a review.';
  v_org uuid := gen_random_uuid(); v_home uuid; v_t uuid;
  p_ana uuid; p_marisol uuid; p_elena uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/chairaccess-b', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy ' || substr(v_org::text, 1, 8), 'cedar-ridge-pt-' || substr(v_org::text, 1, 8), 'CRP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_test,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',       'organization', v_org, v_org, 'true'::jsonb,     'chairaccess b fixture'),
    ('custom', 'member_default_level', 'organization', v_org, v_org, '"editor"'::jsonb, 'chairaccess b fixture: the clinic edits by default');
  insert into custom.record (organization_id, table_id, data) values (v_org, null, jsonb_build_object('name', 'Clinic')) returning id into v_home;

  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, c_person, 'record', jsonb_build_object('name', 'Ana Whitfield', 'user_id', c_admin::text)) returning id into p_ana;
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, c_person, 'record', jsonb_build_object('name', 'Marisol Vega', 'user_id', c_test::text)) returning id into p_marisol;
  insert into custom.record (organization_id, table_id, data_class, data) values
    (v_org, c_person, 'record', jsonb_build_object('name', 'Elena Park')) returning id into p_elena;

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
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key', 'rating', 'label', 'Overall rating', 'type', 'number', 'sort', 40));
  perform custom.field_declare(v_org, v_t, jsonb_build_object('key', 'summary', 'label', 'Summary', 'type', 'text', 'sort', 50));
  insert into cc values ('org', v_org), ('reviews', v_t), ('p_ana', p_ana), ('p_marisol', p_marisol), ('p_elena', p_elena);

  -- Ana's reviews: of Elena (names Ana), and one naming Marisol as the manager
  insert into cc values ('r_elena', custom.record_write(v_org, v_t, jsonb_build_object(
    'period', 'Q3 2026', 'employee', p_elena::text, 'manager', p_ana::text, 'rating', 2,
    'summary', 'Elena missed four insurance verifications in August; coaching plan agreed.')));
  insert into cc values ('r_named', custom.record_write(v_org, v_t, jsonb_build_object(
    'period', 'Q2 2026', 'employee', p_elena::text, 'manager', p_marisol::text, 'rating', 4,
    'summary', 'Strong patient intake while covering the front desk.')));

  -- THE FLIP, through the Arman-approved door (the only path), the Table belonging to the organization
  perform custom.set_table_confidential_arman_explicitly_approved(v_t,
    '[{"field":"employee","level":"viewer"},{"field":"manager","level":"editor"}]'::jsonb, c_words, current_date, true);
end $fixture$;

-- Marisol writes her own self-review: she owns it.
do $own$
declare v_org uuid; v_t uuid; v_p uuid;
begin
  select v into v_org from cc where k = 'org'; select v into v_t from cc where k = 'reviews';
  select v into v_p from cc where k = 'p_marisol';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  insert into cc values ('r_own', custom.record_write(v_org, v_t, jsonb_build_object(
    'period', 'Self-review 2026', 'employee', v_p::text, 'rating', 4, 'summary', 'My goals for next year.')));
  perform set_config('role', 'postgres', true);
end $own$;

create or replace function pg_temp.is_header(j jsonb, id uuid) returns boolean language sql immutable as $$
  select j is not null and jsonb_typeof(j) = 'object'
     and j ->> 'id' = id::text and j -> 'exists' = 'true'::jsonb and (j ->> 'submitted_at') is not null
     and not (j ? 'summary') and not (j ? 'rating') and not (j ? 'period') and not (j ? 'employee') and not (j ? 'manager')
     and (select count(*) from jsonb_object_keys(j)) = 3
$$;

-- MARISOL'S SEAT: member, then organization admin; shown to everyone, then "only me".
do $marisol$
declare
  c_test uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_org uuid; v_t uuid; r_elena uuid; r_named uuid; r_own uuid;
  v_ids uuid[]; v_page jsonb; v_j jsonb; v_n bigint; v_pass int; v_seat text; v_rowj jsonb;
begin
  select v into v_org from cc where k = 'org'; select v into v_t from cc where k = 'reviews';
  select v into r_elena from cc where k = 'r_elena'; select v into r_named from cc where k = 'r_named'; select v into r_own from cc where k = 'r_own';

  for v_pass in 1 .. 3 loop
    v_seat := case v_pass when 1 then 'member' when 2 then 'org admin' else 'only me' end;
    perform set_config('role', 'postgres', true);
    if v_pass = 2 then
      update iam.memberships set role = 'admin' where organization_id = v_org and user_id = c_test and container_type = 'organization';
    elsif v_pass = 3 then
      update iam.memberships set role = 'member' where organization_id = v_org and user_id = c_test and container_type = 'organization';
      update custom.record set shown_to = 'only_me' where organization_id = v_org and id in (r_elena, r_own);
    end if;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);

    -- read_record: the header, nothing else
    begin
      v_j := custom.read_record(v_org, r_elena, false);
      insert into cc_out (check_name, want, got) values (v_seat || ': read_record of Ana''s review is the header only', 'header',
        case when pg_temp.is_header(v_j, r_elena) then 'header' when v_j ? 'summary' then 'FULL ROW' else 'other: ' || left(v_j::text, 80) end);
    exception when others then
      insert into cc_out (check_name, want, got) values (v_seat || ': read_record of Ana''s review is the header only', 'header', 'refused');
    end;
    -- record_headers: the row, no value
    select count(*) into v_n from custom.record_headers(v_org, array[r_elena]) h where h.id = r_elena and h.created_at is not null and h.created_by is null;
    insert into cc_out (check_name, want, got) values (v_seat || ': record_headers answers the row', '1', v_n::text);
    -- read_records
    select coalesce(array_agg(x.id), '{}') into v_ids from custom.read_records(v_org, v_t, false, 200, 0) x;
    select x.document into v_rowj from custom.read_records(v_org, v_t, false, 200, 0) x where x.id = r_elena;
    if v_pass < 3 then
      insert into cc_out (check_name, want, got) values (v_seat || ': list carries Ana''s review as a header row', 'header',
        case when v_rowj is null then 'not listed' when pg_temp.is_header(v_rowj, r_elena) then 'header' when v_rowj ? 'summary' then 'FULL ROW' else 'other' end);
    else
      insert into cc_out (check_name, want, got) values (v_seat || ': list does not carry an only-me review', 'not listed', case when v_rowj is null then 'not listed' else 'listed' end);
    end if;
    insert into cc_out (check_name, want, got) values (v_seat || ': list shows the review naming her in full', 'full',
      case when exists (select 1 from custom.read_records(v_org, v_t, false, 200, 0) x where x.id = r_named and x.document ? 'summary') then 'full' else 'missing' end);
    insert into cc_out (check_name, want, got) values (v_seat || ': list shows her own review in full', 'full',
      case when exists (select 1 from custom.read_records(v_org, v_t, false, 200, 0) x where x.id = r_own and x.document ? 'summary') then 'full' else 'missing' end);
    -- read_records_page: plain, search, filter, sort
    v_page := custom.read_records_page(v_org, v_t, '{}'::jsonb, null, '[]'::jsonb, null, false, 50, 0);
    select x -> 'document' into v_rowj from jsonb_array_elements(v_page -> 'rows') x where x ->> 'id' = r_elena::text;
    if v_pass < 3 then
      insert into cc_out (check_name, want, got) values (v_seat || ': plain page carries Ana''s review as a header row', 'header',
        case when v_rowj is null then 'not listed' when pg_temp.is_header(v_rowj, r_elena) then 'header' when v_rowj ? 'summary' then 'FULL ROW' else 'other' end);
    else
      insert into cc_out (check_name, want, got) values (v_seat || ': plain page does not carry an only-me review', 'not listed', case when v_rowj is null then 'not listed' else 'listed' end);
    end if;
    v_page := custom.read_records_page(v_org, v_t, '{}'::jsonb, 'insurance', '[]'::jsonb, null, false, 50, 0);
    insert into cc_out (check_name, want, got) values (v_seat || ': search does not find Ana''s review', 'not found',
      case when v_page::text like '%' || r_elena::text || '%' or v_page::text ilike '%insurance verifications%' then 'found' else 'not found' end);
    v_page := custom.read_records_page(v_org, v_t, '{"rating": 2}'::jsonb, null, '[]'::jsonb, null, false, 50, 0);
    insert into cc_out (check_name, want, got) values (v_seat || ': a filter does not match Ana''s review', 'not found',
      case when v_page::text like '%' || r_elena::text || '%' then 'found' else 'not found' end);
    v_page := custom.read_records_page(v_org, v_t, '{}'::jsonb, null, '[{"field":"rating","direction":"asc","as":"number"}]'::jsonb, null, false, 50, 0);
    insert into cc_out (check_name, want, got) values (v_seat || ': a sorted page leaves Ana''s review out', 'left out',
      case when v_page::text like '%' || r_elena::text || '%' then 'listed' else 'left out' end);
    -- aggregate, history, export
    begin
      select x.row_count into v_n from custom.record_aggregate(v_org, v_t, '[]'::jsonb, '[]'::jsonb) x limit 1;
      insert into cc_out (check_name, want, got) values (v_seat || ': aggregate counts only what she may open', '2', coalesce(v_n::text, 'null'));
    exception when others then
      insert into cc_out (check_name, want, got) values (v_seat || ': aggregate counts only what she may open', '2', 'error: ' || sqlerrm);
    end;
    begin
      select count(*) into v_n from custom.field_history(v_org, v_t, 'rating', 100, 0, null) h where h.record_id = r_elena;
      insert into cc_out (check_name, want, got) values (v_seat || ': field history gives nothing of Ana''s review', '0', v_n::text);
    exception when others then
      insert into cc_out (check_name, want, got) values (v_seat || ': field history gives nothing of Ana''s review', '0', 'error: ' || sqlerrm);
    end;
    begin
      select count(*) into v_n from custom.record_history(v_org, r_elena, 200, 0);
      insert into cc_out (check_name, want, got) values (v_seat || ': record history gives nothing of Ana''s review', 'nothing', case when v_n = 0 then 'nothing' else v_n || ' versions' end);
    exception when others then
      insert into cc_out (check_name, want, got) values (v_seat || ': record history gives nothing of Ana''s review', 'nothing', 'nothing');
    end;
    begin
      v_j := custom.io_export(v_org, v_t, null, 10000, 'viewer');
      insert into cc_out (check_name, want, got) values (v_seat || ': export leaves Ana''s review out', 'left out',
        case when v_j::text like '%' || r_elena::text || '%' or v_j::text ilike '%insurance verifications%' then 'exported' else 'left out' end);
    exception when others then
      insert into cc_out (check_name, want, got) values (v_seat || ': export leaves Ana''s review out', 'left out', 'error: ' || sqlerrm);
    end;
    insert into cc_out (check_name, want, got) values (v_seat || ': kernel has_access on Ana''s review', 'false', iam.has_access('record', r_elena, 'viewer')::text);
  end loop;
  perform set_config('role', 'postgres', true);
end $marisol$;

-- ANA'S SEAT: the manager reads her own review in full, and Marisol's self-review is a header to her
-- (the Table belongs to the organization: its maker is only a reader).
do $ana$
declare v_org uuid; v_t uuid; r_own uuid; r_elena uuid; v_j jsonb;
begin
  select v into v_org from cc where k = 'org'; select v into v_t from cc where k = 'reviews';
  select v into r_own from cc where k = 'r_own'; select v into r_elena from cc where k = 'r_elena';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  v_j := custom.read_record(v_org, r_elena, false);
  insert into cc_out (check_name, want, got) values ('manager: reads her own review in full', 'full', case when v_j ? 'summary' then 'full' else 'other' end);
  begin
    v_j := custom.read_record(v_org, r_own, false);
    insert into cc_out (check_name, want, got) values ('manager: Marisol''s self-review is a header to her', 'header',
      case when pg_temp.is_header(v_j, r_own) then 'header' when v_j ? 'summary' then 'FULL ROW' else 'other' end);
  exception when others then
    insert into cc_out (check_name, want, got) values ('manager: Marisol''s self-review is a header to her', 'header', 'refused');
  end;
  perform set_config('role', 'postgres', true);
end $ana$;

select n, check_name, want, got, case when want = got then 'HOLDS' else 'FAILS' end as verdict from cc_out order by n;
select format('chairaccess b: %s of %s checks hold', count(*) filter (where want = got), count(*)) from cc_out;
rollback;
