-- LANE OLD-TABLES-1 — W3, THE WRITE-SIDE INTEGRITY BOUNDARY. THE RED TWIN.
--
-- WHAT A RED TWIN IS FOR. The green suite proves the boundary accepts correct writes; it does
-- not prove anything is refused. This file hands a relation column a NAME through each shape a
-- door actually uses, and passes only when every one of them is refused BY NAME. Run against a
-- database where `workbench.udt_relation_cells_take_ids()` is not installed, every arm below
-- reports that the label LANDED — which is the defect W3 exists to close, and which is exactly
-- what happens today.
--
-- THE SAME USE CASE: Rincon Plumbing & Drain's dispatch board.
--
-- THE FIVE SHAPES A LABEL ARRIVES IN, AND ALL FIVE ARE REFUSED
--   1  a bare name in a single relation cell   (matrx-extend's scraped row, an agent's write)
--   2  a name inside an ARRAY                  (a multi-target relation, paste-from-Excel)
--   3  a name arriving by UPDATE, not INSERT   (`usertable_update_row`, `data.table.upsert`)
--   4  a NUMBER, which is not a name but is not an identifier either
--   5  two targets in a relation whose `relation_max` is 1
--
-- EVERY REFUSAL NAMES THE COLUMN AND WHAT IT EXPECTED. A refusal that says only "invalid input"
-- sends a person to a support queue; W3's gate is that each one names the column and the
-- expectation, and this twin asserts that, not merely that something raised.
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/udtrel_red.sql

\set ON_ERROR_STOP on
\timing off

\i scripts/campaign-tests/_preamble.sql

\echo ''
\echo '── the five shapes a label arrives in ─────────────────────────────────────────────────'

begin;

do $$
declare
  v_org uuid; v_user uuid; v_cust uuid; v_calls uuid; v_maria uuid;
  v_row uuid; v_msg text; v_n int := 0;
  v_shapes text[] := array[
    'a bare name in a single relation cell',
    'a name inside an array',
    'a name arriving by UPDATE',
    'a number where an identifier belongs',
    'two targets in a relation whose relation_max is 1'];
  v_payloads jsonb[];
  v_i int;
begin
  select organization_id, user_id into v_org, v_user
    from workbench.udt_datasets where deleted_at is null and template_id is null
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
  values (v_calls, 'customer', 'Customer', 'string', 0, v_user, v_org, v_user,
     jsonb_build_object('format', jsonb_build_object('id','relation',
       'options', jsonb_build_object('relation_target', v_cust::text, 'relation_max', 1))));

  -- A good row to UPDATE in shape 3.
  insert into workbench.udt_dataset_rows (table_id, data, user_id, organization_id, created_by)
  values (v_calls, jsonb_build_object('customer', v_maria::text), v_user, v_org, v_user)
  returning id into v_row;

  v_payloads := array[
    jsonb_build_object('customer', 'Maria Delgado'),
    jsonb_build_object('customer', jsonb_build_array('Maria Delgado')),
    null,                                                   -- shape 3 is an UPDATE, below
    jsonb_build_object('customer', 4712),
    jsonb_build_object('customer', jsonb_build_array(v_maria::text, v_maria::text))
  ];

  for v_i in 1 .. 5 loop
    begin
      if v_i = 3 then
        update workbench.udt_dataset_rows
           set data = jsonb_build_object('customer', 'Maria Delgado')
         where id = v_row;
      else
        insert into workbench.udt_dataset_rows (table_id, data, user_id, organization_id, created_by)
        values (v_calls, v_payloads[v_i], v_user, v_org, v_user);
      end if;
      raise exception
        'ARM % FAILED: % LANDED. A label is sitting in an id column and nothing refused it.',
        v_i, v_shapes[v_i];
    exception when others then
      get stacked diagnostics v_msg = message_text;
      if v_msg like 'ARM % FAILED%' then raise; end if;
      if v_msg not like '%Customer %' then
        raise exception 'ARM % FAILED: refused, but the refusal does not NAME the column — %', v_i, v_msg;
      end if;
      if v_msg not like '%points at a record%' and v_msg not like '%takes one record%' then
        raise exception 'ARM % FAILED: refused, but not by this boundary — %', v_i, v_msg;
      end if;
      v_n := v_n + 1;
      raise notice 'ARM % RED — % → %', v_i, v_shapes[v_i], v_msg;
    end;
  end loop;

  if v_n <> 5 then
    raise exception 'RED TWIN FAILED: % of 5 shapes refused', v_n;
  end if;
end $$;

rollback;

\echo ''
\echo 'udtrel_red: all five shapes REFUSED, each naming the column and what it expected. Nothing was committed.'
