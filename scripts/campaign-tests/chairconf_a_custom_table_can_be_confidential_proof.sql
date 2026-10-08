-- LANE CHAIR-CONFIDENTIAL-STORE — A CUSTOM TABLE CAN BE CONFIDENTIAL.
--
-- THE USE CASE. Cedar Ridge Physical Therapy keeps its employees' performance reviews in a store
-- Table. A review is Confidential by nature (access ladder: the HR employee record): it opens to
-- the person who wrote it and the people the review itself names — its Manager and its Employee —
-- and to nobody else in the clinic, the clinic's admins included. Dr. Ana Whitfield, the clinic
-- director, is admin@admin.com and owns the Table; Marisol Vega, a physical therapist, is
-- test@test.com. Elena Park, a front-desk coordinator, is a Person with no account. Every name
-- and review below is synthesized.
--
-- WHAT MUST HOLD (each row of the result table below):
--   · Marisol, neither owner nor named, cannot read, list, search, aggregate, drill into the history
--     of, export or reach through the platform kernel (REST and MCP ask it) or the set lane a review
--     of Elena that Ana wrote — as a plain member AND as an organization admin;
--   · the review that names Marisol as Manager opens to her; the review she wrote opens to her;
--   · a review shared with her opens to her once shared, and not before;
--   · a note filed under a review (its child) opens exactly as its review;
--   · Ana, the Table's owner, reads every review;
--   · nobody makes a Table Confidential, or changes whom it names, without Arman's approval in his
--     own words recorded in the same transaction; going back to Organization needs none.
--
-- RED before migrations/campaign/chairconf_a_store_table_can_be_confidential.sql (the reviews leak
-- and the flip is not gated), GREEN after. Runs in one transaction and rolls back; it prints one row
-- per check and a last line `chairconf: N of M checks hold`.

\set ON_ERROR_STOP on
\timing off
\set suite 'chairconf_a_store_table_can_be_confidential_proof.sql'
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
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_test_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_person  constant uuid := '11111111-0000-4000-8000-000000000005';
  v_org uuid := gen_random_uuid(); v_home uuid; v_t uuid; v_notes uuid; v_spare uuid;
  p_ana uuid; p_marisol uuid; p_elena uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/chairconf', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Cedar Ridge Physical Therapy ' || substr(v_org::text, 1, 8),
          'cedar-ridge-pt-' || substr(v_org::text, 1, 8), 'CRP', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_test,  'member', 'active');
  -- The clinic's members edit by default, the most open setting there is: a lock that holds here holds.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',       'organization', v_org, v_org, 'true'::jsonb,     'chairconf fixture'),
    ('custom', 'member_default_level', 'organization', v_org, v_org, '"editor"'::jsonb, 'chairconf fixture: the clinic edits by default');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Clinic')) returning id into v_home;

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

  v_notes := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Review notes', 'slug', 'review_notes', 'type', 'entity',
    'label_singular', 'Review note', 'label_plural', 'Review notes',
    'title_field', 'note', 'display', 'list', 'weight', 'light', 'ordered', false,
    'row_order', 'sorted', 'agent_writable', false, 'retention_days', 3650,
    'default_sort', '[]'::jsonb, 'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'note'))));
  perform custom.field_declare(v_org, v_notes, jsonb_build_object('key', 'note', 'label', 'Note', 'type', 'text', 'sort', 10, 'required', true));

  v_spare := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Exit interviews', 'slug', 'exit_interviews', 'type', 'entity',
    'label_singular', 'Exit interview', 'label_plural', 'Exit interviews',
    'title_field', 'person', 'display', 'list', 'weight', 'light', 'ordered', false,
    'row_order', 'sorted', 'agent_writable', false, 'retention_days', 3650,
    'default_sort', '[]'::jsonb, 'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'person'))));
  perform custom.field_declare(v_org, v_spare, jsonb_build_object('key', 'person', 'label', 'Person', 'type', 'relation', 'relation_target', c_person, 'relation_max', 1, 'sort', 10));

  insert into cc values ('org', v_org), ('reviews', v_t), ('notes', v_notes), ('spare', v_spare),
    ('p_ana', p_ana), ('p_marisol', p_marisol), ('p_elena', p_elena);

  -- Ana writes three reviews. r_elena names Elena and Ana; r_named names Marisol as Elena's
  -- manager for the period she covered the front desk; r_shared names Elena and Ana and is the
  -- one Ana will share.
  insert into cc values ('r_elena', custom.record_write(v_org, v_t, jsonb_build_object(
    'period', 'Q3 2026', 'employee', p_elena::text, 'manager', p_ana::text, 'rating', 2,
    'summary', 'Elena missed four insurance verifications in August; coaching plan agreed.')));
  insert into cc values ('r_named', custom.record_write(v_org, v_t, jsonb_build_object(
    'period', 'Q2 2026', 'employee', p_elena::text, 'manager', p_marisol::text, 'rating', 4,
    'summary', 'Strong patient intake while covering the front desk.')));
  insert into cc values ('r_shared', custom.record_write(v_org, v_t, jsonb_build_object(
    'period', 'Q1 2026', 'employee', p_elena::text, 'manager', p_ana::text, 'rating', 3,
    'summary', 'Steady quarter; schedule accuracy improved.')));
  -- A note under each of the first two reviews (its children).
  insert into cc values ('n_elena', custom.record_write(v_org, v_notes, jsonb_build_object(
    'note', 'Follow-up meeting on the coaching plan, 15 September.', 'parent_id', (select v from cc where k = 'r_elena')::text)));
  insert into cc values ('n_named', custom.record_write(v_org, v_notes, jsonb_build_object(
    'note', 'Marisol to sit in on intake training.', 'parent_id', (select v from cc where k = 'r_named')::text)));
