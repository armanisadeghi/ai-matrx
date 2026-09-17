-- LANE W1-V1-FIXES — THE RED. The five things `V1-MODEL` observed, reproduced by this
-- lane's own hands against the LIVE objects, before a byte of the fix is written.
--
-- This file is the falsifiable statement of the defects. Every block below asserts that
-- the WRONG thing happens; each one therefore turns RED (raises) the moment its fix lands,
-- and `v1_fixes_green.sql` asserts the right thing in its place. Run this file BEFORE the
-- migrations and it passes; run it AFTER and it fails, naming which fix closed which hole.
--
--   1. THE OFF SWITCH DOES NOT HOLD THROUGH THE DOOR. With `custom/system_enabled`
--      resolving false, a role that is no member of `custom.record`'s owner is refused a
--      direct INSERT by name — and the SAME role's `custom.record_write(...)` LANDS,
--      because that door is SECURITY DEFINER owned by the table's owner and the guard
--      asks `current_user`, which the door has already rewritten to the owner.
--   2. A WRITE WITH NO CALLER-OPENED ENVELOPE CARRIES NO AUTHOR AND NO VERSION. The
--      envelope is built only over the keys a caller put in `_values`, so an ordinary
--      write stores none: `custom.value_read` answers `actor` NULL and `value_version` 1,
--      and 1 again after the value has moved.
--   3. AN AGENT WRITE WITH NO `_on_behalf_of` LANDS UNREMARKED. The converse arm is
--      enforced (a `user` write claiming `_on_behalf_of` is refused by name); this one is
--      not enforced at all.
--   4. A 5 MB VALUE LANDS. No per-value and no per-document ceiling exists anywhere in
--      the write path, published or enforced.
--
--   (Finding 5, concurrency, needs two committing sessions and cannot be proven inside one
--    rolled-back transaction. Its harness is `scripts/campaign-tests/v1_fixes_concurrency.sh`.)
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and its one
-- transaction ends in ROLLBACK — the disposable role it creates is created inside that
-- transaction and disappears with it.
--
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/v1_fixes_red.sql

\set ON_ERROR_STOP on
\timing off

begin;

create role zz_v1_fixes_writer nologin;
grant usage on schema custom to zz_v1_fixes_writer;
grant select, insert, update on custom.record to zz_v1_fixes_writer;
grant execute on function custom.record_write(uuid,uuid,jsonb) to zz_v1_fixes_writer;
-- The connected role must be a MEMBER of the disposable one to SET ROLE to it. Membership
-- runs that way round only: the disposable role is still no member of custom.record's
-- owner, which is what the door asks about.
do $g$ begin execute format('grant zz_v1_fixes_writer to %I', current_user); end $g$;

do $t$
declare
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System
  v_table   uuid;
  v_rec     uuid;
  v_switch  text;
  v_owner   text;
  v_actor   text;
  v_ver     integer;
  v_n       integer;
  v_bytes   integer;
  v_msg     text;
