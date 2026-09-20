-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.agg_subscription_tick(interval) 90f827aa15c5f37461837e149637c8860246d55f61398d0320cf34e997e9c7fc
--
-- A DEFECT THE FIRST LIVE RUN FOUND, AND ITS CLASS.
--
-- `custom.agg_subscription_tick` collapsed the outbox to one row per record with
-- `group by ob.record_id` and `min(ob.table_id)`. PostgreSQL has no `min(uuid)`, so
-- EVERY organization with a change in the window was caught by the tick's own
-- per-organization exception arm and skipped:
--
--   WARNING: custom.agg_subscription_tick: organization 884d1ce8-… skipped —
--            function min(uuid) does not exist
--
-- It returned 0 and looked like a quiet night. The fix is to group by the two
-- columns rather than to aggregate one of them: a record belongs to exactly one
-- Table, so (record_id, table_id) is already one row per record and there was
-- nothing to reduce.
--
-- THE CLASS, not the instance: the arm that swallowed it was written so one
-- organization's switched-off store could not stop every other organization being
-- told, and that is still right — but it turned a programming error into silence.
-- It now RE-RAISES anything that is not a refusal the loop is meant to step over
-- (42501 insufficient_privilege, 23503 a view deleted mid-tick, and the store
-- switch's own 42501), so a bug in this function fails the tick loudly in the cron
-- log instead of reading as "nothing happened tonight" for every tenant at once.

set lock_timeout = '5s';
set statement_timeout = '600s';

create or replace function custom.agg_subscription_tick(p_window interval default '15 minutes')
returns integer
language plpgsql
set search_path to 'pg_catalog'
as $fn$
declare
  o       record;
  e       record;
  v_since timestamptz := now() - greatest(coalesce(p_window, interval '15 minutes'), interval '1 minute');
  v_n     integer := 0;
begin
  for o in
    select distinct ob.organization_id
      from custom.io_outbox ob
     where ob.created_at > v_since and ob.deleted_at is null and ob.event_key = 'records.changed'
  loop
    begin
      -- IT DOES NOT CLAIM THE OUTBOX. `consumed_at` is ONE column and ONE consumer,
      -- so a notifier that drained it would silently starve every import, export
      -- and webhook consumer of the same feed. Re-reading the same window is free:
      -- custom.agg_deliver's dedupe key is a UNIQUE constraint, so the second read
      -- of an event sends nothing.
      for e in
        select ob.record_id, ob.table_id
          from custom.io_outbox ob
         where ob.organization_id = o.organization_id
           and ob.created_at > v_since and ob.deleted_at is null
           and ob.event_key = 'records.changed'
         group by ob.record_id, ob.table_id
      loop
        v_n := v_n + custom.agg_subscription_fire_entered(o.organization_id, e.record_id,
                                                          e.table_id, v_since);
      end loop;
    exception
      when insufficient_privilege or foreign_key_violation then
        -- One organization with the store switched off, or a view somebody deleted
        -- mid-tick. Skipped, said out loud, and every other organization still told.
        raise warning 'custom.agg_subscription_tick: organization % skipped — %', o.organization_id, sqlerrm;
    end;
  end loop;
  return v_n;
end;
$fn$;