end $fixture$;

-- Marisol writes her own self-review (the add-your-own-row case): she owns it.
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

-- THE GATE, and the flip. Before the change there is no door, and the Table document takes any key.
do $gate$
declare v_t uuid; v_spare uuid; v_org uuid; v_err text; v_code text;
  c_words constant text := 'Yes, make the performance reviews table Confidential: only the writer, the employee and the manager may read a review.';
begin
  select v into v_org from cc where k = 'org'; select v into v_t from cc where k = 'reviews';
  select v into v_spare from cc where k = 'spare';
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);

  -- (g1) a plain write of the level, with no approval, is refused
  begin
    update custom.record set data = data || '{"level":"confidential"}'::jsonb where organization_id = v_org and id = v_spare;
    insert into cc_out (check_name, want, got) values ('gate: unapproved write of level is refused', 'refused 42501', 'written');
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate;
    insert into cc_out (check_name, want, got) values ('gate: unapproved write of level is refused', 'refused 42501', 'refused ' || v_code);
  end;
  -- (g2) the door refuses words that are not his
  if to_regprocedure('custom.set_table_confidential_arman_explicitly_approved(uuid, jsonb, text, date)') is not null then
    begin
      execute 'select custom.set_table_confidential_arman_explicitly_approved($1, null, $2, current_date)' using v_spare, 'approved';
      insert into cc_out (check_name, want, got) values ('gate: the door refuses a paraphrase', 'refused 22023', 'written');
    exception when others then
      get stacked diagnostics v_code = returned_sqlstate;
      insert into cc_out (check_name, want, got) values ('gate: the door refuses a paraphrase', 'refused 22023', 'refused ' || v_code);
    end;
  else
    insert into cc_out (check_name, want, got) values ('gate: the door refuses a paraphrase', 'refused 22023', 'no door');
  end if;

  -- THE FLIP: the reviews Table becomes Confidential, naming Employee and Manager.
  if to_regprocedure('custom.set_table_confidential_arman_explicitly_approved(uuid, jsonb, text, date)') is not null then
    execute 'select custom.set_table_confidential_arman_explicitly_approved($1, $2, $3, current_date)'
      using v_t, '[{"field":"employee","level":"viewer"},{"field":"manager","level":"editor"}]'::jsonb, c_words;
  else
    update custom.record set data = data || '{"level":"confidential","readers":[{"field":"employee","level":"viewer"},{"field":"manager","level":"editor"}]}'::jsonb
     where organization_id = v_org and id = v_t;
  end if;

  -- (g3) changing whom it names in a LATER transaction is proved by
  -- chairconf_a_store_table_can_be_confidential_gate.sql: an approval stands for the rest of its own
  -- transaction (the standard door's rule), and the approval ledger is append-only, so one rolled-back
  -- transaction cannot show it.
  -- (g4) going back to Organization needs no approval (on a second Table, made Confidential first)
  if to_regprocedure('custom.set_table_confidential_arman_explicitly_approved(uuid, jsonb, text, date)') is not null then
    execute 'select platform.set_table_confidential_arman_explicitly_approved($1, $2, current_date)'
      using 'custom.table:' || v_spare::text, replace(c_words, 'performance reviews', 'exit interviews');
  end if;
  begin
    update custom.record set data = (data - 'level') - 'readers' where organization_id = v_org and id = v_spare;
    insert into cc_out (check_name, want, got) values ('gate: back to Organization needs no approval',
      'written', case when (select data ? 'level' from custom.record where organization_id = v_org and id = v_spare) then 'still confidential' else 'written' end);
  exception when others then
    insert into cc_out (check_name, want, got) values ('gate: back to Organization needs no approval', 'written', 'refused ' || sqlerrm);
  end;
  -- the platform door's route for a custom table landed on the spare Table (approval row recorded)
  insert into cc_out (check_name, want, got) values ('gate: the platform door records approvals for custom tables', '2',
    (select count(*)::text from platform.class_approval_by_arman a where a.token in ('custom.table:' || v_t::text, 'custom.table:' || v_spare::text) and a.txid = pg_current_xact_id()));
end $gate$;

-- MARISOL'S SEAT — a plain member, then an organization admin.
do $marisol$
declare
  c_test uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_org uuid; v_t uuid; v_notes uuid; r_elena uuid; r_named uuid; r_shared uuid; r_own uuid; n_elena uuid; n_named uuid;
  v_ids uuid[]; v_page jsonb; v_j jsonb; v_n bigint; v_pass int; v_seat text;
  function_ok boolean;
begin
  select v into v_org from cc where k = 'org'; select v into v_t from cc where k = 'reviews'; select v into v_notes from cc where k = 'notes';
  select v into r_elena from cc where k = 'r_elena'; select v into r_named from cc where k = 'r_named';
  select v into r_shared from cc where k = 'r_shared'; select v into r_own from cc where k = 'r_own';
  select v into n_elena from cc where k = 'n_elena'; select v into n_named from cc where k = 'n_named';

  for v_pass in 1 .. 2 loop
    v_seat := case v_pass when 1 then 'member' else 'org admin' end;
    if v_pass = 2 then
      perform set_config('role', 'postgres', true);
      update iam.memberships set role = 'admin' where organization_id = v_org and user_id = c_test and container_type = 'organization';
    end if;
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);

    -- list
    select coalesce(array_agg(x.id), '{}') into v_ids from custom.read_records(v_org, v_t, false, 200, 0) x;
    insert into cc_out (check_name, want, got) values (v_seat || ': list hides the review of Elena', 'hidden', case when r_elena = any (v_ids) then 'listed' else 'hidden' end);
    insert into cc_out (check_name, want, got) values (v_seat || ': list shows the review naming her', 'listed', case when r_named = any (v_ids) then 'listed' else 'hidden' end);
    insert into cc_out (check_name, want, got) values (v_seat || ': list shows her own review', 'listed', case when r_own = any (v_ids) then 'listed' else 'hidden' end);
    insert into cc_out (check_name, want, got) values (v_seat || ': list hides the unshared review', 'hidden', case when r_shared = any (v_ids) then 'listed' else 'hidden' end);
    -- page + search
    v_page := custom.read_records_page(v_org, v_t, '{}'::jsonb, 'insurance', '[]'::jsonb, null, false, 50, 0);
    insert into cc_out (check_name, want, got) values (v_seat || ': search does not find the review of Elena', 'not found',
      case when v_page::text like '%' || r_elena::text || '%' or v_page::text ilike '%insurance verifications%' then 'found' else 'not found' end);
    v_page := custom.read_records_page(v_org, v_t, '{}'::jsonb, null, '[]'::jsonb, null, false, 50, 0);
    insert into cc_out (check_name, want, got) values (v_seat || ': page hides the review of Elena', 'hidden',
      case when v_page::text like '%' || r_elena::text || '%' then 'listed' else 'hidden' end);
    -- one record
    begin
      v_j := custom.read_record(v_org, r_elena, false);
      insert into cc_out (check_name, want, got) values (v_seat || ': read_record of the review of Elena', 'refused', case when v_j is null then 'refused' else 'read' end);
    exception when others then
      insert into cc_out (check_name, want, got) values (v_seat || ': read_record of the review of Elena', 'refused', 'refused');
    end;
    begin
      v_j := custom.read_record(v_org, r_named, false);
      insert into cc_out (check_name, want, got) values (v_seat || ': read_record of the review naming her as manager', 'read', case when v_j is null then 'refused' else 'read' end);
    exception when others then
      insert into cc_out (check_name, want, got) values (v_seat || ': read_record of the review naming her as manager', 'read', 'refused: ' || sqlerrm);
    end;
    -- aggregate: she may count her two (named + own), never four
    begin
      select x.row_count into v_n from custom.record_aggregate(v_org, v_t, '[]'::jsonb, '[]'::jsonb) x limit 1;
      insert into cc_out (check_name, want, got) values (v_seat || ': aggregate counts only what she may open', '2', coalesce(v_n::text, 'null'));
    exception when others then
      insert into cc_out (check_name, want, got) values (v_seat || ': aggregate counts only what she may open', '2', 'error: ' || sqlerrm);
    end;
    -- history doors
    begin
      select count(*) into v_n from custom.field_history(v_org, v_t, 'rating', 100, 0, null) h where h.record_id = r_elena;
      insert into cc_out (check_name, want, got) values (v_seat || ': field history hides the review of Elena', '0', v_n::text);
    exception when others then
      insert into cc_out (check_name, want, got) values (v_seat || ': field history hides the review of Elena', '0', 'error: ' || sqlerrm);
    end;
    begin
      select count(*) into v_n from custom.record_history(v_org, r_elena, 200, 0);
      insert into cc_out (check_name, want, got) values (v_seat || ': record history of the review of Elena', 'refused', case when v_n = 0 then 'refused' else v_n || ' versions' end);
    exception when others then
      insert into cc_out (check_name, want, got) values (v_seat || ': record history of the review of Elena', 'refused', 'refused');
    end;
    -- export
    begin
      v_j := custom.io_export(v_org, v_t, null, 10000, 'viewer');
      insert into cc_out (check_name, want, got) values (v_seat || ': export leaves out the review of Elena', 'left out',
        case when v_j::text like '%' || r_elena::text || '%' or v_j::text ilike '%insurance verifications%' then 'exported' else 'left out' end);
    exception when others then
      insert into cc_out (check_name, want, got) values (v_seat || ': export leaves out the review of Elena', 'left out', 'error: ' || sqlerrm);
    end;
    -- the platform kernel (what REST and MCP doors ask) and the set lane
    insert into cc_out (check_name, want, got) values (v_seat || ': kernel has_access on the review of Elena', 'false', iam.has_access('record', r_elena, 'viewer')::text);
    insert into cc_out (check_name, want, got) values (v_seat || ': kernel has_access on the review naming her', 'true', iam.has_access('record', r_named, 'viewer')::text);
    insert into cc_out (check_name, want, got) values (v_seat || ': kernel editor on the review naming her as manager', 'true', iam.has_access('record', r_named, 'editor')::text);
    insert into cc_out (check_name, want, got) values (v_seat || ': kernel admin on the review naming her as manager', 'false', iam.has_access('record', r_named, 'admin')::text);
    insert into cc_out (check_name, want, got) values (v_seat || ': kernel has_access on her own review', 'true', iam.has_access('record', r_own, 'admin')::text);
    perform set_config('role', 'postgres', true);
    insert into cc_out (check_name, want, got) values (v_seat || ': set lane leaves out the review of Elena', 'left out',
      case when exists (select 1 from custom.record r
                         where r.organization_id = v_org and r.table_id = v_t and r.deleted_at is null
                           and r.id = r_elena
                           and r.id in (select x from custom.visible_record_ids(c_test, 'viewer') x)) then 'in set' else 'left out' end);
    perform set_config('role', 'authenticated', true);
    -- children
    insert into cc_out (check_name, want, got) values (v_seat || ': the note under the review of Elena', 'false', iam.has_access('record', n_elena, 'viewer')::text);
    insert into cc_out (check_name, want, got) values (v_seat || ': the note under the review naming her', 'true', iam.has_access('record', n_named, 'viewer')::text);
    select coalesce(array_agg(x.id), '{}') into v_ids from custom.read_records(v_org, v_notes, false, 200, 0) x;
    insert into cc_out (check_name, want, got) values (v_seat || ': notes list hides the note under the review of Elena', 'hidden', case when n_elena = any (v_ids) then 'listed' else 'hidden' end);
    insert into cc_out (check_name, want, got) values (v_seat || ': notes list shows the note under the review naming her', 'listed', case when n_named = any (v_ids) then 'listed' else 'hidden' end);
  end loop;
  perform set_config('role', 'postgres', true);
  update iam.memberships set role = 'member' where organization_id = v_org and user_id = c_test and container_type = 'organization';
