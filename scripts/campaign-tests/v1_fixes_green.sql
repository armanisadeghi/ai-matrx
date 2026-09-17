-- LANE W1-V1-FIXES — THE GREEN. The twin of `v1_fixes_red.sql`: every block below asserts
-- the RIGHT thing where the RED asserted the wrong one, against the SAME live objects.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGE, NAMED (rule 3), one per block:
--   1. remove `perform custom.assert_store_door(...)` from `custom.record_write`, or make
--      `custom.caller_role()` answer `current_user` again, and block 1 fails naming the role
--      that got through.
--   2. put back the early `return new` in `custom._value_envelope` for a document that
--      opened no envelope, and block 2 fails on `actor <NULL>` / a stuck version.
--   3. remove the forward `_on_behalf_of` arm and block 3 fails naming the agent write that
--      landed.
--   4. drop `custom.size_refusal`, or raise `custom/value_max_bytes` above 5 MB, and block 4
--      fails naming the byte count that landed.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE (rule 3), in every block: each refusal is
-- paired with a POSITIVE control over the same door and the same table that MUST land - a
-- write by the store's owner, an `agent` write that names its person, a 99,000-byte value
-- under the ceiling - so a body that simply refuses everything fails here just as loudly as
-- one that refuses nothing. And the versions are asserted as a SEQUENCE (1, then 2, then 2
-- again for a re-assert of the same value), which a constant cannot satisfy.
--
-- Finding 5 is not here: it needs two committing sessions and lives in
-- `scripts/campaign-tests/v1_fixes_concurrency.sh`.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and its one
-- transaction ends in ROLLBACK.
--
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/v1_fixes_green.sql

\set ON_ERROR_STOP on
\timing off

begin;

create role zz_v1_green_writer nologin;
grant usage on schema custom to zz_v1_green_writer;
grant select, insert, update on custom.record to zz_v1_green_writer;
grant execute on function custom.record_write(uuid,uuid,jsonb) to zz_v1_green_writer;
grant execute on function custom.record_update(uuid,uuid,jsonb,integer) to zz_v1_green_writer;
do $g$ begin execute format('grant zz_v1_green_writer to %I', current_user); end $g$;

do $t$
declare
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System
  v_person  constant uuid := '39c38960-d30c-4840-b0c1-c9960de95583';
  v_table   uuid;
  v_rec     uuid;
  v_switch  text;
  v_actor   text;
  v_obo     text;
  v_ver     integer;
  v_bytes   integer;
  v_msg     text;
  v_n       integer;
