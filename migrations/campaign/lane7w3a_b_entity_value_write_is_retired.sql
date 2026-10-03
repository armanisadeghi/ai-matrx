-- chair-step: this file DROPS custom.entity_value_write(uuid, text, uuid, jsonb) — a client door
-- (EXECUTE to authenticated) — and its platform.client_callable_door row. It REVOKES that grant by
-- dropping the function. No table DDL, no strong lock on a table.
-- based-on: custom.entity_value_write(uuid, text, uuid, jsonb) 4dfae77bde95b76f5e89b3347ade47cf6fd2067dee32c12bed46bb2973e1b103
--
-- LANE 7 · STANDARD-TABLES · W3a (design N7): ONE WRITE DOOR FOR A STANDARD ROW.
-- custom.entity_row_write (lane7w3a_the_table_api_reaches_crm_people.sql) is the one door; this
-- retires the second. Callers, proven 2026-10-03:
--   database  no function or view calls it (pg_proc.prosrc: two COMMENTS in
--             custom._entity_custom_fields_guard and custom._entity_choice_keys name it; 0 views)
--   code      aidream: @ai-matrx/records entityValueWrite -> entityRowWrite (doors.ts, client.ts,
--             store.generated.ts, react/hooks.ts), @ai-matrx/records-ui CustomFieldsSection and
--             its tests, matrx_records RecordStore.entity_value_write removed (the records tool's
--             entity_write already refuses); matrx-frontend types/database.types.ts.
--   guard     aidream/services/table_api/tests/test_one_write_door_for_standard_rows.py fails on
--             any new reference outside migrations and changelogs.
-- 🚨 APPLY ONLY WHEN ALL THREE HOLD — on the clone as much as on production (the clone is shared:
-- 2026-10-03 a rehearsal of this file broke every custom-value save on :3001, because the
-- published @ai-matrx/records-ui 0.93.142–0.93.146 still calls this door; restored at once):
--   1. a published @ai-matrx/records-ui (and @ai-matrx/records) whose CustomFieldsSection and
--      entity-fields hook call client.entityRowWrite, never entityValueWrite (aidream 0c02d5442f);
--   2. matrx-frontend is installed on that version (its lockfile, and the deployed app);
--   3. the deployed aidream server carries no caller (RecordStore.entity_value_write removed,
--      aidream 0c02d5442f; the records tool's entity_write already refuses).
-- The file also REFUSES by itself while the database can still see a caller (the check below):
-- a function body that calls it, or a call to it recorded in pg_stat_statements. To clear the
-- second after 1–3 hold, reset only this door's entries
--   select extensions.pg_stat_statements_reset(0, 0, s.queryid) from extensions.pg_stat_statements s
--    where s.query ~* 'entity_value_write"?\s*\(' and s.query !~* '^\s*(create|grant|revoke|drop|comment)';
-- wait a full working day, and apply: any call in between is a caller still alive, and the drop refuses.

set local lock_timeout = '3s';

-- THE DROP REFUSES WHILE A CALLER REMAINS THAT THE DATABASE CAN SEE.
DO $$
DECLARE
  v_bodies text;
  v_calls  bigint := 0;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bodies
    FROM pg_proc p
   WHERE p.proname <> 'entity_value_write'
     AND p.prosrc ~* 'entity_value_write"?\s*\(';
  IF v_bodies IS NOT NULL THEN
    RAISE EXCEPTION 'custom.entity_value_write still has callers in the database (%), so it was not dropped.', v_bodies
      USING errcode = '55006', hint = 'Move them to custom.entity_row_write first.';
  END IF;
  IF to_regclass('extensions.pg_stat_statements') IS NOT NULL THEN
    EXECUTE $q$select coalesce(sum(s.calls), 0) from extensions.pg_stat_statements s
                where s.query ~* 'entity_value_write"?\s*\(' and s.query !~* '^\s*(create|grant|revoke|drop|comment)'$q$
      INTO v_calls;
  END IF;
  IF v_calls > 0 THEN
    RAISE EXCEPTION 'custom.entity_value_write was called % time(s) since its statistics began, so a caller may still be alive and it was not dropped.', v_calls
      USING errcode = '55006',
            hint = 'Confirm the published records-ui, matrx-frontend and the aidream server no longer call it, reset this door''s pg_stat_statements entries (see the header), wait a working day, then apply again.';
  END IF;
END $$;

DELETE FROM platform.client_callable_door WHERE schema_name = 'custom' AND function_name = 'entity_value_write';
DROP FUNCTION custom.entity_value_write(uuid, text, uuid, jsonb);
