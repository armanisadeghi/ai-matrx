-- INVERSE of realtime2_the_emitter_reads_the_platform_switch.sql — restores custom.io_outbox_broadcast_stmt()
-- to the body lane REALTIME shipped (no platform-switch read). Captured from the live catalogue 2026-09-21.

CREATE OR REPLACE FUNCTION custom.io_outbox_broadcast_stmt()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$
;
