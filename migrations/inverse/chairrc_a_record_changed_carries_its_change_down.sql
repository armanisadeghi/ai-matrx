-- Inverse of chairrc_a_record_changed_carries_its_change.sql: the five live bodies back byte for byte
-- (read from the clone, identical to production by based-on hash on 2026-10-02), the new functions
-- dropped, the registry rows put back, the drain re-granted to signed-in callers.
-- chair-step: re-grants EXECUTE on custom.io_outbox_drain to authenticated.

CREATE OR REPLACE FUNCTION custom.io_record_changed_stmt_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org   uuid;
  v_actor jsonb;
  v_op    uuid;
begin
  for v_org in select distinct n.organization_id from new_rows n loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  -- WHO IS WRITING. A fact about the connection, not about the row.
  v_actor := jsonb_build_object(
               'user_id', custom.query_principal(),
               'role',    custom.caller_role()::text,
               'tier',    coalesce(platform.declared_actor_tier(), platform.actor_tier()));
  v_op := nullif(current_setting('custom.op_id', true), '')::uuid;

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id)
  with changed as (
    select n.organization_id, n.id, n.table_id, n.data, n.version,
           custom.io_changed_keys('{}'::jsonb, n.data) as keys
      from new_rows n
  )
  select c.organization_id, 'records.changed', c.id, c.table_id, 'created',
         case when coalesce(array_length(c.keys, 1), 0) = 0
              then '[]'::jsonb
              else coalesce((select coalesce(jsonb_agg(distinct f.id), '[]'::jsonb)
                               from unnest(c.keys) k
                               join custom.applicable_fields(c.organization_id, c.table_id, null) f
                                 on (f.data ->> 'key') = k), '[]'::jsonb) end,
         v_actor || jsonb_build_object('declared', coalesce(c.data, '{}'::jsonb) ->> '_actor'),
         c.organization_id::text || ':' || c.id::text || ':' || coalesce(c.version, 0)::text || ':created',
         v_op
    from changed c
   order by c.id
  on conflict do nothing;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_record_changed_stmt_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org uuid;
begin
  for v_org in select distinct n.organization_id from new_rows n loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id)
  select n.organization_id, 'records.changed', n.id, n.table_id, k.op,
         -- The row trigger's `v_changed`, character for character: `[]` when no key moved,
         -- otherwise the field ids of (old.data -> new.data) — the old side is `old.data`
         -- whenever tg_op is UPDATE, which is every row here, including the restore arm.
         case when coalesce(array_length(k.keys, 1), 0) = 0
              then '[]'::jsonb
              else custom.io_changed_field_ids(n.organization_id, n.table_id,
                     o.data, coalesce(n.data, '{}'::jsonb)) end,
         jsonb_build_object(
           'user_id',   custom.query_principal(),
           'role',      custom.caller_role()::text,
           'tier',      coalesce(platform.declared_actor_tier(), platform.actor_tier()),
           'declared',  coalesce(n.data, o.data) ->> '_actor'),
         n.organization_id::text || ':' || n.id::text || ':' ||
           coalesce(n.version, o.version, 0)::text || ':' || k.op,
         nullif(current_setting('custom.op_id', true), '')::uuid
    from new_rows n
    join old_rows o
      on o.organization_id = n.organization_id and o.id = n.id
    cross join lateral (
      select
        -- A soft delete is a DELETE to everyone downstream. An automation that fired "updated"
        -- when a record disappeared would be lying in the one case people notice.
        case when n.deleted_at is not null and o.deleted_at is null then 'deleted'
             when o.deleted_at is not null and n.deleted_at is null then 'created'
             else 'updated' end as op,
        case when n.deleted_at is not null and o.deleted_at is null then array[]::text[]
             when o.deleted_at is not null and n.deleted_at is null
               then custom.io_changed_keys('{}'::jsonb, n.data)
             else custom.io_changed_keys(o.data, n.data) end as keys) k
   -- NO VALUE MOVED, so there is no event. Asked of the KEYS, never of the resolved Field ids.
   where not (k.op = 'updated'
              and coalesce(array_length(k.keys, 1), 0) = 0
              and o.deleted_at is not distinct from n.deleted_at)
   order by n.id
  on conflict do nothing;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_record_changed_stmt_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org uuid;
