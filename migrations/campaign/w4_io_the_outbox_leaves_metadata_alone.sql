-- chair-step: replaces this lane's own custom.io_record_changed trigger body to stop writing to custom.io_outbox.metadata, which the platform's validation gate owns; a replacement is judged by the allow-list and the guard-read rule cannot be satisfied by a trigger whose switch is read one call away, so the sanctioned route is a terminal-confirmed step
-- based-on: custom.io_record_changed() b05b88e52a60624e6cbc155cb34d8474bb67a931066af7620056dc122eb736ce
--
-- W4-IO, file 7 — THE OUTBOX STOPS WRITING TO `metadata`.
--
-- WHAT THE GREEN SUITE FOUND, and it would have been a production outage rather than a test
-- failure. File 5 put the changed VALUE KEYS on the outbox row's `metadata` column, so that a
-- Table whose Fields are declared on the Table rather than as Field records could still say
-- what changed. The platform refuses that, by name and correctly:
--
--     matrx_validation_gate: metadata key "changed_keys" is not system-owned state on
--     custom.io_outbox — the metadata column belongs to the platform, never to user content.
--
-- AND IT ONLY BIT UNDER A SIGNED-IN PRINCIPAL. Parts 1 and 2 of the suite write as the store
-- owner and passed; part 3 sets `request.jwt.claims` and the very first write raised. So every
-- write by an actual person would have failed, on every Table, from the moment this landed —
-- while every test run as the owner stayed green. That asymmetry is the reason the suite sets
-- a principal at all.
--
-- WHAT IS LOST, SAID PLAINLY. The event no longer carries the changed value KEYS; it carries
-- the changed FIELD IDS, which is what DOOR-13 and the platform's `records.changed` node both
-- ask for. The important half of file 5 is untouched: whether an event EXISTS is still decided
-- by `custom.io_changed_keys`, so a Table with no Field records still raises its events — it
-- reports them with an empty id list rather than with a key list. Carrying the keys as well
-- needs a real column on `custom.io_outbox`, which is a provisioner change and its own file.
--
-- THE INVERSE: `migrations/inverse/w4_io_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.io_record_changed()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_org       uuid := coalesce(new.organization_id, old.organization_id);
  v_id        uuid := coalesce(new.id, old.id);
  v_table     uuid := coalesce(new.table_id, old.table_id);
  v_version   integer := coalesce(new.version, old.version, 0);
  v_operation text;
  v_keys      text[];
  v_changed   jsonb;
begin
  -- THE ONE DOOR PREDICATE, and it IS the guard this file is headed with:
  -- `custom.assert_store_door` resolves `custom/system_enabled` through
  -- `custom.store_is_open`, so while that knob is false this trigger — like every other door
  -- in the store — takes writes only from the role that owns `custom.record`.
  perform custom.assert_store_door(v_org, 'custom.io_record_changed');

  if tg_op = 'INSERT' then
    v_operation := 'created';
    v_keys      := custom.io_changed_keys('{}'::jsonb, new.data);
  elsif tg_op = 'DELETE' then
    v_operation := 'deleted';
    v_keys      := array[]::text[];
  elsif new.deleted_at is not null and old.deleted_at is null then
    -- A soft delete is a DELETE to everyone downstream. An automation that fired "updated"
    -- when a record disappeared would be lying in the one case people notice.
    v_operation := 'deleted';
    v_keys      := array[]::text[];
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_operation := 'created';
    v_keys      := custom.io_changed_keys('{}'::jsonb, new.data);
  else
    v_operation := 'updated';
    v_keys      := custom.io_changed_keys(old.data, new.data);
    -- NO VALUE MOVED, so there is no event. Asked of the KEYS, never of the resolved Field
    -- ids: a Table whose fields are declared on the Table rather than as Field records
    -- resolves zero ids on every write, and used to raise nothing at all.
    if coalesce(array_length(v_keys, 1), 0) = 0
       and old.deleted_at is not distinct from new.deleted_at then
      return null;
    end if;
  end if;

  v_changed := custom.io_changed_field_ids(v_org, v_table,
                                           case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end,
                                           coalesce(new.data, '{}'::jsonb));

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key)
  values (v_org, 'records.changed', v_id, v_table, v_operation, v_changed,
          jsonb_build_object(
            'user_id',   custom.query_principal(),
            'role',      custom.caller_role()::text,
            'tier',      coalesce(platform.declared_actor_tier(), platform.actor_tier()),
            'declared',  coalesce(new.data, old.data) ->> '_actor'),
          v_org::text || ':' || v_id::text || ':' || v_version::text || ':' || v_operation)
  on conflict do nothing;

  return null;
end;
$fn$;


comment on function custom.io_record_changed() is
  'CUT-N-2 / DOOR-13: writes ONE custom.io_outbox row per record change, in the same transaction as the record. Whether there is an event is decided by custom.io_changed_keys; which Fields moved is payload from custom.io_changed_field_ids and may legally be empty. Writes NOTHING to metadata — that column is the platform''s. Reads custom.assert_store_door like every other door, and publishes nothing.';

revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
