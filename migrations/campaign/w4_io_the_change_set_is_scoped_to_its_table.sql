-- chair-step: replaces two of this lane's own function bodies (custom.io_changed_field_ids and the custom.io_record_changed trigger) to fix two defects the green suite found on the main database; a replacement is judged by the allow-list, and the guard-read rule cannot be satisfied by a trigger whose switch is read one call away in custom.assert_store_door, so the sanctioned route for this shape is a terminal-confirmed step
-- based-on: custom.io_changed_field_ids(uuid, uuid, jsonb, jsonb) f97ad013dee675e9d8b793dec4d742dfeed557cc90b16c2f3240f9166de2d877
-- based-on: custom.io_record_changed() 5fac812591873d082648bbf4fa6a79fd3eeafc1f1ac9b870640b4089b8b55c3a
--
-- W4-IO, file 5 — TWO DEFECTS THE GREEN SUITE FOUND, FIXED AS A CLASS.
--
-- DEFECT 1 — THE CHANGE SET WAS SCOPED TO THE ORGANIZATION, NOT TO THE TABLE.
-- `custom.io_changed_field_ids` resolved a moved key to "every Field in this organization
-- whose key spells the same word". Measured on the main database, 2026-09-18: writing one
-- record into a new Table produced an event naming `11111111-0007-4000-8000-000000000001` AND
-- `…0003` — two KERNEL Fields called `name`, belonging to other Tables entirely. An automation
-- filtered on "the name field of MY table" would therefore fire on every table's name field in
-- the organization. The Table's own Fields are `custom.applicable_fields(organization, table,
-- record_type)` — the platform's one answer to "which Fields does this Table have" — and that
-- is what it now joins to. `p_table_id` was already an argument and was being ignored.
--
-- DEFECT 2 — "NOTHING CHANGED" WAS BEING DECIDED BY FIELD RESOLUTION.
-- The trigger suppressed the event when the RESOLVED FIELD LIST came back empty. Those are two
-- different questions and the difference is not academic: a Table whose Fields are declared on
-- the Table rather than as Field records (which `custom.table_declare` does today — it mints no
-- Field record per declared field) moved real values on every write and resolved zero Fields,
-- so it raised NO EVENTS AT ALL. A change feed that is silent for a whole class of Tables is
-- worse than one that is noisy, because nobody can see it not working.
--
-- The two questions are now asked separately, which is the class fix rather than the instance:
--   · DID ANYTHING MOVE?  — `custom.io_changed_keys`, the value keys that differ. This decides
--                           whether there is an event.
--   · WHAT MOVED?         — `custom.io_changed_field_ids`, the Field ids for those keys, scoped
--                           to the Table. This is payload, and an empty answer is legal.
-- A consumer is told the KEYS as well now, so a Table with no Field records still says exactly
-- what changed instead of saying "something".
--
-- THE INVERSE: `migrations/inverse/w4_io_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── DID ANYTHING MOVE — the question that decides whether an event exists ────
create or replace function custom.io_changed_keys(p_old jsonb, p_new jsonb)
returns text[]
language sql
immutable
set search_path to 'pg_catalog'
as $fn$
  -- Envelope bookkeeping is not a value: `_values`, `_sources`, `_computed`, `_derived`,
  -- `_retired`, `_actor` and anything else the store keeps under a leading underscore.
  with keys as (
    select k from jsonb_object_keys(coalesce(p_old, '{}'::jsonb)) k
    union
    select k from jsonb_object_keys(coalesce(p_new, '{}'::jsonb)) k
  )
  select coalesce(array_agg(k order by k), array[]::text[])
    from keys
   where left(k, 1) <> '_'
     and (coalesce(p_old, '{}'::jsonb) -> k) is distinct from (coalesce(p_new, '{}'::jsonb) -> k);
$fn$;

comment on function custom.io_changed_keys(jsonb, jsonb) is
  'W4-IO / DOOR-13: the VALUE KEYS that differ between two record documents. This is what decides whether a change happened; resolving those keys to Field ids is a separate question with a legal empty answer.';

-- ── WHAT MOVED — payload, and scoped to the Table that owns the Fields ───────
create or replace function custom.io_changed_field_ids(p_organization_id uuid,
                                                       p_table_id uuid,
                                                       p_old jsonb,
                                                       p_new jsonb)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  -- `custom.applicable_fields` is the platform's one answer to "which Fields does this Table
  -- have". Joining on key alone matched every Table's Field of the same name.
  select coalesce(jsonb_agg(distinct f.id), '[]'::jsonb)
    from unnest(custom.io_changed_keys(p_old, p_new)) k
    join custom.applicable_fields(p_organization_id, p_table_id, null) f
      on (f.data ->> 'key') = k;
  -- It reads no knob of its own: it is payload for an event the trigger above only writes
  -- after custom.assert_store_door has resolved custom/system_enabled.
$fn$;

comment on function custom.io_changed_field_ids(uuid, uuid, jsonb, jsonb) is
  'W4-IO / DOOR-13: the Field ids of THIS TABLE whose value moved. Scoped through custom.applicable_fields — joining on key alone named every same-named Field in the organization (measured 2026-09-18). An empty answer is legal and never means "nothing changed"; custom.io_changed_keys answers that.';

-- ── the trigger, asking the two questions separately ────────────────────────
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
                                changed_field_ids, actor, dedupe_key, metadata)
  values (v_org, 'records.changed', v_id, v_table, v_operation, v_changed,
          jsonb_build_object(
            'user_id',   custom.query_principal(),
            'role',      custom.caller_role()::text,
            'tier',      coalesce(platform.declared_actor_tier(), platform.actor_tier()),
            'declared',  coalesce(new.data, old.data) ->> '_actor'),
          v_org::text || ':' || v_id::text || ':' || v_version::text || ':' || v_operation,
          -- The KEYS ride along, so a Table with no Field records still says what changed
          -- rather than saying "something did".
          jsonb_build_object('changed_keys', to_jsonb(v_keys)))
  on conflict do nothing;

  return null;
end;
$fn$;

comment on function custom.io_record_changed() is
  'CUT-N-2 / DOOR-13: writes ONE custom.io_outbox row per record change, in the same transaction as the record. Whether there is an event is decided by custom.io_changed_keys; which Fields moved is payload from custom.io_changed_field_ids and may legally be empty. Reads custom.assert_store_door like every other door, and publishes nothing.';

-- THE VIEW IS LEFT ALONE, DELIBERATELY. `custom.record_outbox` already answers in the shape
-- the platform's `records.changed` node reads, and a `CREATE OR REPLACE VIEW` is a whole-body
-- rewrite with no concurrency check — the allow-list refuses it for exactly the reason DD-220
-- exists, and it is right to. The changed KEYS ride on `custom.io_outbox.metadata ->
-- 'changed_keys'`, which any consumer can read today; the day the view should carry them too,
-- that is its own file with its own `-- based-on:` line.

revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
-- Re-grant every door this schema declares client-callable, in the SAME transaction as the
-- revoke — see w4_io_the_closed_schema_regrants_its_doors.sql for why this is the mechanism
-- and not a convention.
select custom.reopen_declared_doors();
