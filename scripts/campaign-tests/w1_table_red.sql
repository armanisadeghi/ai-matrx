-- W1-TABLE — THE RED TWIN of `w1_table_t4_t10.sql` (rules 2 and 3).
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_table_red.sql
--
-- A guard that cannot be demonstrated FAILING is not a guard. This file turns each of
-- W1-TABLE's two guards off INSIDE ONE TRANSACTION, performs the write the green suite
-- proves is refused, and asserts it LANDS — then rolls the whole thing back, guards
-- included, because `ALTER TABLE … DISABLE TRIGGER` is itself transactional.
--
-- IT IS NOT A MIGRATION, it lives outside `migrations/`, it runs on the REHEARSAL BRANCH
-- only, and it never runs against production: the first statement refuses on any server
-- whose control-file identifier is not the branch's.
--
-- WHAT EACH RED SAYS. If an assertion below fails, the guard it names was doing NOTHING and
-- the green suite's matching refusal was passing for some other reason - a typo in the
-- write, a constraint somewhere else, an exception handler catching the wrong thing.

\set ON_ERROR_STOP on
\timing off

begin;

do $r$
declare
  v_org        constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_kernel_org constant uuid := '11111111-0000-4000-8000-000000000004';
  v_hq         uuid;
  v_project    uuid;
  v_prev       uuid;
  v_next       uuid;
  v_landed     uuid;
  v_n          integer;
  v_ids        uuid[];
  v_x          uuid;
  v_risk       uuid;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w1_table_red.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_kernel_org, 'record', jsonb_build_object('name', 'W1-TABLE RED HQ'))
  returning id into v_hq;

  v_project := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Project', 'slug', 'project',
    'label_singular', 'Project', 'label_plural', 'Projects',
    'type', 'entity', 'display', 'page', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'name', 'kind', 'text')),
    'title_field', 'name', 'parent_id', v_hq::text));

  -- ── RED 1: the containment trigger, at the depth-17 edge ─────────────────────
  v_prev := v_hq;
  for i in 2..16 loop
    insert into custom.record (organization_id, table_id, data, data_class)
    values (v_org, v_project,
            jsonb_build_object('name', format('chain %s', i), 'parent_id', v_prev::text), 'record')
    returning id into v_next;
    v_prev := v_next;
  end loop;

  alter table custom.record disable trigger custom_record_containment_guard;

  insert into custom.record (organization_id, table_id, data, data_class)
  values (v_org, v_project,
          jsonb_build_object('name', 'chain 17', 'parent_id', v_prev::text), 'record')
  returning id into v_landed;
  if v_landed is null then
    raise exception 'RED 1 did not go red: a depth-17 record did not land with custom_record_containment_guard DISABLED, so that trigger is not what refuses it';
  end if;
  select max(depth) into v_n from custom.containment_chain(v_org, v_landed);
  if v_n <> 16 then
    raise exception 'RED 1: the record that landed sits % ancestors up, expected 16', v_n;
  end if;
  raise notice 'RED 1 - with custom_record_containment_guard DISABLED, a record at depth 17 LANDED (id %, 16 ancestors). The ceiling is that trigger and nothing else.', v_landed;

  -- and the cycle, with the same trigger off.
  update custom.record
     set data = data || jsonb_build_object('parent_id', v_landed::text)
   where organization_id = v_org and id = v_hq;
  select custom.containment_parent(data) into v_next from custom.record where organization_id = v_org and id = v_hq;
  if v_next is distinct from v_landed then
    raise exception 'RED 1b did not go red: a reparent under a descendant did not take with the guard DISABLED';
  end if;
  raise notice 'RED 1b - with the same trigger DISABLED, a reparent under its own deepest descendant LANDED. "this would put it inside itself" comes from the trigger.';

  -- put the cycle back before anything else walks the tree.
  update custom.record set data = data - 'parent_id'
   where organization_id = v_org and id = v_hq;
  alter table custom.record enable trigger custom_record_containment_guard;

  -- ── RED 2: the Table shape guard ─────────────────────────────────────────────
  alter table custom.record disable trigger custom_record_table_shape_guard;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.table_kernel_id(), 'table',
          jsonb_build_object('name', 'Untitled', 'slug', 'untitled',
                             'type', 'entity', 'parent_id', v_hq::text))
  returning id into v_landed;
  if v_landed is null then
    raise exception 'RED 2 did not go red: a Table with no title field, no display, no weight and no retention did not land with the shape guard DISABLED';
  end if;
  -- read back through the projection, not out of the jsonb we just wrote
  select count(*) into v_n from custom."table" where id = v_landed and title_field is null;
  if v_n <> 1 then
    raise exception 'RED 2: the half-declared Table did not read back through custom."table" with a null title field';
  end if;
  raise notice 'RED 2 - with custom_record_table_shape_guard DISABLED, a Table carrying nothing but a name, a slug, a type and a Home LANDED (id %) and reads back with NO title field. REC-1 and REC-2 are that trigger.', v_landed;

  alter table custom.record enable trigger custom_record_table_shape_guard;

  -- ── RED 3: T10's Home assertion is not vacuous ───────────────────────────────
  -- Remove the additional-Home relations and the same positive assertion the green suite
  -- makes goes false, which is what stops it being a query that could never fail.
  insert into custom.record (organization_id, table_id, data, data_class)
  values (v_org, v_project, jsonb_build_object('name', 'Project X', 'parent_id', v_hq::text), 'record')
  returning id into v_x;
  v_risk := custom.table_declare(v_org, jsonb_build_object(
    'name', 'Risk', 'slug', 'risk',
    'label_singular', 'Risk', 'label_plural', 'Risks',
    'type', 'entity', 'display', 'list', 'ordered', false,
    'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_hq::text));
  perform custom.home_add(v_org, v_risk, v_x);

  select array_agg(table_id) into v_ids from custom.tables_at_home(v_org, array[v_x]);
  if not (v_risk = any (v_ids)) then
    raise exception 'RED 3 setup: Risk is not at Home in X even with its relation present';
  end if;

  delete from custom.record
   where organization_id = v_org and data_class = 'relation'
     and (data ->> 'to')::uuid = v_risk and (data ->> 'from')::uuid = v_x;

  select array_agg(table_id) into v_ids from custom.tables_at_home(v_org, array[v_x]);
  if v_risk = any (coalesce(v_ids, '{}'::uuid[])) then
    raise exception 'RED 3 did not go red: Risk is still at Home in X after its only placement there was removed, so custom.home is not reading the relation at all';
  end if;
  raise notice 'RED 3 - with the referenced carrying relation removed, Risk is no longer at Home in X. custom.home''s `additional` branch is what T10 reads.';

  raise notice 'W1-TABLE RED SUITE COMPLETE - every guard the green suite relies on has been shown failing';
end;
$r$;

rollback;
