-- LANE STORE-LEAK-FORMULA — A WORKED-OUT COLUMN NEVER HANDS OUT A COLUMN ITS READER MAY NOT READ.
--
-- THE USE CASE (VERIFIER-18 finding 1, rebuilt here and rolled back). The Birchwood Avenue
-- renovation: the owner (admin@admin.com) keeps each room's *Budget* confidential — the crew
-- lead may see the rooms and their status but not what the owner is willing to spend. Beside it
-- sits *Budget with contingency* (`{Budget} * 1.1`) and a band worked out from THAT
-- (`IF({Budget with contingency} > 50000, "Large", "Standard")`). Contractors' quotes live in
-- Quotes; each quote's *Amount* is confidential too (the owner compares bids) and each room rolls
-- up the sum of its quotes. Each room names its lead contractor and looks up her *Day rate*, which
-- the owner negotiated and keeps confidential. Dana Whitfield (test@test.com) is shared all three
-- tables as a Viewer. Every room, contractor and amount is
-- synthesized.
--
-- HAND-COMPUTED ANSWERS: Kitchen 18,000 → 19,800 (Standard); Primary bath 61,000 → 67,100
-- (Large); Garage 9,500 → 10,450 (Standard). Kitchen's quotes: Voltway Electric 7,400 + Harbor
-- Cabinetry 9,950 = 17,350. Kitchen's lead: Voltway Electric, day rate 720.
--
-- WHAT MAKES IT FAIL (RED before storeleakformula_a_worked_out_column_is_as_sensitive_as_what_it_reads.sql):
-- Dana is handed 19,800 (or 67,100, 10,450, the band, the looked-up budget or the rolled-up quote
-- total) by any door — the list door, the record panel, the aggregate, a filter or the export; or
-- the worked-out column is not withheld BY NAME with what it reads; or the definition does not
-- carry what it reads (`depends_on`, `sensitivity`) on declare, on edit and when an input becomes
-- more sensitive; or the owner loses a number she may read.

\set ON_ERROR_STOP on
\timing off
\set suite 'storeleakformula_green.sql'
\set requires 'function:custom.record_aggregate|function:custom.io_export_csv'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

create temp table slf (k text primary key, v uuid) on commit drop;
grant select on slf to authenticated;

do $fixture$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org    uuid := gen_random_uuid();
  v_home   uuid;
  v_rooms  uuid;
  v_quotes uuid;
  v_crew   uuid;
  v_budget uuid;
  v_id     uuid;
  v_kitchen uuid;
  v_row    jsonb;
