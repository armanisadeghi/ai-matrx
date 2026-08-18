-- Bound unqualified production DDL lock waits before they can convoy live
-- application traffic behind an exclusive-lock request. Callers that set an
-- explicit nonzero lock_timeout keep their chosen value.

SET LOCAL lock_timeout = '8s';

CREATE OR REPLACE FUNCTION platform._bound_ddl_lock_wait()
RETURNS event_trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF current_setting('lock_timeout', true) IN ('0', '0ms', '0s') THEN
    PERFORM set_config('lock_timeout', '8s', true);
    RAISE NOTICE
      'ddl_lock_timeout_guard: bounded % lock wait to 8s; set an explicit nonzero lock_timeout before DDL to choose a different bound',
      tg_tag;
  END IF;
END;
$function$;

DROP EVENT TRIGGER IF EXISTS ddl_lock_timeout_guard;
CREATE EVENT TRIGGER ddl_lock_timeout_guard
  ON ddl_command_start
  EXECUTE FUNCTION platform._bound_ddl_lock_wait();

