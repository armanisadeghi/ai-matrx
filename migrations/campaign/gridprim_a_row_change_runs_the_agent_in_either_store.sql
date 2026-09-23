-- target: branch,production
-- additive: yes
--   It REPLACES one body G4 wrote (gridprim_every_row_change_reaches_the_webhook.sql), declared
--   below with the body it was written against: `custom._record_events_to_activity` also writes a
--   record change onto the activity spine when a live SCHEDULE listens for that Table (not only a
--   webhook), and names the changed columns by key under `changed_fields`. Nothing is added,
--   dropped or revoked; no table, trigger, policy or grant is touched. Needs G4 and production's
--   `migrations/sch_event_trigger_matcher.sql` (scheduler.sch_match_event). For the 2026-09-24
--   window. The inverse is
--   `migrations/inverse/gridprim_a_row_change_runs_the_agent_in_either_store_down.sql`.
-- guard: custom/system_enabled
-- lock: custom
-- based-on: custom._record_events_to_activity() f6e7ac2b6639d4a8f0d6d1dcf68c638c790004a1889ead9c2bfe03c3f0282862
--
-- LANE GRID-PRIMITIVES, G8 (GRID-PORT finding F4) — "WHEN A ROW CHANGES, RUN AN AGENT", BOTH STORES.
--
-- The scheduler's event schedules fire from ONE place: scheduler.sch_match_event, an AFTER INSERT
-- trigger on platform.activity_log, matching trigger.config {entity_type, actions, table_id,
-- changed_fields} against each spine row. The older store feeds that spine from
-- workbench.udt_row_activity (entity_type `user_table_row`, actions row.*). The record store fed
-- it only for tables with a webhook (G4), so a schedule on a record-store table never fired and
-- the port had to hide the menu item.
--
-- ONE PATH: the record store's change event (G4's, from custom.io_outbox) now also lands whenever
-- an enabled `event` schedule of that organization listens to `custom_record:<table id>`, and it
-- carries `changed_fields` (column keys, the older store's word) beside `changed_field_ids`, so
-- sch_match_event's `table_id` and `changed_fields` filters read both stores the same way. The
-- schedule config for a record-store table is
--   {"entity_type": "custom_record:<table id>", "actions": ["record.updated"],
--    "table_id": "<table id>", "changed_fields": ["<column key>"]}
-- (`@ai-matrx/records` recordChangeTrigger builds it). No second matcher, no second executor.
--
-- LOCKS. create or replace function only. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom._record_events_to_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  insert into platform.activity_log (organization_id, entity_type, entity_id, action, actor_id, metadata)
  select n.organization_id,
         'custom_record:' || n.table_id::text,
         n.record_id,
         'record.' || case
           when n.operation = 'updated' then 'updated'
           when n.operation = 'created' and coalesce(r.version, 1) > 1 then 'restored'
           when n.operation = 'created' then 'created'
           when n.operation = 'deleted' and r.id is null then 'purged'
           when n.operation = 'deleted' then 'archived'
           else n.operation end,
         nullif(n.actor ->> 'user_id', '')::uuid,
         jsonb_build_object(
           'table_id',          n.table_id,
           'table_name',        t.data ->> 'name',
           'record_id',         n.record_id,
           'version',           r.version,
           'changed_field_ids', n.changed_field_ids,
           -- G8: the changed columns by KEY, the older store's `changed_fields` word, so the
           -- scheduler's `changed_fields` filter (scheduler.sch_match_event) reads both stores
           -- one way.
           'changed_fields',    coalesce((select jsonb_agg(f.data ->> 'key' order by f.data ->> 'key')
                                            from custom.record f
                                           where f.organization_id = n.organization_id
                                             and f.table_id = custom.field_kernel_id()
                                             and f.id::text in (select jsonb_array_elements_text(
                                                   case when jsonb_typeof(n.changed_field_ids) = 'array'
                                                        then n.changed_field_ids else '[]'::jsonb end))),
                                         '[]'::jsonb),
           'actor_tier',        n.actor ->> 'tier',
           'source',            'custom.io_outbox')
    from new_rows n
    left join custom.record r on r.organization_id = n.organization_id and r.id = n.record_id
    left join custom.record t on t.organization_id = n.organization_id and t.id = n.table_id
   where n.event_key = 'records.changed'
     and n.table_id is not null
     and (exists (select 1 from files.webhooks w
                   where w.is_active
                     and w.organization_id = n.organization_id
                     and ('custom_record:' || n.table_id::text) = any (w.resource_types))
          -- G8: ONE PATH FOR BOTH STORES. A schedule that runs an agent when a row changes
          -- (scheduler.sch_trigger type `event`) listens to the same activity spine the older
          -- store's workbench.udt_row_activity writes, and scheduler.sch_match_event fires it
          -- from there. A record-store table's changes now land on that spine whenever a live
          -- schedule listens for them, exactly as they do for a webhook.
          or exists (select 1 from scheduler.sch_trigger t
                      where t.type = 'event' and t.enabled and t.deleted_at is null
                        and t.organization_id = n.organization_id
                        and t.config ->> 'entity_type' = 'custom_record:' || n.table_id::text))
     -- The organization's own store switch (the guard this file names): a store that is off
     -- announces nothing, to a webhook or to a schedule.
     and platform.knob_resolve('custom', 'system_enabled', n.organization_id) is distinct from 'false'::jsonb;
  return null;
end
$function$;