begin
  perform set_config('app.actor_system', 'campaign-test/storeleakformula', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Birchwood Avenue Renovation ' || substr(v_org::text, 1, 8),
          'birchwood-slf-' || substr(v_org::text, 1, 8), 'BAR', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org, 'organization', v_org, c_admin, 'owner',  'active'),
    (v_org, 'organization', v_org, c_dana,  'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note) values
    ('custom', 'system_enabled',            'organization', v_org, v_org, 'true'::jsonb,          'storeleakformula fixture'),
    ('custom', 'member_default_visibility', 'organization', v_org, v_org, '"shared_only"'::jsonb, 'storeleakformula fixture: the crew lead sees what she is shared');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Home')) returning id into v_home;

  v_quotes := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Quotes', 'slug', 'quotes', 'type', 'entity',
    'label_singular', 'Quote', 'label_plural', 'Quotes', 'title_field', 'contractor',
    'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted',
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'created_at', 'direction', 'asc')),
    'agent_writable', true, 'retention_days', 3650, 'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'contractor'))));
  v_crew := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Contractors', 'slug', 'contractors', 'type', 'entity',
    'label_singular', 'Contractor', 'label_plural', 'Contractors', 'title_field', 'company',
    'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted',
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'created_at', 'direction', 'asc')),
    'agent_writable', true, 'retention_days', 3650, 'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'company'))));
  v_rooms := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Rooms', 'slug', 'rooms', 'type', 'entity',
    'label_singular', 'Room', 'label_plural', 'Rooms', 'title_field', 'room_name',
    'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted',
    'default_sort', jsonb_build_array(jsonb_build_object('field', 'created_at', 'direction', 'asc')),
    'agent_writable', true, 'retention_days', 3650, 'parent_id', v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'room_name'))));
  insert into slf values ('org', v_org), ('rooms', v_rooms), ('quotes', v_quotes), ('crew', v_crew);
  perform custom.field_declare(v_org, v_crew, jsonb_build_object('key', 'company', 'label', 'Company', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_crew, jsonb_build_object('key', 'day_rate', 'label', 'Day rate', 'type', 'currency', 'unit', '$', 'sort', 20, 'sensitivity', 'confidential'));

  perform custom.field_declare(v_org, v_quotes, jsonb_build_object('key', 'contractor', 'label', 'Contractor', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_quotes, jsonb_build_object('key', 'amount', 'label', 'Amount', 'type', 'currency', 'unit', '$', 'sort', 20, 'sensitivity', 'confidential'));
  perform custom.field_declare(v_org, v_quotes, jsonb_build_object('key', 'room', 'label', 'Room', 'type', 'relation', 'relation_target', v_rooms, 'sort', 30));

  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'room_name', 'label', 'Room name', 'type', 'text', 'sort', 10, 'required', true));
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'status', 'label', 'Status', 'type', 'select', 'sort', 20,
    'options', jsonb_build_array('Planning', 'Quoting', 'In Progress', 'Complete')));
  v_budget := custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'budget', 'label', 'Budget', 'type', 'currency', 'unit', '$', 'sort', 30, 'sensitivity', 'confidential'));
  -- The column VERIFIER-18 met: declared as the grid declares it, saying nothing about sensitivity.
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'budget_with_contingency', 'label', 'Budget with contingency',
    'type', 'formula', 'formula_text', '{Budget} * 1.1', 'sort', 40));
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'size_band', 'label', 'Size band',
    'type', 'formula', 'formula_text', 'IF({Budget with contingency} > 50000, "Large", "Standard")', 'sort', 50));
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'quotes_here', 'label', 'Quotes for this room',
    'type', 'relation', 'relation_target', v_quotes, 'multi', true, 'sort', 60));
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'quoted_total', 'label', 'Quoted so far',
    'type', 'rollup', 'via', 'quotes_here', 'agg', 'sum', 'of', 'amount', 'sort', 70));
  -- The lead contractor, and a LOOKUP of her day rate, which the owner negotiated and keeps confidential.
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'lead_contractor', 'label', 'Lead contractor',
    'type', 'relation', 'relation_target', v_crew, 'sort', 90));
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'lead_day_rate', 'label', 'Lead''s day rate',
    'type', 'lookup', 'via', 'lead_contractor', 'pick', 'day_rate', 'sort', 100));
  -- A plain formula that reads nothing confidential: it must stay readable to Dana.
  perform custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'room_label', 'label', 'Room label',
    'type', 'formula', 'formula_text', 'UPPER({Room name})', 'sort', 80));

  for v_row in select e from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('room_name', 'Kitchen',      'status', 'Quoting',     'budget', 18000),
    jsonb_build_object('room_name', 'Primary bath', 'status', 'Planning',    'budget', 61000),
    jsonb_build_object('room_name', 'Garage',       'status', 'In Progress', 'budget', 9500))) e loop
    v_id := custom.record_write(v_org, v_rooms, v_row);
    insert into slf values (v_row ->> 'room_name', v_id);
  end loop;
  select v into v_kitchen from slf where k = 'Kitchen';
  v_id := custom.record_write(v_org, v_crew, jsonb_build_object('company', 'Voltway Electric', 'day_rate', 720));
  insert into slf values ('c_voltway', v_id);
  perform custom.record_update(v_org, v_kitchen, jsonb_build_object('lead_contractor', v_id));
  v_id := custom.record_write(v_org, v_quotes, jsonb_build_object('contractor', 'Voltway Electric', 'amount', 7400, 'room', v_kitchen));
  insert into slf values ('q_voltway', v_id);
  v_id := custom.record_write(v_org, v_quotes, jsonb_build_object('contractor', 'Harbor Cabinetry', 'amount', 9950, 'room', v_kitchen));
  insert into slf values ('q_harbor', v_id);
  perform custom.record_update(v_org, v_kitchen, jsonb_build_object('quotes_here',
    jsonb_build_array((select v from slf where k = 'q_voltway'), (select v from slf where k = 'q_harbor'))));

  perform custom.share_grant(v_org, v_rooms,  'person', c_dana, 'viewer'::public.permission_level);
  perform custom.share_grant(v_org, v_quotes, 'person', c_dana, 'viewer'::public.permission_level);
  perform custom.share_grant(v_org, v_crew,   'person', c_dana, 'viewer'::public.permission_level);
end
$fixture$;

do $t$
declare
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  v_org uuid; v_rooms uuid; v_quotes uuid; v_kitchen uuid; v_fid uuid; v_lab uuid; v_lab_fx uuid;
  v_doc jsonb; v_docs jsonb; v_all text; v_msg text; v_csv text; v_n numeric; v_f jsonb;
