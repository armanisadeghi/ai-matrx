-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- REALTIME, file 3 — THE EMISSION. A NOTICE, NEVER DATA.
--
-- THE PAYLOAD CARRIES NO VALUES. `{table_id, kind, op, record_ids, fields_changed, at}` and
-- nothing else — no titles, no cells, not one field. Per-record visibility is decided by the
-- ladder at READ time, and a payload carrying values would travel PAST that decision: one
-- topic serves a whole Table, and two people admitted to the same Table do not necessarily
-- see the same rows in it. So the notice says which ids MOVED, the client re-reads them
-- through `custom.read_records`, and a record the reader may not see simply does not come
-- back. That is Linear's sync in one sentence: notify, then fetch through the front door.
--
-- WHERE IT IS EMITTED FROM, AND WHY IT IS NOT `custom.record`.
-- The chair's ruling names statement-level AFTER triggers on `custom.record`. There are
-- already three — `io_record_changed_s_i/_s_u/_s_d` — and they have already done the whole
-- job: per statement, in ONE insert, they write `custom.io_outbox` with the organization, the
-- table, the record, the OPERATION (including the one that matters, a soft delete being a
-- delete to everyone downstream) and `changed_field_ids`, and they have already dropped the
-- updates where no value actually moved. Re-deriving all of that beside them would mean a
-- second definition of "what changed" on the hot write path, and the campaign has spent a
-- fortnight removing exactly that class. So this trigger hangs off `custom.io_outbox` and
-- reads what is already there: still statement-level, still one broadcast per statement per
-- table, still ids batched — and it costs the write path one aggregate over a transition
-- table instead of a second pass over the records themselves.
--
-- THREE KINDS, BECAUSE A COLUMN IS NOT A ROW. A Field and a Table are records too, and their
-- outbox rows carry the KERNEL's id in `table_id`, not the user's table. A notice that said
-- `table_id = <the Field kernel>` would arrive on a topic nobody is watching, and a client
-- told "records changed" when a COLUMN was added would re-read rows and never notice the new
-- column. So the subject table is resolved (a Field's `entity_definition_id`; a Table's own
-- id) and the notice says which `kind` moved, so the screen knows whether to re-read the rows
-- or the shape. The lookup fires ONLY for Field rows — the ordinary record write, which is
-- the whole of the bulk path, joins nothing.
--
-- THE CAP, AND WHAT IS ABOVE IT. Fifty thousand ids is not a notice, it is a payload, and
-- Realtime has a message size ceiling. Above 200 ids `record_ids` is `null`, which MEANS
-- "re-read the page" — stated in the payload rather than left for a client to infer from a
-- truncated array it cannot tell from a complete one.
--
-- NOTHING FAILS SILENTLY, INCLUDING THE BROADCAST ITSELF. `realtime.send` swallows every
-- error into a `raise warning` — a missing daily partition, a permission change, anything —
-- so a store could go quietly un-live for a day and every screen would look healthy. This
-- generates the message id itself, hands it to `realtime.send` (which honours a payload `id`),
-- and then LOOKS FOR THE ROW. If it is not there the failure is recorded in `ops.system_error`
-- against the real organization. It never raises: a person's write must not fail because the
-- announcement of it did.

create function custom._realtime_notice(
  p_organization_id uuid,
  p_table_id        uuid,
  p_kind            text,
  p_op              text,
  p_record_ids      jsonb,
  p_fields_changed  boolean
) returns void
language plpgsql
volatile
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_id    uuid := gen_random_uuid();
  v_topic text := 'custom:table:' || p_table_id::text;
  v_land  boolean;
