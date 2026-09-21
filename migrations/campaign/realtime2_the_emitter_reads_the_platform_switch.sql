-- target: branch,production
-- additive: yes
-- guard: platform/realtime_broadcast_enabled
-- based-on: custom.io_outbox_broadcast_stmt() 05081fb8a3617889bc9a5a589373ceefe50ee9a95b15f8a6925bd5594e3d6e91
--
-- REALTIME-2, file 1 — THE WRITE PATH STOPS PAYING FOR NOTICES NOBODY MAY RECEIVE.
--
-- THE GUARD IS THE SWITCH THIS BODY ACTUALLY READS, which is the only kind of guard the
-- applier accepts on a replacement — a knob a body never names is a comment, not a switch.
-- `platform/realtime_broadcast_enabled` was ON when this file was written (lane REALTIME
-- turned it on once two browsers proved a change travels), so it was set OFF for the length
-- of this apply and back ON immediately after. With it off, the path this file changes is the
-- path nobody can subscribe to anyway.
--
-- `platform/realtime_broadcast_enabled` is read in exactly two places today: the USING clause
-- of the one RLS policy on `realtime.messages`, and the body of `platform.realtime_topic_admits`.
-- Both are on the SUBSCRIBE path. Nothing on the WRITE path reads it at all — so with the
-- platform switch OFF, every statement that touches `custom.io_outbox` still builds a notice,
-- still inserts a row into `realtime.messages`, and still reads that row back, for an audience
-- that the policy is guaranteed to refuse. The store pays for a broadcast that cannot be heard.
--
-- One knob read per STATEMENT (not per row) closes that, and it is the same switch the
-- subscriber side already asks, so there is still exactly ONE answer to "does this database
-- authorize a private channel at all" and the write path and the read path cannot disagree.
--
-- IT IS ALSO THE MEASUREMENT LEVER, and that is said here rather than hidden. Lane REALTIME
-- hung the emitter off `custom.io_outbox` rather than `custom.record`, so its write-path cost
-- was argued rather than measured. Measuring it by `ALTER TABLE custom.io_outbox DISABLE
-- TRIGGER` would take an ACCESS EXCLUSIVE lock on the busiest table in the store for the whole
-- length of a five-thousand-row probe, on a database eight other lanes are landing work on.
-- With this line in place the probe flips one knob row instead, inside its own ROLLBACK
-- transaction, and never blocks a peer. `scripts/campaign-tests/realtime2_write_cost.sql`.
--
-- WHAT IT DOES NOT DO. It does not skip the OUTBOX. `custom.io_outbox` is the store's own
-- change feed and has consumers that have nothing to do with realtime; this trigger is the
-- broadcast fan-out at the end of it and only that fan-out stops.

create or replace function custom.io_outbox_broadcast_stmt()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_cap          constant integer := 200;
  v_field_kernel uuid;
  v_table_kernel uuid;
  r              record;
begin
  -- THE PLATFORM'S OWN SWITCH, ASKED ONCE PER STATEMENT. When this database does not
  -- authorize private channels, no subscriber can ever be admitted to one of these topics, so
  -- a notice written now is a row nobody will ever read. Exactly the same expression the RLS
  -- policy uses, so the two sides cannot drift.
  if not coalesce(
       (platform.knob_resolve('platform', 'realtime_broadcast_enabled', null) #>> '{}')::boolean,
       false)
  then
    return null;
  end if;

  v_field_kernel := custom.field_kernel_id();
  v_table_kernel := custom.table_kernel_id();

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
  'One broadcast per statement per (table, kind, operation), ids batched and capped at 200. Reads what custom.io_record_changed_stmt_* already wrote, so "what changed" has exactly one definition on the write path. Returns immediately when platform/realtime_broadcast_enabled is off — the same switch the one RLS policy on realtime.messages reads, so the write path never pays for a notice no subscriber could be admitted to.';
