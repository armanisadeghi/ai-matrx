-- LANE V1-STORE-FIXES — THE RED. The three things `V1-STORE` observed at 00:20 UTC on
-- 2026-09-18, reproduced by this lane's own hands against the LIVE objects on the rehearsal
-- branch, before a byte of the fix is written.
--
-- This file is the falsifiable statement of the defects. Every block below asserts that the
-- WRONG thing happens; each one therefore turns RED (raises) the moment its fix lands, and
-- `v1store_fixes_green.sql` asserts the right thing in its place. Run this file BEFORE the
-- migrations and it passes; run it AFTER and it fails, naming which fix closed which hole.
--
--   1. ORGANIZATIONS ARE NOT WALLS IN THE STORE (REC-29). A record of organization B is
--      accepted carrying a `table_id` that is a Table record of organization A; a
--      `relation` row of organization B is accepted whose `from`/`to` point at
--      organization A's records; and a relation Field of organization B is accepted
--      declaring organization A's Table as its `relation_target`. Nothing anywhere refuses.
--      (The sites that ARE closed today - `parent_id`, `entity_definition_id`,
--      `options_table_id`, `scope_table_id`, `target_field_id`, the Rule expression's field
--      leaves, and a relation field's VALUE (REC-51) - are asserted CLOSED in block 1d, so
--      this file also states what must not regress.)
--
--   2. DELETE HAS NO DOOR (REC-23). `custom._store_door` is attached to
--      `custom.external_link` and `custom.external_source` and NOT to `custom.record`;
--      every BEFORE trigger on `custom.record` is `INSERT OR UPDATE` only. So with
--      `custom/system_enabled` resolving false - the state every clause in this campaign is
--      proven under - a role that is no member of the store's owner is refused an INSERT by
--      name and its hard DELETE LANDS, taking the row out of the store for good on a law
--      (REC-23) that says delete is soft within `retention` and reversible within it.
--
--   3. A PROMOTION THAT MOVED NOTHING REPORTS SUCCESS. `custom.promote_table` runs its
--      `update custom.record set data = data || '{"storage":"heavy"}'`, matches ZERO rows,
--      and returns a result object all the same. `V1-STORE` met it under RLS; the 0-row
--      branch is reached here without RLS, by naming a Table of another organization, which
--      is the same UPDATE matching the same zero rows.
--      Its siblings, censused from `pg_proc` over every function in `custom` that writes
--      (block 3b), are the two INSTEAD OF writers `custom._field_definition_write` and
--      `custom._rule_definition_write`: both run `update custom.record ...` in their UPDATE
--      and DELETE arms and neither reads a row count, while an INSTEAD OF trigger reports
--      one row to the client whatever the UPDATE matched.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and its one
-- transaction ends in ROLLBACK - the disposable organization and role it creates are created
-- inside that transaction and disappear with it.
--
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/v1store_fixes_red.sql

\set ON_ERROR_STOP on
\timing off

begin;

-- The branch, and only the branch. `pg_control_system()` is the cluster's control-file id
-- (§5.3); production's is 7642734024280108049 and this file refuses to run there.
do $b$
begin
  if (select system_identifier from pg_control_system()) <> 7678069749886157684 then
    raise exception 'v1store_fixes_red.sql runs on the rehearsal branch only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $b$;

-- BYPASSRLS on purpose, and it is the point rather than a convenience: RLS is a row
-- VISIBILITY filter and the door is the write barrier, and the standing fact this campaign
-- publishes is that ONE door predicate guards every write path in `custom`. A role RLS
-- happens to hide the row from proves nothing about the door; this role removes the filter
-- so the door is the only thing left that could refuse - and on DELETE there is none.
create role zz_v1store_red nologin bypassrls;
grant usage on schema custom to zz_v1store_red;
grant select, insert, update, delete on custom.record to zz_v1store_red;
do $g$ begin execute format('grant zz_v1store_red to %I', current_user); end $g$;

do $t$
declare
  v_org_a   uuid;
  v_table_a uuid;
  v_rec_a   uuid;
  v_org_b   uuid := gen_random_uuid();
  v_home_b  uuid;
  v_table_b uuid;
  v_field_b uuid;
  v_id      uuid;
  v_n       integer;
  v_answer  jsonb;
  v_state   text;
  v_msg     text;
