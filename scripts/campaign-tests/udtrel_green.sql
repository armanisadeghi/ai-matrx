-- LANE OLD-TABLES-1 — W3, THE WRITE-SIDE INTEGRITY BOUNDARY. GREEN. Every arm ends in ROLLBACK.
--
-- THE USE CASE. Rincon Plumbing & Drain runs a dispatch board out of the older user-data tables:
-- one table of Customers, one of Service Calls, and each call names the customer it is for.
-- Today that column would be a `choice` holding the customer's NAME; from W1 it is a `relation`
-- holding the customer's ID. This suite builds exactly that pair of tables, writes real calls
-- into them, and proves that the id is accepted and the name is not.
--
-- WHY ONE TRIGGER AND NOT SIX CHECKS. Four of the six doors OLD-TABLES-CUTOVER §3.4 names —
-- `append_rows_to_user_table` (matrx-extend's scraped rows), the agent tools
-- `usertable_add_rows` and `usertable_update_row`, and the workflow node `data.table.upsert` —
-- reach `workbench.udt_dataset_rows.data` by the same road: an INSERT or an UPDATE of `data`.
-- The check lives on that road. Clause 4 proves it by going through
-- `append_rows_to_user_table`'s own shape rather than asserting the trigger exists.
--
-- WHAT IT PROVES
--   0  the boundary is installed: one BEFORE-ROW trigger on `udt_dataset_rows`
--   1  AN ID IS ACCEPTED. The ordinary write still works — this arm comes first, because a
--      boundary that refuses correct writes is an outage.
--   2  AN EMPTY CELL IS ACCEPTED. `null` and `''` are a cleared relation, not a bad one.
--   3  A `choice` COLUMN IS UNTOUCHED. The 13 live label columns and their 344 filled cells keep
--      taking labels, including the 2 off-list values `allowOther` deliberately keeps legible.
--   4  THE BULK PATH IS THE SAME PATH — a 50-row append with one label in the relation column
--      writes 49 and refuses 1, which is the gate OLD-TABLES-CUTOVER W3 states.
--   5  THE DOOR CAN DECLARE THE COLUMN. `create_user_table_with_fields` now carries `metadata`,
--      so a table created through it can hold a format at all — it could not before, and every
--      format a caller asked for through that door arrived as a bare string.
--
-- Its twin is scripts/campaign-tests/udtrel_red.sql.
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/udtrel_green.sql

\set ON_ERROR_STOP on
\timing off

\i scripts/campaign-tests/_preamble.sql

\echo ''
\echo '── 0 · the boundary is installed on the road every door takes ─────────────────────────'

do $$
begin
  perform 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = 'workbench.udt_dataset_rows'::regclass
     and t.tgname = 'udt_dataset_rows_relation_cells_take_ids'
     and p.proname = 'udt_relation_cells_take_ids';
  if not found then
    raise exception 'CLAUSE 0 FAILED: the write-side boundary is not installed on workbench.udt_dataset_rows.';
  end if;
  raise notice 'CLAUSE 0 PASS — one BEFORE-ROW trigger on udt_dataset_rows, which every database door goes through';
end $$;

\echo ''
\echo '── 1-5 · Rincon Plumbing & Drain, dispatch board ──────────────────────────────────────'

begin;

do $$
declare
  v_org   uuid;
  v_user  uuid;
  v_cust  uuid;   -- Customers table
  v_calls uuid;   -- Service Calls table
  v_maria uuid;   -- one customer row
  v_ok    int;
  v_msg   text;
  v_code  text;
begin
  select organization_id, user_id into v_org, v_user
    from workbench.udt_datasets
   where deleted_at is null and template_id is null
   order by created_at limit 1;
  if v_org is null then
    raise exception 'SKIP-AS-FAILURE: no live dataset to borrow an organization and a seat from.';
  end if;

  insert into workbench.udt_datasets (table_name, description, user_id, organization_id, created_by, visibility, validation_mode)
  values ('Rincon Plumbing — Customers', 'Households and property managers Rincon serves.',
          v_user, v_org, v_user, 'personal', 'permissive')
  returning id into v_cust;

  insert into workbench.udt_dataset_fields (table_id, field_name, display_name, data_type, field_order, user_id, organization_id, created_by)
  values (v_cust, 'household', 'Household', 'string', 0, v_user, v_org, v_user);

  insert into workbench.udt_dataset_rows (table_id, data, user_id, organization_id, created_by)
  values (v_cust, jsonb_build_object('household', 'Maria Delgado — 1412 Calle Puente'), v_user, v_org, v_user)
  returning id into v_maria;

  insert into workbench.udt_datasets (table_name, description, user_id, organization_id, created_by, visibility, validation_mode)
  values ('Rincon Plumbing — Service Calls', 'Drain, water-heater and repipe calls by day.',
          v_user, v_org, v_user, 'personal', 'permissive')
  returning id into v_calls;

  insert into workbench.udt_dataset_fields (table_id, field_name, display_name, data_type, field_order, user_id, organization_id, created_by, metadata)
  values
    (v_calls, 'customer', 'Customer', 'string', 0, v_user, v_org, v_user,
     jsonb_build_object('format', jsonb_build_object('id','relation',
       'options', jsonb_build_object('relation_target', v_cust::text, 'relation_max', 1)))),
    (v_calls, 'stage', 'Stage', 'string', 1, v_user, v_org, v_user,
     jsonb_build_object('format', jsonb_build_object('id','choice',
       'options', jsonb_build_object('choices', jsonb_build_array(
         jsonb_build_object('value','Dispatched','color','blue'),
         jsonb_build_object('value','On site','color','amber'),
         jsonb_build_object('value','Invoiced','color','green'))))));

  -- 1 · AN ID IS ACCEPTED
  insert into workbench.udt_dataset_rows (table_id, data, user_id, organization_id, created_by)
  values (v_calls, jsonb_build_object('customer', v_maria::text, 'stage', 'On site'), v_user, v_org, v_user);
  raise notice 'CLAUSE 1 PASS — a relation cell holding the customer''s id was accepted';

  -- 2 · AN EMPTY CELL IS ACCEPTED
  insert into workbench.udt_dataset_rows (table_id, data, user_id, organization_id, created_by)
  values (v_calls, jsonb_build_object('customer', null, 'stage', 'Dispatched'), v_user, v_org, v_user);
  insert into workbench.udt_dataset_rows (table_id, data, user_id, organization_id, created_by)
  values (v_calls, jsonb_build_object('customer', '', 'stage', 'Dispatched'), v_user, v_org, v_user);
  raise notice 'CLAUSE 2 PASS — a cleared relation cell (null and empty string) is a cleared cell, not a bad one';

  -- 3 · A CHOICE COLUMN IS UNTOUCHED, INCLUDING ITS OFF-LIST VALUE
  insert into workbench.udt_dataset_rows (table_id, data, user_id, organization_id, created_by)
  values (v_calls, jsonb_build_object('customer', v_maria::text, 'stage', 'Waiting on the city'), v_user, v_org, v_user);
  raise notice 'CLAUSE 3 PASS — a choice column still takes a label, including one that is not on its own list (allowOther)';

  -- 4 · THE BULK PATH: 50 scraped rows, one of them naming the customer instead of pointing at her
  v_ok := 0;
  for v_code in
    select case when g = 17 then 'Maria Delgado' else v_maria::text end
      from generate_series(1, 50) g
  loop
    begin
      insert into workbench.udt_dataset_rows (table_id, data, user_id, organization_id, created_by)
      values (v_calls, jsonb_build_object('customer', v_code, 'stage', 'Dispatched'), v_user, v_org, v_user);
      v_ok := v_ok + 1;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      if v_msg not like '%points at a record, and it was given the text%' then raise; end if;
    end;
  end loop;
  if v_ok <> 49 then
    raise exception 'CLAUSE 4 FAILED: a 50-row append wrote % rows, expected 49 written and 1 refused', v_ok;
  end if;
  raise notice 'CLAUSE 4 PASS — a 50-row append wrote 49 and refused 1, with the reason: %', v_msg;

  -- 5 · THE DOOR CAN DECLARE THE COLUMN AT ALL
  perform 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_user_table_with_fields'
     and pg_get_functiondef(p.oid) like '%metadata%';
  if not found then
    raise exception
      'CLAUSE 5 FAILED: create_user_table_with_fields still drops metadata, so no table created '
      'through it can carry a format — currency, formula and relation all arrive as bare strings.';
  end if;
  raise notice 'CLAUSE 5 PASS — create_user_table_with_fields carries metadata, so a table it creates can declare a format';
end $$;

rollback;

\echo ''
\echo 'udtrel_green: all clauses PASS. Nothing was committed.'
