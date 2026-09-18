-- target: branch
-- w1_index_sync_door_follows_its_function — THE TWO PRODUCTION OBJECTS THE BRANCH LACKED
-- at 2026-09-17 20:1x UTC, found by `pnpm check:branch-schema-drift` at `W1-INDEX`'s entry.
--
-- `platform._door_follows_its_function()` and its `sql_drop` event trigger
-- `door_follows_its_function` landed on production after `W0-SYNC` levelled the branch at
-- 10:55 UTC. They matter to THIS lane specifically: every rule-27 inverse in this campaign
-- DROPs functions, and on production that drop records a `door_orphaned` row in
-- `platform.provision_shape_debt` for every door in the same schema. A lane that rehearses
-- its inverse on a branch without this trigger rehearses a drop that behaves differently on
-- production, which is exactly the `custom.record` class §3.36 exists to close.
--
-- The function body is production's own `pg_get_functiondef` output, verbatim; the event
-- trigger is rebuilt from `pg_event_trigger` (ON sql_drop, no tag filter). `DROP EVENT
-- TRIGGER IF EXISTS` precedes the CREATE so the file is re-runnable.
--
--   pnpm db:apply migrations/campaign/w1_index_sync_door_follows_its_function.sql \
--     --source campaign --target branch --lane W1-INDEX

set lock_timeout = '5s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION platform._door_follows_its_function()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  obj record;
  d   record;
begin
  -- 🚨 `object_name` IS NULL FOR A DROPPED FUNCTION — measured, not assumed. The first
  -- version of this matched `c.function_name = obj.object_name` and recorded ZERO debts
  -- for a drop that had definitely orphaned a door; the self-test below caught it. What
  -- `pg_event_trigger_dropped_objects()` gives for a function is `schema_name` and
  -- `object_identity` ('seo.set_page_map_facet(pg_catalog.uuid,text,text)'), and parsing a
  -- name back out of an identity means re-implementing identifier quoting. So the SCHEMA
  -- is the key: every door row in a schema that just lost a function is put in question,
  -- and each one answers for itself at COMMIT — a door whose function is alive owes
  -- nothing. Door rows per schema are a handful; being broad here costs nothing and
  -- cannot be wrong.
  for obj in select distinct schema_name from pg_event_trigger_dropped_objects()
              where object_type in ('function', 'procedure') and schema_name is not null
  loop
    for d in select * from platform.client_callable_door c where c.schema_name = obj.schema_name
    loop
      insert into platform.provision_shape_debt (txid, kind, object_ref, detail)
      values (pg_current_xact_id(), 'door_orphaned',
              d.schema_name || '.' || d.function_name || '(' || d.identity_args || ')',
              jsonb_build_object('schema_name', d.schema_name,
                                 'function_name', d.function_name,
                                 'identity_args', d.identity_args))
      on conflict do nothing;
    end loop;
  end loop;
end
$function$
;

DROP EVENT TRIGGER IF EXISTS door_follows_its_function;
CREATE EVENT TRIGGER door_follows_its_function ON sql_drop EXECUTE FUNCTION platform._door_follows_its_function();
