-- W1-VAL FOLLOW-UP (lane W1-RULE-APPLY) — THE DOOR IN `custom._record_field_validation`.
--
-- `migrations/campaign/w1_val_validation_reads_its_switch.sql` makes that trigger body READ
-- `custom/system_enabled`, which JUDGMENT.md §4a requires of a `CREATE OR REPLACE FUNCTION
-- custom.* RETURNS trigger`. This proves what the read DOES, rather than that the file
-- mentions the knob:
--
--   A. POSITIVE CONTROL — the store's owner writes a record and it LANDS, validated. The
--      switch is off for this write too, so a refusal that fired for everybody would fail
--      here (rule 14: a refusal proved without a positive control proves nothing).
--   B. THE DOOR — a role that is not a member of the owner writes the same record while
--      `custom/system_enabled` resolves false, and is REFUSED BY NAME, with the knob and
--      the remedy in the message.
--   C. NOTHING IS SKIPPED WHILE THE SWITCH IS OFF — the owner's write of an INVALID
--      document is still refused by the validation below the door. A body that returned
--      NEW while the switch is off (the shape `custom._entity_custom_fields_guard` uses on
--      `crm.party`, and the wrong answer here) would let this one through.
--
-- WHAT MAKES IT FAIL — THE PRODUCTION CHANGE, NAMED (rule 3). Remove the door block from
-- `custom._record_field_validation` — which is exactly what
-- `migrations/inverse/w1_val_validation_reads_its_switch_down.sql` does, so the RED is the
-- rule-27 inverse itself and not a hand-weakened copy. MEASURED RED, 2026-09-17 18:50Z:
-- with the door gone, B fails with `permission denied for function applicable_fields`
-- (42501) raised from inside the validator — the write is still stopped, by privilege and
-- not by the store, and what the writer is told names an internal function instead of the
-- switch that is actually shut. That is the difference the door makes and the whole claim
-- this script tests: the door is HONESTY, never the security boundary (§6 fact two is), and
-- B asserts the message names the writer, the switch and the remedy, which the restored
-- body's message does not.
--
-- A SECOND INPUT WITH A DIFFERENT EXPECTED VALUE (rule 3): the same INSERT is executed
-- three times, by two different roles, against three different documents, and the three
-- expected answers are LANDS, REFUSED-42501-by-name, and REFUSED-by-the-validator. A body
-- that returned a constant survives none of them.
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and its one
-- transaction ends in ROLLBACK — the disposable role it creates is created inside that
-- transaction and disappears with it.
--
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w1_val_apply_door.sql

\set ON_ERROR_STOP on
\timing off

begin;

create role zz_w1_val_apply_writer nologin;
grant usage on schema custom to zz_w1_val_apply_writer;
grant select, insert on custom.record to zz_w1_val_apply_writer;
-- The connected role must be a MEMBER of the disposable one to SET ROLE to it. Membership
-- runs that way round only: the disposable role is still no member of custom.record's
-- owner, which is what the door asks about.
do $g$ begin execute format('grant zz_w1_val_apply_writer to %I', current_user); end $g$;

do $t$
declare
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System
  v_table   uuid;
  v_field   uuid;
  v_rec     uuid;
  v_owner   text;
  v_switch  text;
  v_msg     text;
  v_state   text;
  v_hint    text;
  v_landed  integer;
begin
  select pg_get_userbyid(c.relowner) into v_owner
    from pg_class c where c.oid = 'custom.record'::regclass;
  select platform.knob_resolve('custom','system_enabled', null) #>> '{}' into v_switch;
  if v_switch is distinct from 'false' then
    raise exception 'PRECONDITION: custom/system_enabled resolves "%" and this script is about what OFF does.', v_switch;
  end if;
  raise notice 'PRECONDITION — custom.record is owned by "%", custom/system_enabled resolves %, connected as "%".',
    v_owner, v_switch, current_user;

  -- A declared Table with one declared Field, so the validator below the door has something
  -- to check and C is a real refusal rather than an empty pass.
  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name', 'W1-VAL door', 'slug', 'zz_w1_val_apply_door', 'type', 'entity',
    'label_singular', 'Door test', 'label_plural', 'Door tests',
    'title_field', 'site_name', 'display', 'page', 'weight', 'light',
    'ordered', false, 'row_order', 'sorted', 'default_sort', '[]'::jsonb,
    'agent_writable', true, 'retention_days', 365,
    'fields', jsonb_build_array(jsonb_build_object('name','site_name')),
    'parent_id', '11111111-0000-4000-8000-000000000001'));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'site_name', 'label', 'Site name', 'type', 'text', 'sort', 10,
    'required', false, 'multi', false, 'dated', false, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'sensitivity', 'internal', 'source_config', '{}'::jsonb, 'context_policy', 'include',
    'applies_to_types', '[]'::jsonb, 'entity_definition_id', v_table))
  returning id into v_field;

  -- ── A. POSITIVE CONTROL: the owner writes, and it lands. ────────────────────────────
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_table, 'record', jsonb_build_object('site_name', 'North yard'))
  returning id into v_rec;
  select count(*) into v_landed from custom.record where organization_id = v_org and id = v_rec;
  if v_landed <> 1 then
    raise exception 'A FAILED: the owner''s valid write did not land.';
  end if;
  raise notice 'A. the owner writes with the switch off and it LANDS, validated (record %).', v_rec;

  -- ── B. THE DOOR: a non-owner writes the same document and is refused BY NAME. ───────
  begin
    set local role zz_w1_val_apply_writer;
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, v_table, 'record', jsonb_build_object('site_name', 'South yard'));
    reset role;
    raise exception 'B FAILED: "zz_w1_val_apply_writer" wrote into a store whose switch is off. The door is not there.';
  exception when insufficient_privilege then
    get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate, v_hint = pg_exception_hint;
    reset role;
    if v_msg not like '%switched off%' or v_msg not like '%zz_w1_val_apply_writer%' then
      raise exception 'B FAILED: refused with "%" (%), which does not name the writer and the switch.', v_msg, v_state;
    end if;
    if v_hint not like '%custom/system_enabled%' then
      raise exception 'B FAILED: the refusal carries no remedy naming the knob. Hint was "%".', v_hint;
    end if;
    raise notice 'B. the non-owner is REFUSED % — "%"', v_state, v_msg;
    raise notice 'B. remedy — "%"', v_hint;
  end;

  -- ── C. NOTHING IS SKIPPED WHILE THE SWITCH IS OFF. ─────────────────────────────────
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, v_table, 'record', jsonb_build_object('site_name', 12));
    raise exception 'C FAILED: an invalid document landed while the switch is off — the switch is removing a check.';
  exception when others then
    get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
    if v_msg like 'C FAILED%' then raise; end if;
    raise notice 'C. the validator still refuses the owner''s invalid write while the switch is off — % "%"', v_state, v_msg;
  end;

  raise notice '=== W1-VAL door — the switch is READ, it closes the store to everyone but its owner, and it removes no check. This transaction rolls back. ===';
end;
$t$;

rollback;
