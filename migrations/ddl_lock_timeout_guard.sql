-- Bound unqualified production DDL lock waits before they can convoy live
-- application traffic behind an exclusive-lock request. Callers that set an
-- explicit nonzero lock_timeout keep their chosen value.
--
-- 2026-09-12: lowered 8s -> 2s. A DDL request waiting for a lock queues every
-- new reader of that table behind it for the whole wait; at 8s that is longer
-- than every production read budget (sandbox change feed 4.5s, ALB readiness
-- ping 5s, authenticated statement cap 8s), so a single live migration on
-- auth.users / files.files failed readiness on both ECS tasks (04:13 UTC).
-- 2s sits under all of them. A migration that cannot take its lock inside 2s
-- retries in a loop; it never waits longer. NOTE this bounds WAITING only —
-- a transaction that regenerates 306 tables holds every lock until commit, and
-- must commit per table (db-rules FEATURE.md).

SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION platform._bound_ddl_lock_wait()
RETURNS event_trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF current_setting('lock_timeout', true) IN ('0', '0ms', '0s') THEN
    PERFORM set_config('lock_timeout', '2s', true);
    RAISE NOTICE
      'ddl_lock_timeout_guard: bounded % lock wait to 2s (under every production read budget); set an explicit nonzero lock_timeout before DDL to choose a different bound, and commit per table — this bounds waiting, never holding',
      tg_tag;
  END IF;
END;
$function$;

DROP EVENT TRIGGER IF EXISTS ddl_lock_timeout_guard;
CREATE EVENT TRIGGER ddl_lock_timeout_guard
  ON ddl_command_start
  EXECUTE FUNCTION platform._bound_ddl_lock_wait();

