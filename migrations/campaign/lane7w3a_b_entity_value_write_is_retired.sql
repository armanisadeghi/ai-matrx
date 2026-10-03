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
-- ORDER (chair): apply only after @ai-matrx/records and @ai-matrx/records-ui carrying
-- entityRowWrite are published and matrx-frontend runs them; an older package still calls this.

set local lock_timeout = '3s';

DELETE FROM platform.client_callable_door WHERE schema_name = 'custom' AND function_name = 'entity_value_write';
DROP FUNCTION custom.entity_value_write(uuid, text, uuid, jsonb);