begin
  select pg_get_userbyid(c.relowner) into v_owner
    from pg_class c where c.oid = 'custom.record'::regclass;
  select platform.knob_resolve('custom','system_enabled', null) #>> '{}' into v_switch;
  if v_switch is distinct from 'false' then
    raise exception 'PRECONDITION: custom/system_enabled resolves "%" and every block here is about what OFF does.', v_switch;
  end if;
  raise notice 'PRECONDITION — custom.record owned by "%", custom/system_enabled = %, connected as "%".',
    v_owner, v_switch, current_user;

  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name', 'V1 fixes RED', 'slug', 'zz_v1_fixes_red', 'type', 'entity',
    'label_singular', 'Red row', 'label_plural', 'Red rows',
    'title_field', 'nm', 'display', 'page', 'weight', 'light',
    'ordered', false, 'row_order', 'sorted', 'default_sort', '[]'::jsonb,
    'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','nm')),
    'parent_id', '11111111-0000-4000-8000-000000000001'));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'nm', 'label', 'Name', 'type', 'text', 'sort', 10,
    'required', false, 'multi', false, 'dated', false, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'sensitivity', 'internal', 'source_config', '{}'::jsonb, 'context_policy', 'include',
    'applies_to_types', '[]'::jsonb, 'entity_definition_id', v_table));

  -- ══ 1. THE OFF SWITCH DOES NOT HOLD THROUGH THE DOOR ════════════════════════════
  -- 1a. the direct write, which IS refused (this half is the control: it proves the
  --     switch is genuinely off and the guard genuinely fires for this role).
  begin
    set local role zz_v1_fixes_writer;
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, v_table, 'record', jsonb_build_object('nm', 'direct'));
    reset role;
    raise exception 'RED 1a UNEXPECTED: the direct insert landed, so the switch is not off for this role at all and 1b proves nothing.';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    reset role;
    raise notice '1a. control — the DIRECT insert is refused by name: "%"', v_msg;
  end;

  -- 1b. the SAME role, the SAME document, through the door. THE DEFECT.
  set local role zz_v1_fixes_writer;
  v_rec := custom.record_write(v_org, v_table, jsonb_build_object('nm', 'through the door'));
  reset role;
  select count(*) into v_n from custom.record where organization_id = v_org and id = v_rec;
  if v_n <> 1 then
    raise exception 'RED 1 IS CLOSED: custom.record_write no longer launders the caller — the switch now holds through the door. Run v1_fixes_green.sql.';
  end if;
  raise notice '1b. DEFECT REPRODUCED — "zz_v1_fixes_writer" wrote record % THROUGH custom.record_write while the store is switched off.', v_rec;

  -- ══ 2. A WRITE WITH NO CALLER-OPENED ENVELOPE CARRIES NO AUTHOR, NO VERSION ══════
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_table, 'record', jsonb_build_object('nm', 'first'))
  returning id into v_rec;
  select actor, value_version into v_actor, v_ver
    from custom.value_read(v_org, v_rec, 'nm');
  if v_actor is not null then
    raise exception 'RED 2 IS CLOSED: the store now stamps an author ("%") on a write that opened no envelope.', v_actor;
  end if;
  raise notice '2a. DEFECT REPRODUCED — value "nm" reads back actor <NULL>, version %.', v_ver;

  update custom.record set data = data || jsonb_build_object('nm', 'second')
   where organization_id = v_org and id = v_rec;
  select actor, value_version into v_actor, v_ver
    from custom.value_read(v_org, v_rec, 'nm');
  if v_ver <> 1 then
    raise exception 'RED 2 IS CLOSED: the value moved and its version moved with it (now %).', v_ver;
  end if;
  raise notice '2b. DEFECT REPRODUCED — the value moved first -> second and its version is STILL %, author still %.', v_ver, coalesce(v_actor, '<NULL>');

  -- ══ 3. AN AGENT WRITE WITH NO `_on_behalf_of` LANDS UNREMARKED ═══════════════════
  -- the control first: the converse arm IS enforced.
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, v_table, 'record', jsonb_build_object(
      'nm', 'converse', '_actor', 'user',
      '_on_behalf_of', '39c38960-d30c-4840-b0c1-c9960de95583',
      '_values', jsonb_build_object('nm', '{}'::jsonb)));
    raise exception 'RED 3 CONTROL FAILED: a user write claiming _on_behalf_of landed, so the arm that IS built is gone too.';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'RED 3 CONTROL FAILED%' then raise; end if;
    raise notice '3a. control — the converse IS refused: "%"', v_msg;
  end;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_table, 'record', jsonb_build_object(
    'nm', 'agent wrote this', '_actor', 'agent',
    '_values', jsonb_build_object('nm', '{}'::jsonb)))
  returning id into v_rec;
  select actor, on_behalf_of into v_actor, v_msg
    from custom.value_read(v_org, v_rec, 'nm');
  raise notice '3b. DEFECT REPRODUCED — an agent write LANDED (record %) with actor "%" and on behalf of %.',
    v_rec, v_actor, coalesce(v_msg, '<NOBODY>');
  if v_msg is not null then
    raise exception 'RED 3 IS CLOSED: the agent write carries a person (%).', v_msg;
  end if;

  -- ══ 4. A 5 MB VALUE LANDS ════════════════════════════════════════════════════════
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_table, 'record', jsonb_build_object('nm', repeat('x', 5 * 1024 * 1024)))
  returning id into v_rec;
  select octet_length(data::text) into v_bytes
    from custom.record where organization_id = v_org and id = v_rec;
  if v_bytes < 5 * 1024 * 1024 then
    raise exception 'RED 4 SETUP FAILED: the document is only % bytes.', v_bytes;
  end if;
  raise notice '4. DEFECT REPRODUCED — a %-byte document landed with a single %-byte value. No ceiling is published or enforced anywhere in the write path.',
    v_bytes, 5 * 1024 * 1024;

  raise notice '=== W1-V1-FIXES RED — all four in-transaction findings reproduced against the live objects. This transaction rolls back. ===';
end;
$t$;

rollback;