begin
  -- ---------------------------------------------------------------- fixtures, two organizations
  select r.organization_id, r.id into v_org_a, v_table_a
    from custom.record r
   where r.table_id = custom.table_kernel_id() and r.data_class = 'table'
     and r.deleted_at is null
   order by r.created_at limit 1;
  if v_table_a is null then
    raise exception 'RED cannot run: organization A has no declared Table in custom.record';
  end if;
  select r.id into v_rec_a from custom.record r
   where r.organization_id = v_org_a and r.data_class = 'record' and r.deleted_at is null
   order by r.created_at limit 1;

  insert into iam.organizations (id, name, slug, abbreviation)
  values (v_org_b, 'ZZ V1STORE Red', 'zz-v1store-red', 'ZZR');

  -- ============================================================ 1a. another organization's Table
  insert into custom.record (organization_id, table_id, data)
  values (v_org_b, v_table_a, jsonb_build_object('note', 'the wall is open'))
  returning id into v_id;
  select count(*) into v_n from custom.record
   where organization_id = v_org_b and id = v_id and table_id = v_table_a;
  if v_n <> 1 then
    raise exception 'RED 1a is already fixed: a cross-organization table_id was refused';
  end if;
  raise notice 'RED 1a — a record of organization B landed carrying organization A''s Table % ', v_table_a;

  -- ==================================================== 1b. another organization's relation ends
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org_b, null, 'relation',
          jsonb_build_object('kind', 'referenced', 'carrying', false, 'role', 'test',
                             'from', v_id, 'to', coalesce(v_rec_a, v_table_a)))
  returning id into v_id;
  if not exists (select 1 from custom.record where organization_id = v_org_b and id = v_id) then
    raise exception 'RED 1b is already fixed: a cross-organization relation payload was refused';
  end if;
  raise notice 'RED 1b — a relation of organization B landed pointing at organization A''s record';

  -- ========================================= 1c. another organization's Table as a relation TARGET
  -- The fixture: a Home, a Table, and a relation Field of organization B whose declared
  -- `relation_target` is organization A's Table.
  insert into custom.record (organization_id, table_id, data)
  values (v_org_b, null, jsonb_build_object('name', 'Home of B')) returning id into v_home_b;

  v_table_b := custom.table_declare(v_org_b, jsonb_build_object(
    'type', 'entity', 'name', 'Order', 'slug', 'order',
    'label_singular', 'Order', 'label_plural', 'Orders',
    'display', 'page', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'title_field', 'name', 'parent_id', v_home_b::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'name'),
                                jsonb_build_object('name', 'supplier'))));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org_b, custom.field_kernel_id(), 'field', jsonb_build_object(
    'entity_definition_id', v_table_b::text, 'key', 'supplier', 'label', 'Supplier',
    'type', 'relation', 'multi', false, 'dated', false, 'rules', '[]'::jsonb,
    'source', 'manual', 'sensitivity', 'internal', 'context_policy', 'include',
    'depends_on', '[]'::jsonb, 'applies_to_types', '[]'::jsonb,
    'relation_target', v_table_a::text, 'relation_max', 1, 'on_target_delete', 'set_null'))
  returning id into v_field_b;

  if not exists (select 1 from custom.record where organization_id = v_org_b and id = v_field_b) then
    raise exception 'RED 1c is already fixed: a cross-organization relation_target was refused';
  end if;
  raise notice 'RED 1c — a relation field of organization B declares organization A''s Table as its target';

  -- ============================================ 1d. what IS closed today, and must not regress
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org_b, null, jsonb_build_object('parent_id', coalesce(v_rec_a, v_table_a)::text));
    raise exception 'RED 1d: containment across organizations was ACCEPTED - a closed site opened';
  exception when foreign_key_violation then
    raise notice 'RED 1d(i) — containment across organizations is already refused, as it must stay';
  end;
  -- REC-51, W1-VAL's: a relation field's VALUE is already checked against a live record of the
  -- declared table IN THIS ORGANIZATION, so the value site is closed and stays closed.
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org_b, v_table_b, jsonb_build_object('name', 'PO-1',
                                                   'supplier', coalesce(v_rec_a, v_table_a)::text));
    raise exception 'RED 1d: a cross-organization relation VALUE was ACCEPTED - a closed site opened';
  exception when check_violation then
    raise notice 'RED 1d(ii) — a relation VALUE across organizations is already refused, as it must stay';
  end;

  -- ====================================================================== 2. DELETE has no door
  if coalesce((platform.knob_resolve('custom', 'system_enabled', null) #>> '{}')::boolean, false) then
    raise exception 'RED 2 cannot run: custom/system_enabled resolves TRUE, and the whole campaign is proven with it false';
  end if;

  select count(*) into v_n
    from pg_trigger t
   where t.tgrelid = 'custom.record'::regclass and not t.tgisinternal
     and (t.tgtype::int & 8) > 0 and (t.tgtype::int & 2) > 0;
  if v_n <> 0 then
    raise exception 'RED 2 is already fixed: custom.record carries % BEFORE DELETE trigger(s)', v_n;
  end if;

  set local role zz_v1store_red;
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org_b, null, jsonb_build_object('note', 'should be refused'));
    reset role;
    raise exception 'RED 2 cannot run: the INSERT control was NOT refused, so the switch is not holding at all';
  exception when insufficient_privilege then
    null;   -- the control: the same role, the same table, refused by the door on INSERT
  end;
  reset role;

  insert into custom.record (id, organization_id, table_id, data)
  values (gen_random_uuid(), v_org_b, null, jsonb_build_object('note', 'hard delete me'))
  returning id into v_id;

  set local role zz_v1store_red;
  delete from custom.record where organization_id = v_org_b and id = v_id;
  get diagnostics v_n = row_count;
  reset role;
  if v_n <> 1 then
    raise exception 'RED 2 is already fixed: the hard DELETE was refused or matched nothing (% rows)', v_n;
  end if;
  if exists (select 1 from custom.record where organization_id = v_org_b and id = v_id) then
    raise exception 'RED 2 is already fixed: the row survived the hard DELETE';
  end if;
  raise notice 'RED 2 — the same role the INSERT door refused hard-DELETED a row out of the store';

  -- ============================================= 3. a promotion that moved nothing says success
  v_state := custom.table_storage(v_org_a, v_table_a);
  v_answer := custom.promote_table(v_org_b, v_table_a);   -- organization B does not own that Table
  select count(*) into v_n from custom.record
   where organization_id = v_org_b and id = v_table_a;
  if v_n <> 0 then
    raise exception 'RED 3 fixture is wrong: organization B holds that Table after all';
  end if;
  if v_answer is null then
    raise exception 'RED 3 is already fixed: custom.promote_table returned nothing';
  end if;
  if custom.table_storage(v_org_a, v_table_a) is distinct from v_state then
    raise exception 'RED 3 fixture is wrong: organization A''s Table moved';
  end if;
  raise notice 'RED 3 — promote_table updated 0 rows and returned %', v_answer;

  -- ================================== 3b. the siblings, censused from the catalogue
  -- `custom._field_definition_write` and `custom._rule_definition_write` are INSTEAD OF
  -- writers: their UPDATE and DELETE arms run an `update custom.record ... where ...` and
  -- return `new` / `old` whatever it matched, and an INSTEAD OF trigger reports ONE row to
  -- the client regardless. So a write that the view shows but the store does not take -
  -- an RLS UPDATE policy that filters it, a row soft-deleted in between - is reported as a
  -- change that happened. The statement is a catalogue one because the reachable route needs
  -- an RLS identity, and a fix is owed either way: neither body counts its rows.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.proname in ('_field_definition_write', '_rule_definition_write')
     and p.prosrc ~* 'update\s+custom\.record'
     and p.prosrc !~* '(get\s+diagnostics|not\s+found)';
  if v_n <> 2 then
    raise exception 'RED 3b is already fixed: % of the 2 INSTEAD OF writers still count no rows', v_n;
  end if;
  raise notice 'RED 3b — both INSTEAD OF writers UPDATE custom.record and check no row count';

  raise notice 'RED: all three findings reproduced. Every block above turns RED when its fix lands.';
exception when others then
  get stacked diagnostics v_msg = message_text;
  raise exception 'RED stopped: %', v_msg;
end $t$;

rollback;