end $marisol$;

-- SHARING still works: Ana shares the Q1 review with Marisol.
do $share$
declare v_org uuid; r_shared uuid; v_ids uuid[]; v_t uuid;
begin
  select v into v_org from cc where k = 'org'; select v into r_shared from cc where k = 'r_shared'; select v into v_t from cc where k = 'reviews';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  perform custom.share_grant(v_org, r_shared, 'person', '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid, 'viewer');
  perform set_config('request.jwt.claims', '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}', true);
  select coalesce(array_agg(x.id), '{}') into v_ids from custom.read_records(v_org, v_t, false, 200, 0) x;
  insert into cc_out (check_name, want, got) values ('share: the shared review is listed for her', 'listed', case when r_shared = any (v_ids) then 'listed' else 'hidden' end);
  insert into cc_out (check_name, want, got) values ('share: the shared review opens to her as viewer', 'true', iam.has_access('record', r_shared, 'viewer')::text);
  insert into cc_out (check_name, want, got) values ('share: and never above what was shared', 'false', iam.has_access('record', r_shared, 'editor')::text);
  perform set_config('role', 'postgres', true);
end $share$;

-- ANA'S SEAT — the Table's owner reads every review.
do $ana$
declare v_org uuid; v_t uuid; v_ids uuid[];
begin
  select v into v_org from cc where k = 'org'; select v into v_t from cc where k = 'reviews';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  select coalesce(array_agg(x.id), '{}') into v_ids from custom.read_records(v_org, v_t, false, 200, 0) x;
  insert into cc_out (check_name, want, got) values ('owner: the Table owner lists every review', '4', cardinality(v_ids)::text);
  insert into cc_out (check_name, want, got) values ('owner: the Table owner opens Marisol''s self-review',
    'true', iam.has_access('record', (select v from cc where k = 'r_own'), 'viewer')::text);
  perform set_config('role', 'postgres', true);
end $ana$;

select n, check_name, want, got, case when want = got or (want like 'refused%' and got like 'refused%' and want = 'refused') then 'HOLDS' else 'FAILS' end as verdict
  from cc_out order by n;
select format('chairconf: %s of %s checks hold', count(*) filter (where want = got or (want = 'refused' and got like 'refused%')), count(*)) from cc_out;
rollback;
