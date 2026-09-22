-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
--
-- W4-IO, file 2 — THE TRANSACTIONAL OUTBOX, ITS IDEMPOTENT CONSUMER, AND `records.changed`.
--
-- CUT-N-2 · DOOR-13.
--
-- THE ONE SENTENCE THIS FILE IS. A record change and the event that announces it commit
-- together or not at all, and nothing publishes from the record table itself.
--
-- WHY A TABLE AND NOT A `pg_notify` FROM `custom.record_write`. `pg_notify` is not
-- transactional in the way people assume it is: the notification IS delivered at commit, but
-- it is delivered ONCE, to whoever happens to be listening, with an 8 kB payload ceiling and
-- no record that it ever existed. A consumer that was restarting during that commit has no way
-- to learn the change happened. The outbox is the durable half — every change leaves a ROW —
-- and the `pg_notify` is the "wake up now" half, raised from the OUTBOX row's own trigger so
-- the two can never disagree about what happened. AWS's statement of the pattern is exactly
-- this split, and Debezium, Kafka Connect and every outbox implementation worth copying keeps
-- the row as the truth and the signal as an optimisation.
--
-- WHY THE TRIGGER IS ON `custom.record` AND THE PUBLISH IS NOT. The contract says a record
-- change becomes an event in ONE place. A trigger on `custom.record` that called `pg_notify`
-- directly would be a second publisher, and the day somebody added a second one the two would
-- carry different payloads for the same change. So: the record trigger writes a ROW, and the
-- outbox's own trigger is the only thing on this database that publishes.
--
-- THE DOOR PREDICATE IS READ IN THE TRIGGER, NOT ASSUMED FROM THE CALLER. Every function here
-- calls `custom.assert_store_door(organization_id, '<this door>')` — the ONE predicate. In the
-- trigger that looks redundant, because the only route into `custom.record` is
-- `custom.record_write`, which asserts already. It is not redundant: it is what makes the
-- sentence "every write to this store passes the door" true of the trigger's OWN write, and it
-- costs one knob read. The day a second write path exists — a restore, a merge, an import —
-- the trigger does not have to be remembered.
--
-- WHAT "IDEMPOTENT CONSUMER" MEANS HERE, AS A CONSTRAINT RATHER THAN AS AN INTENTION.
-- `dedupe_key` is `organization:record:version:operation` and is UNIQUE per organization (the
-- index is in file 1). A change replayed — by a retried transaction, by a consumer that died
-- after reading and before acknowledging, by an import that writes the same row twice — cannot
-- produce a second event, because the second INSERT violates the index. The drain then CLAIMS
-- rows with `update … where consumed_at is null … returning`, which is atomic, so two consumers
-- running at once split the queue instead of both taking the same row.
--
-- `custom.record_outbox` IS A VIEW OVER `custom.io_outbox`, AND THAT IS DELIBERATE. The
-- platform's `records.changed` workflow node (matrx-records, aidream) was written against a
-- feed it could not see yet: it asks `to_regclass('custom.record_outbox')` at run time and
-- selects `record_id, operation, changed_fields, occurred_at`. Its author's whole point was
-- that "the node starts working the day the outbox lands with no edit here". Renaming this
-- lane's table to match would have put the store's operational columns — the claim, the
-- consumer, the dedupe key — into the shape a workflow trigger reads. So the TABLE keeps this
-- lane's prefix and its own columns, and the VIEW is the node's shape. One feed, two names,
-- and the view is what makes the sentence true rather than a second copy.
--
-- THE INVERSE: `migrations/inverse/w4_io_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ── which Fields actually changed ─────────────────────────────────────────────
-- A consumer is told WHAT changed, not merely that something did — that is the difference
-- between an automation a person leaves on and one they turn off in a week. Values live in
-- `data` keyed by the Field's `key`, so the answer is the Field RECORDS whose key's value
-- moved. Envelope bookkeeping (`_values`, `_sources`, `_computed`, `_derived`, `_retired`,
-- `_actor`) is not a Field and never counts as a change.
create or replace function custom.io_changed_field_ids(p_organization_id uuid,
                                            p_table_id uuid,
                                            p_old jsonb,
                                            p_new jsonb)
returns jsonb
language sql
stable
set search_path to 'pg_catalog'
as $fn$
  with keys as (
    select k from jsonb_object_keys(coalesce(p_old, '{}'::jsonb)) k
    union
    select k from jsonb_object_keys(coalesce(p_new, '{}'::jsonb)) k
  ),
  moved as (
    select k from keys
     where left(k, 1) <> '_'
       and (coalesce(p_old, '{}'::jsonb) -> k) is distinct from (coalesce(p_new, '{}'::jsonb) -> k)
  )
  select coalesce(jsonb_agg(distinct f.id), '[]'::jsonb)
    from moved m
    join custom.field f
      on f.organization_id = p_organization_id
     and f.key = m.k;
$fn$;

comment on function custom.io_changed_field_ids(uuid, uuid, jsonb, jsonb) is
  'W4-IO / DOOR-13: the Field ids whose value differs between two record documents. Envelope keys (leading underscore) are bookkeeping and never count as a change.';

-- ── the trigger: one outbox row, in the SAME transaction as the record ────────
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
  v_changed   jsonb;
begin
  -- THE ONE DOOR PREDICATE. Same call, same arguments, same refusal as every other door.
  perform custom.assert_store_door(v_org, 'custom.io_record_changed');

  if tg_op = 'INSERT' then
    v_operation := 'created';
    v_changed   := custom.io_changed_field_ids(v_org, v_table, '{}'::jsonb, new.data);
  elsif tg_op = 'DELETE' then
    v_operation := 'deleted';
    v_changed   := '[]'::jsonb;
  elsif new.deleted_at is not null and old.deleted_at is null then
    -- A soft delete is a DELETE to everyone downstream. An automation that fired "updated"
    -- when a record disappeared would be lying in the one case people notice.
    v_operation := 'deleted';
    v_changed   := '[]'::jsonb;
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_operation := 'created';
    v_changed   := custom.io_changed_field_ids(v_org, v_table, '{}'::jsonb, new.data);
  else
    v_operation := 'updated';
    v_changed   := custom.io_changed_field_ids(v_org, v_table, old.data, new.data);
    -- Nothing a Field owns moved, so there is no event. Metadata churn is not a change; an
    -- outbox that raised one per touch is the automation everybody disables.
    if v_changed = '[]'::jsonb and old.deleted_at is not distinct from new.deleted_at then
      return null;
    end if;
  end if;

  -- `on conflict do nothing` is the idempotency, and it is the UNIQUE INDEX doing the work
  -- rather than a promise in a comment: the same (organization, record, version, operation)
  -- can be offered a hundred times and leaves one row.
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
  'CUT-N-2 / DOOR-13: writes ONE custom.io_outbox row per record change, in the same transaction as the record. Reads custom.assert_store_door like every other door. Publishes nothing — custom.io_outbox_announce does that, from the outbox row.';

create trigger io_record_changed
  after insert or update or delete on custom.record
  for each row execute function custom.io_record_changed();

-- ── the ONE publisher, and it is on the outbox, never on the record ───────────
create or replace function custom.io_outbox_announce()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_store_door(new.organization_id, 'custom.io_outbox_announce');
  -- The payload is a POINTER, never the record. A record document can be megabytes and
  -- pg_notify's ceiling is 8000 bytes, so a payload-carrying notification would work in
  -- testing and fail on the first real row. The listener reads the row it is told about.
  perform pg_notify('records_changed',
                    jsonb_build_object('organization_id', new.organization_id,
                                       'outbox_id',       new.id,
                                       'record_id',       new.record_id,
                                       'table_id',        new.table_id,
                                       'operation',       new.operation,
                                       'event_key',       new.event_key)::text);
  return null;
end;
$fn$;

comment on function custom.io_outbox_announce() is
  'DOOR-13: the ONE publisher on this database. Raised from the outbox row so the durable event and the signal can never disagree. The payload is a pointer, because pg_notify stops at 8000 bytes and a record does not.';

create trigger io_outbox_announce
  after insert on custom.io_outbox
  for each row execute function custom.io_outbox_announce();

-- ── the idempotent consumer ───────────────────────────────────────────────────
create or replace function custom.io_outbox_drain(p_organization_id uuid,
                                       p_consumer text,
                                       p_limit integer default 100,
                                       p_event_key text default 'records.changed')
returns table(outbox_id uuid, record_id uuid, table_id uuid, operation text,
              changed_field_ids jsonb, actor jsonb, occurred_at timestamptz)
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_outbox_drain');
  if coalesce(btrim(p_consumer), '') = '' then
    raise exception 'custom.io_outbox_drain: name the consumer. Two consumers draining one organization must be tellable apart, and an unnamed claim is an unrecoverable one.'
      using errcode = '22004';
  end if;

  -- THE CLAIM IS THE READ. One statement, so two consumers running at the same instant split
  -- the queue rather than both taking the same rows: `for update skip locked` inside the
  -- subselect is what makes that true, and `consumed_at is null` is what makes a redelivery
  -- to a crashed consumer impossible without an explicit release.
  return query
  update custom.io_outbox o
     set consumed_at = now(), consumer = p_consumer
   where o.id in (
           select c.id from custom.io_outbox c
            where c.organization_id = p_organization_id
              and c.consumed_at is null
              and c.deleted_at is null
              and c.event_key = p_event_key
            order by c.created_at, c.id
            limit greatest(1, least(coalesce(p_limit, 100), 1000))
            for update skip locked)
  returning o.id, o.record_id, o.table_id, o.operation, o.changed_field_ids, o.actor, o.created_at;
end;
$fn$;

comment on function custom.io_outbox_drain(uuid, text, integer, text) is
  'CUT-N-2: the idempotent consumer. Claims and returns in ONE statement with FOR UPDATE SKIP LOCKED, so concurrent consumers split the queue and a claimed row is never handed out twice.';

-- THE ACCESS DECISION, IN DATA. A SECURITY DEFINER function runs as the definer, so somebody
-- has to say who may call it — and say it where a census can read it, not in a comment.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'io_outbox_drain',
        'p_organization_id uuid, p_consumer text, p_limit integer, p_event_key text',
        array['uuid'::regtype, 'text'::regtype, 'integer'::regtype, 'text'::regtype]::oid[],
        'p_organization_id is the tenant whose outbox is drained and is checked by custom.assert_store_door(p_organization_id, …) on entry; NULL is refused there because the store is keyed by organization and a drain with no organization would claim across tenants. p_consumer is refused empty. No entity id other than the organization is accepted.',
        'w4_io_the_outbox_and_its_consumer.sql',
        'server_only: the outbox consumer is a server worker (aidream, matrx-records) and the workflow trigger node; a browser never drains a queue, because draining CLAIMS rows and a claim a client abandons is an event nobody processes.',
        false, false)
on conflict do nothing;

-- ── releasing a claim a consumer could not finish ─────────────────────────────
create or replace function custom.io_outbox_release(p_organization_id uuid,
                                         p_consumer text,
                                         p_older_than interval default '15 minutes')
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare v_n integer;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_outbox_release');
  -- A consumer that died mid-batch left rows claimed and unprocessed. Without this they are
  -- lost silently, which is the one failure an outbox exists to prevent. Releasing puts them
  -- back at the head of the queue; the dedupe key means a double-processed event still lands
  -- one downstream row wherever the downstream is keyed on it.
  update custom.io_outbox o
     set consumed_at = null, consumer = null
   where o.organization_id = p_organization_id
     and o.consumer = p_consumer
     and o.consumed_at is not null
     and o.consumed_at < now() - coalesce(p_older_than, interval '15 minutes');
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

comment on function custom.io_outbox_release(uuid, text, interval) is
  'CUT-N-2: returns a dead consumer''s claimed-but-unprocessed rows to the queue. Without it a consumer crash loses events silently, which is the single failure the outbox exists to prevent.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values ('custom', 'io_outbox_release',
        'p_organization_id uuid, p_consumer text, p_older_than interval',
        array['uuid'::regtype, 'text'::regtype, 'interval'::regtype]::oid[],
        'p_organization_id is the tenant whose claims are released and is checked by custom.assert_store_door(p_organization_id, …) on entry; NULL is refused there. p_consumer names whose claims are released and nobody else''s.',
        'w4_io_the_outbox_and_its_consumer.sql',
        'server_only: releasing a dead consumer''s claims is queue maintenance run by the same server lane that drains; a client has no consumer name to release and no way to know one died.',
        false, false)
on conflict do nothing;

-- ── the shape the platform''s `records.changed` workflow node reads ───────────
-- `security_invoker = true` because a view without it runs as its OWNER — `postgres`, which
-- has BYPASSRLS — and would hand every caller every tenant's change feed whatever the base
-- table's row-level security says. The shape guard refuses it by name, and it is right to.
create or replace view custom.record_outbox with (security_invoker = true) as
  select o.id,
         o.organization_id,
         o.record_id,
         o.table_id,
         o.operation,
         o.changed_field_ids as changed_fields,
         o.actor,
         o.event_key,
         o.created_at as occurred_at,
         o.consumed_at,
         o.consumer
    from custom.io_outbox o
   where o.deleted_at is null;

comment on view custom.record_outbox is
  'DOOR-13: the change feed under the name and column spelling the platform''s records.changed workflow node asks the live catalogue for (matrx-records/nodes/records_nodes.py). One feed, two names: the table keeps this lane''s operational columns, the view is the trigger''s contract.';

revoke all on all tables in schema custom from public, anon, authenticated, service_role;
revoke all on all functions in schema custom from public, anon, authenticated, service_role;
