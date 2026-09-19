-- LANE V1-STORE-FIXES — THE GREEN. The twin of `v1store_fixes_red.sql`: every block below
-- asserts the RIGHT thing where the RED asserted the wrong one, against the SAME live objects
-- on the rehearsal branch.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGE, NAMED (rule 3), one per block:
--   1. drop `custom_record_organization_wall` (or take the `pg_partition_root` resolution back
--      out of `custom._organization_wall_guard`, which is how the wall passed everything while
--      every catalogue check read green) and blocks 1a-1c fail naming the row that landed.
--      Remove a site from `custom.organization_references` and its own block fails.
--   2. drop `custom_record_store_door`, or put `custom._store_door` back to its
--      INSERT-OR-UPDATE-only body, and block 2 fails naming the row that was deleted for good.
--      Delete `custom.record_delete` and the remedy the refusal names stops existing, which
--      block 2d catches.
--   3. take `get diagnostics ... row_count` back out of `custom.promote_table` and block 3
--      fails on the success object it returns for a caller who changed nothing; take it out of
--      either INSTEAD OF writer and block 3b fails.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE (rule 3), in every block, because a wall that
-- refuses everything passes a test that only checks refusals:
--   · 1a pairs the refused cross-organization Table with the SAME insert against this
--     organization's own Table (lands) and with a KERNEL Table owned by another organization
--     (lands - REC-27's shared vocabulary is the named exemption);
--   · 1b pairs the refused relation with the SAME relation after its Table declares
--     `cross_organization_relations` (lands - REC-29's own "unless the Table allows it");
--   · 1d asserts the five sites that were ALREADY closed still refuse in their own words, so a
--     wall that swallowed their better messages fails here;
--   · 2 pairs the refused hard DELETE with the owner's hard DELETE (lands - the retention
--     lane), and runs the refusal with the store's switch OFF **and ON**, so the REC-23 arm is
--     proven not to be dead code hiding behind the switch;
--   · 3 pairs the refusal with a real promotion that returns `table_rows_changed = 1`.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and its one
-- transaction ends in ROLLBACK - the disposable organizations, the disposable role and the one
-- knob flip it makes are all created inside that transaction and disappear with it.
--
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/v1store_fixes_green.sql

\set ON_ERROR_STOP on
\timing off

begin;

do $b$
begin
  if (select system_identifier from pg_control_system()) <> 7678069749886157684 then
    raise exception 'v1store_fixes_green.sql runs on the rehearsal branch only, and this is %',
      (select system_identifier from pg_control_system());
  end if;
end $b$;

create role zz_v1store_green nologin bypassrls;
grant usage on schema custom to zz_v1store_green;
grant select, insert, update, delete on custom.record to zz_v1store_green;
-- Block 2b runs the delete refusal with the store switched ON, and `platform.knob_resolve` is
-- SECURITY INVOKER: a role that cannot SEE the knob rows reads the switch as CLOSED (that is
-- `custom.store_is_open`'s documented trap, and it is correct - a switch this writer cannot
-- read is closed, never open). So this probe is given exactly the reads the switch checklist
-- will give `authenticated`, and nothing else - otherwise block 2b would prove the OFF switch
-- a second time instead of proving REC-23.
grant usage on schema platform to zz_v1store_green;
grant select on platform.feature_knob, platform.knob_override,
                platform.knob_scope_kind, platform.knob_rung_lock to zz_v1store_green;
-- HARNESS REPAIR, W1-ORG 2026-09-18 (rule 20). Block 2b stopped with `permission denied for
-- function assert_store_door`: `custom.assert_store_door(uuid,text)` carries
-- `{postgres=X/postgres}` and nothing else, so the disposable writer could not reach the door
-- it is supposed to be judged by, and the block was measuring a missing GRANT instead of
-- REC-23. The probe stands in for `authenticated`, which the switch checklist grants EXECUTE on
-- the door, so it is given exactly that and nothing more. This changes no law: the door's own
-- refusal is still what the block asserts.
grant execute on function custom.assert_store_door(uuid, text) to zz_v1store_green;
grant execute on function custom.caller_role() to zz_v1store_green;
grant execute on function custom.store_is_open(uuid) to zz_v1store_green;
do $g$ begin execute format('grant zz_v1store_green to %I', current_user); end $g$;

do $t$
declare
  v_org_a    uuid;
  v_table_a  uuid;
  v_rec_a    uuid;
  v_kernel   uuid := custom.table_kernel_id();
  v_org_b    uuid := gen_random_uuid();
  v_home_b   uuid;
  v_table_b  uuid;
  v_rec_b    uuid;
  v_id       uuid;
  v_n        integer;
  v_at       timestamptz;
  v_answer   jsonb;
  v_msg      text;
  v_caught   text;
begin
  select r.organization_id, r.id into v_org_a, v_table_a
    from custom.record r
   where r.table_id = v_kernel and r.data_class = 'table' and r.deleted_at is null
   order by r.created_at limit 1;
  select r.id into v_rec_a from custom.record r
   where r.organization_id = v_org_a and r.data_class = 'record' and r.deleted_at is null
   order by r.created_at limit 1;

  insert into iam.organizations (id, name, slug, abbreviation)
  values (v_org_b, 'ZZ V1STORE Green', 'zz-v1store-green', 'ZZG');

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

  -- ================================================= 1a. the wall, and its two positive controls
  v_caught := null;
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org_b, v_table_a, '{}'::jsonb);
  exception when foreign_key_violation then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is distinct from 'the table this record belongs to belongs to a different organization' then
    raise exception 'GREEN 1a: a record carrying ANOTHER organization''s Table was not refused by name (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;

  insert into custom.record (organization_id, table_id, data)
  values (v_org_b, v_table_b, jsonb_build_object('name', 'PO-1'))
  returning id into v_rec_b;                      -- control: this organization's own Table lands

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org_b, v_kernel, 'table', jsonb_build_object(
    'type', 'entity', 'name', 'Second', 'slug', 'second',
    'label_singular', 'Second', 'label_plural', 'Seconds',
    'display', 'page', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'title_field', 'name', 'parent_id', v_home_b::text,
    'fields', jsonb_build_array(jsonb_build_object('name', 'name'))))
  returning id into v_id;                         -- control: the KERNEL Table, owned by another
  if v_id is null then                            -- organization, is the named exemption
    raise exception 'GREEN 1a: the kernel Table exemption was refused, and every organization needs it';
  end if;
  raise notice 'GREEN 1a — a foreign Table is refused; this organization''s own Table and the kernel both land';

  -- ============================ 1b. the relation ends, and REC-29's own "unless the Table allows it"
  v_caught := null;
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org_b, null, 'relation',
            jsonb_build_object('kind', 'referenced', 'carrying', false, 'role', 'test',
                               'from', v_rec_b, 'to', coalesce(v_rec_a, v_table_a)));
  exception when foreign_key_violation then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is distinct from 'the record this relation points at belongs to a different organization' then
    raise exception 'GREEN 1b: a relation into another organization was not refused by name (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;

  -- THE SECOND INPUT, WITH A DIFFERENT EXPECTED VALUE: the Table the relation starts FROM
  -- declares that it allows it, and the very same write lands.
  update custom.record
     set data = data || jsonb_build_object('cross_organization_relations', true)
   where organization_id = v_org_b and id = v_table_b;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org_b, null, 'relation',
          jsonb_build_object('kind', 'referenced', 'carrying', false, 'role', 'test',
                             'from', v_rec_b, 'to', coalesce(v_rec_a, v_table_a)))
  returning id into v_id;
  if v_id is null then
    raise exception 'GREEN 1b: the Table allowed it and the relation was still refused';
  end if;
  update custom.record
     set data = data - 'cross_organization_relations'
   where organization_id = v_org_b and id = v_table_b;
  raise notice 'GREEN 1b — a relation across organizations is refused, and lands once the Table allows it';

  -- ==================================================== 1c. a Field's declared relation target
  v_caught := null;
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org_b, custom.field_kernel_id(), 'field', jsonb_build_object(
      'entity_definition_id', v_table_b::text, 'key', 'supplier', 'label', 'Supplier',
      'type', 'relation', 'multi', false, 'dated', false, 'rules', '[]'::jsonb,
      'source', 'manual', 'sensitivity', 'internal', 'context_policy', 'include',
      'depends_on', '[]'::jsonb, 'applies_to_types', '[]'::jsonb,
      'relation_target', v_table_a::text, 'relation_max', 1, 'on_target_delete', 'set_null'));
  exception when foreign_key_violation then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is distinct from 'the table this relation field points at belongs to a different organization' then
    raise exception 'GREEN 1c: a relation field pointing at another organization''s Table was not refused by name (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;
  raise notice 'GREEN 1c — a Field may not declare another organization''s Table as its target';

  -- ================================ 1d. the sites that were already closed keep their own words
  v_caught := null;
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org_b, null, jsonb_build_object('parent_id', coalesce(v_rec_a, v_table_a)::text));
  exception when foreign_key_violation then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is distinct from 'that container is not in this organization' then
    raise exception 'GREEN 1d: containment lost its own refusal - the wall swallowed a better message (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org_b, custom.field_kernel_id(), 'field', jsonb_build_object(
    'entity_definition_id', v_table_b::text, 'key', 'supplier', 'label', 'Supplier',
    'type', 'relation', 'multi', false, 'dated', false, 'rules', '[]'::jsonb,
    'source', 'manual', 'sensitivity', 'internal', 'context_policy', 'include',
    'depends_on', '[]'::jsonb, 'applies_to_types', '[]'::jsonb,
    'relation_target', v_table_b::text, 'relation_max', 1, 'on_target_delete', 'set_null'));
  v_caught := null;
  begin
    insert into custom.record (organization_id, table_id, data)
    values (v_org_b, v_table_b, jsonb_build_object('name', 'PO-2',
                                                   'supplier', coalesce(v_rec_a, v_table_a)::text));
  exception when check_violation then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null then
    raise exception 'GREEN 1d: a relation VALUE reaching another organization was accepted (REC-51 regressed)';
  end if;
  raise notice 'GREEN 1d — containment and REC-51''s value check still refuse in their own words';

  -- ==================================================== 2. the delete door, switch OFF then ON
  if coalesce((platform.knob_resolve('custom', 'system_enabled', null) #>> '{}')::boolean, false) then
    raise exception 'GREEN 2 cannot run: custom/system_enabled resolves TRUE at entry';
  end if;

  insert into custom.record (organization_id, table_id, data)
  values (v_org_b, null, jsonb_build_object('note', 'the row the door protects'))
  returning id into v_id;

  set local role zz_v1store_green;
  v_caught := null;
  begin
    delete from custom.record where organization_id = v_org_b and id = v_id;
  exception when insufficient_privilege then
    get stacked diagnostics v_caught = message_text;
  end;
  reset role;
  if v_caught is null then
    raise exception 'GREEN 2a: a hard DELETE by a non-owner was NOT refused with the store switched off';
  end if;
  if not exists (select 1 from custom.record where organization_id = v_org_b and id = v_id) then
    raise exception 'GREEN 2a: the row is gone, so something took the delete anyway';
  end if;

  -- 2b. THE SAME REFUSAL WITH THE STORE SWITCHED ON — this is what proves REC-23 is a law of
  -- its own and not an accident of the OFF switch. The knob flip is inside this transaction
  -- and dies with it.
  update platform.feature_knob set value = 'true'::jsonb
   where feature = 'custom' and key = 'system_enabled';
  if not coalesce((platform.knob_resolve('custom', 'system_enabled', v_org_b) #>> '{}')::boolean, false) then
    raise exception 'GREEN 2b fixture is wrong: the switch did not read TRUE after the flip';
  end if;
  set local role zz_v1store_green;
  v_caught := null;
  begin
    delete from custom.record where organization_id = v_org_b and id = v_id;
  exception when insufficient_privilege then
    get stacked diagnostics v_caught = message_text;
  end;
  reset role;
  if v_caught is distinct from format('Records are not deleted for good here, so %s did not take that deletion.', 'custom.record') then
    raise exception 'GREEN 2b: with the store switched ON a hard DELETE was not refused by REC-23 (got %)',
                    coalesce(v_caught, 'no refusal at all');
  end if;
  update platform.feature_knob set value = 'false'::jsonb
   where feature = 'custom' and key = 'system_enabled';

  -- 2c. THE POSITIVE CONTROL: the role that owns the store - the retention lane - still deletes.
  delete from custom.record where organization_id = v_org_b and id = v_id;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'GREEN 2c: the owner''s hard DELETE matched % rows, and the retention lane needs it', v_n;
  end if;

  -- 2d. THE REMEDY THE REFUSAL NAMES IS REAL, AND REVERSIBLE (REC-23).
  insert into custom.record (organization_id, table_id, data)
  values (v_org_b, null, jsonb_build_object('note', 'soft delete me')) returning id into v_id;
  v_at := custom.record_delete(v_org_b, v_id);
  if v_at is null or not exists (select 1 from custom.record
                                  where organization_id = v_org_b and id = v_id and deleted_at is not null) then
    raise exception 'GREEN 2d: custom.record_delete did not mark the record deleted';
  end if;
  perform custom.record_restore(v_org_b, v_id);
  if exists (select 1 from custom.record
              where organization_id = v_org_b and id = v_id and deleted_at is not null) then
    raise exception 'GREEN 2d: custom.record_restore did not bring the record back';
  end if;
  -- and the two ways to change nothing are told apart rather than both answering nothing
  v_caught := null;
  begin
    perform custom.record_delete(v_org_b, gen_random_uuid());
  exception when sqlstate '02000' then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is null or v_caught not like 'There is no record %' then
    raise exception 'GREEN 2d: deleting a record that is not here did not say so (got %)', coalesce(v_caught, 'nothing');
  end if;
  perform custom.record_delete(v_org_b, v_id);
  v_caught := null;
  begin
    perform custom.record_delete(v_org_b, v_id);
  exception when sqlstate '02000' then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is distinct from 'That record was already deleted, so nothing changed.' then
    raise exception 'GREEN 2d: deleting an already-deleted record did not say so (got %)', coalesce(v_caught, 'nothing');
  end if;
  perform custom.record_restore(v_org_b, v_id);
  raise notice 'GREEN 2 — the door refuses a hard delete with the switch off AND on, the owner still deletes, and the soft delete is reversible';

  -- ================================================= 3. a promotion that moved nothing says so
  v_caught := null;
  begin
    perform custom.promote_table(v_org_b, v_table_a);   -- organization B does not own that Table
  exception when foreign_key_violation then
    get stacked diagnostics v_caught = message_text;
  end;
  if v_caught is distinct from 'That is not a table of this organization, so there was nothing to move.' then
    raise exception 'GREEN 3: promote_table did not refuse a Table of another organization (got %)',
                    coalesce(v_caught, 'no refusal - it returned an answer');
  end if;

  -- THE POSITIVE CONTROL: a real Table of this organization is promoted and the answer now
  -- carries the row count the guard reads.
  v_answer := custom.promote_table(v_org_b, v_table_b);
  if (v_answer ->> 'now') is distinct from 'heavy' then
    raise exception 'GREEN 3: a real promotion did not land heavy, it answered %', v_answer;
  end if;
  if (v_answer ->> 'table_rows_changed')::bigint <> 1 then
    raise exception 'GREEN 3: a real promotion reported % rows changed, and it changed one', v_answer ->> 'table_rows_changed';
  end if;
  raise notice 'GREEN 3 — promote_table refuses a no-op and reports its row count on a real promotion';

  -- ============================= 3b. the siblings read their row count, from the catalogue again
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.proname in ('_field_definition_write', '_rule_definition_write')
     and p.prosrc ~* 'update\s+custom\.record'
     and p.prosrc !~* '(get\s+diagnostics|not\s+found)';
  if v_n <> 0 then
    raise exception 'GREEN 3b: % of the 2 INSTEAD OF writers still count no rows', v_n;
  end if;
  -- and the whole class, not the two instances: every function in `custom` that UPDATEs or
  -- DELETEs the store reads a row count.
  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.prosrc ~* '(update\s+custom\.|delete\s+from\s+custom\.)'
     and p.prosrc !~* '(get\s+diagnostics|not\s+found)';
  if v_n <> 0 then
    raise exception 'GREEN 3b: % function(s) in custom change rows without reading a row count: %',
      v_n,
      (select string_agg(p.proname, ', ') from pg_proc p
        where p.pronamespace = 'custom'::regnamespace
          and p.prosrc ~* '(update\s+custom\.|delete\s+from\s+custom\.)'
          and p.prosrc !~* '(get\s+diagnostics|not\s+found)');
  end if;
  raise notice 'GREEN 3b — every function in custom that changes rows reads its row count';

  raise notice 'GREEN: all three findings closed, each with a control that could have failed.';
exception when others then
  get stacked diagnostics v_msg = message_text;
  raise exception 'GREEN stopped: %', v_msg;
end $t$;

rollback;
