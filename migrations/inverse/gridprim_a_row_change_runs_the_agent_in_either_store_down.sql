-- lock: custom
-- lane: GRID-PRIMITIVES
-- based-on: custom._record_events_to_activity() 9b41aaf060999459f4c3ab6aaddbf29339a451297598e12c11741764f813c7f3
-- chair-step: the inverse of gridprim_a_row_change_runs_the_agent_in_either_store.sql. It puts
-- custom._record_events_to_activity back to G4's body. WHAT THAT MEANS: a schedule on a
-- record-store table stops firing (its changes reach the spine only when a webhook listens), and
-- the events lose changed_fields. Schedules and their past runs are untouched.

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
           'actor_tier',        n.actor ->> 'tier',
           'source',            'custom.io_outbox')
    from new_rows n
    left join custom.record r on r.organization_id = n.organization_id and r.id = n.record_id
    left join custom.record t on t.organization_id = n.organization_id and t.id = n.table_id
   where n.event_key = 'records.changed'
     and n.table_id is not null
     and exists (select 1 from files.webhooks w
                  where w.is_active
                    and w.organization_id = n.organization_id
                    and ('custom_record:' || n.table_id::text) = any (w.resource_types));
  return null;
end
$function$

;