begin
  perform realtime.send(
    jsonb_build_object(
      'id',             v_id,
      'table_id',       p_table_id,
      'kind',           p_kind,
      'op',             p_op,
      'record_ids',     p_record_ids,      -- null MEANS "re-read the page"
      'fields_changed', p_fields_changed,
      'at',             to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    'records.changed',
    v_topic,
    true);

  -- THE READ-BACK. `realtime.send` returns void whether it worked or not.
  select exists (select 1 from realtime.messages m where m.id = v_id) into v_land;
  if not v_land then
    insert into ops.system_error (kind, error_type, error_text, source_feature, route,
                                  organization_id, payload)
    values ('realtime_notice_not_delivered', 'realtime.send',
            'The record store announced a change and the message did not land in realtime.messages, so screens watching this table will not update until they are reloaded.',
            'custom.realtime', v_topic, p_organization_id,
            jsonb_build_object('topic', v_topic, 'kind', p_kind, 'op', p_op,
                               'message_id', v_id));
  end if;
exception when others then
  -- A person's write must never fail because the announcement of it did.
  begin
    insert into ops.system_error (kind, error_type, error_text, source_feature, route,
                                  organization_id, payload)
    values ('realtime_notice_failed', sqlstate, sqlerrm, 'custom.realtime', v_topic,
            p_organization_id, jsonb_build_object('topic', v_topic, 'kind', p_kind, 'op', p_op));
  exception when others then
    raise warning 'custom._realtime_notice could not record its own failure on %: %', v_topic, sqlerrm;
  end;
end;
$$;

comment on function custom._realtime_notice(uuid, uuid, text, text, jsonb, boolean) is
  'Sends ONE notice on custom:table:<table_id> and then looks for the row, because realtime.send swallows its own failures. Records a miss in ops.system_error against the real organization; never raises, so a write is never lost to a failed announcement.';

-- NOBODY MAY CALL THIS FROM A CLIENT, AND THAT IS SAID IN DATA RATHER THAN IN THE COMMENT
-- ABOVE IT. It takes an organization id and a table id and writes a message on that table's
-- topic, so a client that could call it could announce a change in a company it has never
-- heard of — every screen watching that table would re-read for nothing, and a screen can be
-- made to look busy or to flicker by a stranger. Its ONE caller is the statement trigger
-- below, in the same transaction as the write it is announcing.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', '_realtime_notice',
   'p_organization_id uuid, p_table_id uuid, p_kind text, p_op text, p_record_ids jsonb, p_fields_changed boolean',
   'Checked against nothing, because it decides nothing: it is a fan-out step that runs AFTER custom.io_record_changed_stmt_* has already written the outbox row under the store''s own doors, and both ids come from that row rather than from a caller. p_organization_id is used only to file a failure in ops.system_error against the right company; p_table_id only to build the topic string. Neither may be NULL — a null organization files an unattributable error and a null table builds the topic `custom:table:` which no policy admits — and neither is ever supplied by anything but the trigger.',
   'realtime_a_change_is_announced_as_a_notice.sql',
   'server_only: the ONE caller is the statement trigger custom.io_outbox_broadcast_stmt on custom.io_outbox, in the same transaction as the write it announces. No client ever calls it, because a client that could would be able to announce a change in any organization on any table — which costs every watching screen a re-read and lets a stranger make a list flicker.',
   false, false)
on conflict do nothing;

-- ── THE EMITTER ─────────────────────────────────────────────────────────────────────────
create function custom.io_outbox_broadcast_stmt()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_cap          constant integer := 200;
  v_field_kernel uuid := custom.field_kernel_id();
  v_table_kernel uuid := custom.table_kernel_id();
  r              record;
begin
  for r in
    with subject as (
      select n.organization_id,
             case when n.table_id = v_table_kernel then n.record_id
                  when n.table_id = v_field_kernel then f.entity_definition_id
                  else n.table_id end                                      as table_id,
             case when n.table_id = v_table_kernel then 'table'
                  when n.table_id = v_field_kernel then 'field'
                  else 'record' end                                        as kind,
             n.operation,
             n.record_id,
             coalesce(jsonb_array_length(n.changed_field_ids), 0) > 0      as fields_changed
        from new_rows n
        -- ONLY Field rows pay for this. The ordinary record write — the whole bulk path —
        -- matches nothing here and the join contributes no rows and no lookups.
        left join lateral (
          select (c.data ->> 'entity_definition_id')::uuid as entity_definition_id
            from custom.record c
           where c.organization_id = n.organization_id
             and c.id = n.record_id
        ) f on n.table_id = v_field_kernel
       where n.event_key = 'records.changed'
    )
    select s.organization_id,
           s.table_id,
           s.kind,
           s.operation,
           count(*)                    as n,
           jsonb_agg(s.record_id)      as ids,
           bool_or(s.fields_changed)   as fields_changed
      from subject s
     where s.table_id is not null
     group by s.organization_id, s.table_id, s.kind, s.operation
  loop
    perform custom._realtime_notice(
      r.organization_id, r.table_id, r.kind, r.operation,
      case when r.n > v_cap then null else r.ids end,
      r.fields_changed);
  end loop;

  return null;
end;
$$;

comment on function custom.io_outbox_broadcast_stmt() is
  'One broadcast per statement per (table, kind, operation), ids batched and capped at 200. Reads what custom.io_record_changed_stmt_* already wrote, so "what changed" has exactly one definition on the write path.';

-- `zzz_` so it fires last, after everything else the outbox row sets off — the store's own
-- ordering convention, the same one `zzz_history_capture_s_*` uses on `custom.record`.
create trigger zzz_io_outbox_broadcast_s
  after insert on custom.io_outbox
  referencing new table as new_rows
  for each statement
  execute function custom.io_outbox_broadcast_stmt();