begin
  select v into v_org from slf where k = 'org';
  select v into v_rooms from slf where k = 'rooms';
  select v into v_quotes from slf where k = 'quotes';
  select v into v_kitchen from slf where k = 'Kitchen';
  perform set_config('role', 'authenticated', true);

  -- ══ L1. the owner reads every number ══
  perform set_config('request.jwt.claims', c_admin_j, true);
  select d.document into v_doc from custom.read_records(v_org, v_rooms, false, 50, 0) d
   where d.document ->> 'room_name' = 'Kitchen';
  if (v_doc ->> 'budget_with_contingency')::numeric is distinct from 19800
     or v_doc ->> 'size_band' is distinct from 'Standard'
     or (v_doc ->> 'quoted_total')::numeric is distinct from 17350
     or (v_doc ->> 'lead_day_rate')::numeric is distinct from 720 then
    raise exception 'L1: the owner''s Kitchen row reads % / % / % / % (want 19,800 / Standard / 17,350 / 720): %',
      v_doc ->> 'budget_with_contingency', v_doc ->> 'size_band', v_doc ->> 'quoted_total', v_doc ->> 'lead_day_rate', v_doc;
  end if;
  raise notice 'L1 PASS — the owner reads Kitchen 19,800 · Standard · quoted 17,350 · lead''s day rate 720';

  -- ══ L2. Dana's list door: Budget withheld, and every column worked out from it withheld BY NAME ══
  perform set_config('request.jwt.claims', c_dana_j, true);
  select jsonb_agg(d.document) into v_docs from custom.read_records(v_org, v_rooms, false, 50, 0) d;
  v_all := v_docs::text;
  if jsonb_array_length(coalesce(v_docs, '[]'::jsonb)) <> 3 then
    raise exception 'L2: Dana sees % rooms (want 3): %', jsonb_array_length(coalesce(v_docs, '[]'::jsonb)), v_docs;
  end if;
  if v_all ~ '19800|67100|10450|18000|61000|9500|17350|720|Large|Standard' then
    raise exception 'L2: the list door handed Dana a number worked out from Budget or Amount: %', v_docs;
  end if;
  v_doc := v_docs -> 0;
  if v_doc ->> 'room_label' is null or v_doc ->> 'room_name' is null then
    raise exception 'L2: the refusal cost Dana a column she may read (room name / room label): %', v_doc;
  end if;
  if coalesce(v_doc -> '_hidden' -> 'budget_with_contingency' -> 'reads', '[]'::jsonb) <> '["Budget"]'::jsonb
     or coalesce(v_doc -> '_hidden' -> 'budget_with_contingency' ->> 'says', '') not like 'Budget with contingency is worked out from Budget%'
     or not (v_doc -> '_hidden' ? 'size_band') or not (v_doc -> '_hidden' ? 'quoted_total')
     or not (v_doc -> '_hidden' ? 'lead_day_rate') then
    raise exception 'L2: a worked-out column is not withheld by name with what it reads: %', v_doc -> '_hidden';
  end if;
  raise notice 'L2 PASS — Dana''s list door: Budget, Budget with contingency, Size band, Quoted so far and Lead''s day rate withheld by name ("%"); Room name and Room label still read',
    v_doc -> '_hidden' -> 'budget_with_contingency' ->> 'says';

  -- ══ L3. the record panel (read_record), the by-id door, History (record_as_of) and the filtered list door agree ══
  v_doc := custom.read_record(v_org, v_kitchen, false);
  if v_doc::text ~ '19800|17350|720|Standard' or not (v_doc::text ~ 'budget_with_contingency') then
    raise exception 'L3: the record panel handed Dana Kitchen''s worked-out numbers or did not name them: %', v_doc;
  end if;
  select jsonb_agg(d.document) into v_docs from custom.read_records_by_ids(v_org, v_rooms, array[v_kitchen], false) d;
  if v_docs::text ~ '19800|17350|720|Standard' then
    raise exception 'L3: the by-id door handed Dana a worked-out number: %', v_docs;
  end if;
  select to_jsonb(a.state) into v_f from custom.record_as_of(v_org, v_kitchen, now()) a;
  if v_f::text ~ '19800|17350|720|Standard' then
    raise exception 'L3: History handed Dana a worked-out number: %', v_f;
  end if;
  select jsonb_agg(d.document) into v_docs
    from custom.read_records_matching(v_org, v_rooms, '{"status": "Quoting"}'::jsonb, false, 50, 0) d;
  if v_docs::text ~ '19800|17350|720|Standard' or jsonb_array_length(coalesce(v_docs, '[]'::jsonb)) <> 1 then
    raise exception 'L3: the filtered list door handed Dana a worked-out number or lost Kitchen: %', v_docs;
  end if;
  raise notice 'L3 PASS — the record panel, the by-id door, History and the filtered list door withhold the same columns';

  -- ══ L4. the aggregate refuses every question that reads a worked-out column, by its name ══
  foreach v_msg in array array['budget_with_contingency', 'size_band', 'quoted_total', 'lead_day_rate'] loop
    begin
      select (measures)::text into v_all
        from custom.record_aggregate(v_org, v_rooms, '[]'::jsonb,
                                     jsonb_build_array(jsonb_build_object('op', case when v_msg = 'size_band' then 'unique' else 'sum' end, 'key', v_msg)))
       limit 1;
      raise exception 'L4: the aggregate of % was ANSWERED to Dana: %', v_msg, v_all;
    exception when sqlstate '42501' then
      get stacked diagnostics v_all = message_text;
      if v_all !~ '(Budget with contingency|Size band|Quoted so far|Lead''s day rate)' then
        raise exception 'L4: the aggregate of % was refused without the column''s name: %', v_msg, v_all;
      end if;
    end;
  end loop;
  begin
    perform 1 from custom.read_records_matching(v_org, v_rooms, '{"budget_with_contingency": 19800}'::jsonb, false, 50, 0);
    raise exception 'L4: the list door narrowed Dana''s rooms by Budget with contingency';
  exception when sqlstate '42501' then
    get stacked diagnostics v_all = message_text;
    if v_all not like '%Budget with contingency%' then raise exception 'L4: the filter was refused without the name: %', v_all; end if;
  end;
  select row_count into v_n from custom.record_aggregate(v_org, v_rooms, '[]'::jsonb, '[{"op": "count"}]'::jsonb);
  if v_n is distinct from 3 then raise exception 'L4: Dana''s own count of rooms answered % (want 3)', v_n; end if;
  raise notice 'L4 PASS — sum/unique of every worked-out column and a filter on one are refused to Dana by name ("%"); her count of rooms still answers 3', v_all;

  -- ══ L5. the export writes no worked-out number ══
  v_csv := custom.io_export_csv(v_org, v_rooms, array['room_name', 'status', 'budget', 'budget_with_contingency', 'size_band', 'quoted_total', 'lead_day_rate', 'room_label'], 100, ',', 'viewer');
  if v_csv ~ '19800|67100|10450|17350|720|Standard|Large' or v_csv !~ 'KITCHEN' then
    raise exception 'L5: Dana''s export carries a worked-out number, or lost her own columns: %', v_csv;
  end if;
  raise notice 'L5 PASS — Dana''s export: % bytes, no worked-out number, Room label still written', length(v_csv);

  -- ══ L6. the definitions carry what they read ══
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', 'postgres', true);
  select f.data into v_f from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_rooms::text and f.data ->> 'key' = 'budget_with_contingency';
  perform set_config('role', 'authenticated', true);
  if v_f ->> 'sensitivity' <> 'confidential' or v_f -> 'depends_on' <> '["budget"]'::jsonb then
    raise exception 'L6: Budget with contingency is stored % with depends_on % (want confidential, ["budget"])', v_f ->> 'sensitivity', v_f -> 'depends_on';
  end if;
  perform set_config('role', 'postgres', true);
  select f.data into v_f from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_rooms::text and f.data ->> 'key' = 'size_band';
  perform set_config('role', 'authenticated', true);
  if v_f ->> 'sensitivity' <> 'confidential' or v_f -> 'depends_on' <> '["budget_with_contingency"]'::jsonb then
    raise exception 'L6: Size band is stored % with depends_on %', v_f ->> 'sensitivity', v_f -> 'depends_on';
  end if;
  perform set_config('role', 'postgres', true);
  select f.data into v_f from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_rooms::text and f.data ->> 'key' = 'room_label';
  perform set_config('role', 'authenticated', true);
  if v_f ->> 'sensitivity' <> 'internal' or v_f -> 'depends_on' <> '["room_name"]'::jsonb then
    raise exception 'L6: Room label is stored % with depends_on % (want internal, ["room_name"])', v_f ->> 'sensitivity', v_f -> 'depends_on';
  end if;
  raise notice 'L6 PASS — on declare: Budget with contingency confidential ["budget"], Size band confidential ["budget_with_contingency"], Room label internal ["room_name"]';

  -- ══ L7. an edit re-derives: a new formula reads new columns; the floor holds; lowering is explicit ══
  perform set_config('role', 'postgres', true);
  select f.id into v_fid from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id() and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_rooms::text and f.data ->> 'key' = 'budget_with_contingency';
  perform set_config('role', 'authenticated', true);
  perform custom.field_update(v_org, v_fid, jsonb_build_object('formula_text', 'CONCATENATE({Room name}, " · ", {Status})'));
  perform set_config('role', 'postgres', true);
  select f.data into v_f from custom.record f where f.organization_id = v_org and f.id = v_fid;
  perform set_config('role', 'authenticated', true);
  if v_f -> 'depends_on' <> '["room_name", "status"]'::jsonb or v_f ->> 'sensitivity' <> 'confidential' then
    raise exception 'L7a: after the edit the column says % / % (want ["room_name","status"], still confidential until someone lowers it)', v_f -> 'depends_on', v_f ->> 'sensitivity';
  end if;
  perform custom.field_update(v_org, v_fid, jsonb_build_object('sensitivity', 'internal'));
  perform set_config('role', 'postgres', true);
  select f.data into v_f from custom.record f where f.organization_id = v_org and f.id = v_fid;
  perform set_config('role', 'authenticated', true);
  if v_f ->> 'sensitivity' <> 'internal' then
    raise exception 'L7b: a column that no longer reads anything confidential could not be lowered: %', v_f ->> 'sensitivity';
  end if;
  perform custom.field_update(v_org, v_fid, jsonb_build_object('formula_text', '{Budget} * 1.1', 'sensitivity', 'internal'));
  perform set_config('role', 'postgres', true);
  select f.data into v_f from custom.record f where f.organization_id = v_org and f.id = v_fid;
  perform set_config('role', 'authenticated', true);
  if v_f -> 'depends_on' <> '["budget"]'::jsonb or v_f ->> 'sensitivity' <> 'confidential' then
    raise exception 'L7c: asked to read Budget again AND be internal, the column says % / % (want ["budget"], confidential)', v_f -> 'depends_on', v_f ->> 'sensitivity';
  end if;
  raise notice 'L7 PASS — an edit re-derives depends_on; lowering is allowed only when nothing confidential is read; "internal" over Budget is raised to confidential';

  -- ══ L8. an input that becomes confidential takes its readers with it ══
  v_lab := custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'labor_estimate', 'label', 'Labor estimate', 'type', 'currency', 'unit', '$', 'sort', 110));
  v_lab_fx := custom.field_declare(v_org, v_rooms, jsonb_build_object('key', 'labor_with_markup', 'label', 'Labor with markup',
    'type', 'formula', 'formula_text', '{Labor estimate} * 1.2', 'sort', 120));
  perform custom.field_update(v_org, v_lab, jsonb_build_object('sensitivity', 'restricted'));
  perform set_config('role', 'postgres', true);
  select f.data into v_f from custom.record f where f.organization_id = v_org and f.id = v_lab_fx;
  perform set_config('role', 'authenticated', true);
  if v_f ->> 'sensitivity' <> 'restricted' then
    raise exception 'L8: Labor estimate became restricted and Labor with markup still says %', v_f ->> 'sensitivity';
  end if;
  raise notice 'L8 PASS — Labor estimate raised to restricted; Labor with markup followed it to restricted';

  -- ══ L9. a per-person share of the FORMULA alone does not open what it reads ══
  perform custom.share_grant(v_org, v_fid, 'person', '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid, 'editor'::public.permission_level);
  perform set_config('role', 'postgres', true);
  if iam.granted_level('4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid, 'record', v_fid) is distinct from 'editor'::public.permission_level then
    raise exception 'L9: the fixture''s share of the formula column did not land (granted %)', iam.granted_level('4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid, 'record', v_fid);
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', c_dana_j, true);
  select d.document into v_doc from custom.read_records(v_org, v_rooms, false, 50, 0) d
   where d.document ->> 'room_name' = 'Kitchen';
  if v_doc::text ~ '19800' or not ((v_doc -> '_hidden') ? 'budget_with_contingency') then
    raise exception 'L9: a share of Budget with contingency alone handed Dana 19,800: %', v_doc;
  end if;
  raise notice 'L9 PASS — a share of the formula alone (editor, landed) still withholds it while Budget is withheld';
  raise notice 'storeleakformula_green.sql: ALL 9 PASS';
end
$t$;

rollback;