begin
  for v_org in select distinct o.organization_id from old_rows o loop
    perform custom.assert_store_door(v_org, 'custom.io_record_changed');
  end loop;

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key, op_id)
  select o.organization_id, 'records.changed', o.id, o.table_id, 'deleted',
         -- On a delete `v_keys` is empty by construction, so the answer is `[]` whatever the
         -- join would have done — and asking anyway made a deletion event depend on the caller
         -- still being allowed to READ the Table.
         '[]'::jsonb,
         jsonb_build_object(
           'user_id',   custom.query_principal(),
           'role',      custom.caller_role()::text,
           'tier',      coalesce(platform.declared_actor_tier(), platform.actor_tier()),
           'declared',  o.data ->> '_actor'),
         o.organization_id::text || ':' || o.id::text || ':' || coalesce(o.version, 0)::text || ':deleted',
         nullif(current_setting('custom.op_id', true), '')::uuid
    from old_rows o
   order by o.id
  on conflict do nothing;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_outbox_drain(p_organization_id uuid, p_consumer text, p_limit integer DEFAULT 100, p_event_key text DEFAULT 'records.changed'::text)
 RETURNS TABLE(outbox_id uuid, record_id uuid, table_id uuid, operation text, changed_field_ids jsonb, actor jsonb, occurred_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_store_door(p_organization_id, 'custom.io_outbox_drain');
  -- THE MEMBERSHIP DECISION, before anything is claimed. A definer door applies no row-level
  -- security, so this is the only thing standing between a signed-in caller and another
  -- organization's outbox. Same helper the write doors use (w4_door_the_write_doors_are_client_callable.sql).
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_outbox_drain');
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
            limit custom.page_size(p_organization_id, 'custom.io_outbox_drain', p_limit, 100, 1000)
            for update skip locked)
  returning o.id, o.record_id, o.table_id, o.operation, o.changed_field_ids, o.actor, o.created_at;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_outbox_release(p_organization_id uuid, p_consumer text, p_older_than interval DEFAULT '00:15:00'::interval)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

drop function if exists custom.record_changes_drain(uuid, text, integer);
drop function if exists custom.io_outbox_subscribe(text, text);
drop function if exists custom.io_outbox_backlog(text, text, interval);
drop function if exists custom.io_outbox_pending_organizations(text, text);
drop function if exists custom.io_outbox_release_claimed(uuid, text, uuid[]);
drop function if exists custom._io_outbox_claim(uuid, text, text, integer);
drop function if exists custom._io_outbox_server_only(text);
drop function if exists custom.io_change_actor();
drop function if exists custom.io_change_fields(text[], jsonb, jsonb);
drop function if exists custom.io_workflow_chain();
drop function if exists custom.io_outbox_per_consumer();

delete from platform.client_callable_door
 where schema_name = 'custom' and declared_by = 'CHAIR-RECORD-CHANGED';
update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null, reason = 'W4-DOOR / DOOR-13: the drain door, and a client-callable one. Switch first (custom.assert_store_door), then membership (custom.assert_client_may_reach for auth.uid()) before any row is claimed — a signed-in caller can read and claim only their own organization''s outbox, by the WHERE clause and by this check. custom.io_outbox_release stays server-only: it is queue maintenance for a dead consumer, not part of draining.'
 where schema_name = 'custom' and function_name = 'io_outbox_drain';
grant execute on function custom.io_outbox_drain(uuid, text, integer, text) to authenticated;

delete from platform.metadata_reserved_keys where table_token = 'io_outbox' and key = 'change';