begin
  select platform.knob_resolve('custom','system_enabled', null) #>> '{}' into v_switch;
  if v_switch is distinct from 'false' then
    raise exception 'PRECONDITION: custom/system_enabled resolves "%" and block 1 is about what OFF does.', v_switch;
  end if;

  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name', 'V1 fixes GREEN', 'slug', 'zz_v1_fixes_green', 'type', 'entity',
    'label_singular', 'Green row', 'label_plural', 'Green rows',
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

  -- ══ 1. THE SWITCH HOLDS THROUGH THE DOOR ════════════════════════════════════════
  begin
    set local role zz_v1_green_writer;
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, v_table, 'record', jsonb_build_object('nm', 'direct'));
    reset role;
    raise exception 'GREEN 1a FAILED: the direct insert landed while the store is switched off.';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    reset role;
    raise notice '1a. the DIRECT insert is refused by name: "%"', v_msg;
  end;

  begin
    set local role zz_v1_green_writer;
    v_rec := custom.record_write(v_org, v_table, jsonb_build_object('nm', 'through the door'));
    reset role;
    raise exception 'GREEN 1b FAILED: "zz_v1_green_writer" wrote record % THROUGH custom.record_write while the store is switched off. The door still launders the caller.', v_rec;
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text;
    reset role;
    if v_msg not like '%custom.record_write%' then
      raise exception 'GREEN 1b FAILED: refused, but the refusal does not name the door it was refused at: "%"', v_msg;
    end if;
    raise notice '1b. the SAME role THROUGH THE DOOR is refused, and the refusal NAMES the door: "%"', v_msg;
  end;

  -- the POSITIVE CONTROL for block 1: the store's owner still writes, through the same door.
  v_rec := custom.record_write(v_org, v_table, jsonb_build_object('nm', 'the owner writes'));
  select count(*) into v_n from custom.record where organization_id = v_org and id = v_rec;
  if v_n <> 1 then
    raise exception 'GREEN 1c FAILED: the door refuses the OWNER too, so it is a wall and not a door.';
  end if;
  raise notice '1c. control — the store''s owner still writes through the same door (record %).', v_rec;

  -- ══ 2. THE STORE OPENS THE ENVELOPE ═════════════════════════════════════════════
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_table, 'record', jsonb_build_object('nm', 'first'))
  returning id into v_rec;
  select actor, value_version into v_actor, v_ver from custom.value_read(v_org, v_rec, 'nm');
  if v_actor is null or v_ver <> 1 then
    raise exception 'GREEN 2a FAILED: a write that opened no envelope reads back actor % version % — the store is still leaving the envelope to the caller.',
      coalesce(v_actor, '<NULL>'), v_ver;
  end if;
  raise notice '2a. a write that opened NO envelope reads back actor "%" at version %.', v_actor, v_ver;

  update custom.record set data = data || jsonb_build_object('nm', 'second')
   where organization_id = v_org and id = v_rec;
  select value_version into v_ver from custom.value_read(v_org, v_rec, 'nm');
  if v_ver <> 2 then
    raise exception 'GREEN 2b FAILED: the value moved first -> second and its version is %, not 2.', v_ver;
  end if;
  raise notice '2b. the value moved first -> second and its version moved 1 -> %.', v_ver;

  update custom.record set data = data || jsonb_build_object('nm', 'second')
   where organization_id = v_org and id = v_rec;
  select value_version into v_ver from custom.value_read(v_org, v_rec, 'nm');
  if v_ver <> 2 then
    raise exception 'GREEN 2c FAILED: re-asserting the SAME value moved the version to %. A version counts changes, not writes.', v_ver;
  end if;
  raise notice '2c. control — re-asserting the same value leaves the version at %.', v_ver;

  -- ══ 3. AN AGENT SAYS WHO IT ACTS FOR ════════════════════════════════════════════
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, v_table, 'record', jsonb_build_object('nm', 'agent wrote this', '_actor', 'agent'));
    raise exception 'GREEN 3a FAILED: an agent write naming nobody landed.';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'GREEN 3a FAILED%' then raise; end if;
    raise notice '3a. an agent write naming nobody is refused: "%"', v_msg;
  end;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_table, 'record', jsonb_build_object(
    'nm', 'agent for somebody', '_actor', 'agent', '_on_behalf_of', v_person))
  returning id into v_rec;
  select actor, on_behalf_of into v_actor, v_obo from custom.value_read(v_org, v_rec, 'nm');
  if v_actor <> 'agent' or v_obo is distinct from v_person::text then
    raise exception 'GREEN 3b FAILED: the agent write that DOES name its person reads back actor % on behalf of %.',
      coalesce(v_actor,'<NULL>'), coalesce(v_obo,'<NOBODY>');
  end if;
  raise notice '3b. control — the same write naming its person lands, actor "%" on behalf of %.', v_actor, v_obo;

  -- ══ 4. A VALUE HAS A PUBLISHED CEILING ══════════════════════════════════════════
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, v_table, 'record', jsonb_build_object('nm', repeat('x', 5 * 1024 * 1024)));
    raise exception 'GREEN 4a FAILED: a 5 MB value landed.';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like 'GREEN 4a FAILED%' then raise; end if;
    if v_msg not like '%nm%' then
      raise exception 'GREEN 4a FAILED: refused, but the refusal does not name the field: "%"', v_msg;
    end if;
    raise notice '4a. the 5 MB value is refused, naming the field: "%"', v_msg;
  end;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_table, 'record', jsonb_build_object('nm', repeat('y', 99000)))
  returning id into v_rec;
  select octet_length(data::text) into v_bytes
    from custom.record where organization_id = v_org and id = v_rec;
  if v_bytes < 99000 then
    raise exception 'GREEN 4b FAILED: a 99,000-byte value under the 100,000 ceiling did not land whole (% bytes).', v_bytes;
  end if;
  raise notice '4b. control — a 99,000-byte value, under the published ceiling, lands whole (% bytes).', v_bytes;

  raise notice '=== W1-V1-FIXES GREEN — findings 1 to 4 closed against the live objects, each with a positive control. This transaction rolls back. ===';
end;
$t$;

rollback;
