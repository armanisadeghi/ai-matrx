-- chair-step: the inverse of
--   `migrations/campaign/oldtables_w2_the_older_store_gets_its_own_words_door.sql`.
--   It DROPS the four functions that file created — `workbench.udt_row_words_many`,
--   `workbench._udt_row_words`, `workbench._udt_row_granted` and `workbench._udt_display_spec` —
--   and deletes their four rows from `platform.client_callable_door`. Every one of the four was
--   created by that file and by nothing else; none existed before 2026-09-22. No row of anybody's
--   data is read or written, `custom._words_for` and the three `custom.*_words` doors are not
--   touched by either direction, and the older estate goes back to having no words door at all —
--   which is the state W1 shipped into, where a relation cell renders as W1's amber identifier
--   chip because nothing resolves it.
--
--   THE LOCK: `drop function` fires the `sql_drop` event trigger `door_follows_its_function`,
--   which withdraws the door rows for a function that has gone. It does NOT issue policy DDL and
--   it is NOT a `drop trigger` — the two statements OLD-TABLES-1 measured taking ACCESS EXCLUSIVE
--   on the 23-relation `supautils.policy_grants` set (~500 ms) and the 41-relation set (~810 ms)
--   respectively. MEASURED on the clone 2026-09-22 (`pnpm db:rehearse … --target clone`, leg 2):
--   five statements, 81–85 ms each, and the runner's verdict was "no ACCESS EXCLUSIVE lock on any
--   relation this file does not name". The only ACCESS EXCLUSIVE each `drop function` takes is on
--   the function OBJECT itself (`object:?`), which blocks nobody. THIS INVERSE IS THEREFORE NOT
--   WINDOW-CLASS and may be run at any hour.
--
-- lock: platform
-- lane: OLD-TABLES-2

delete from platform.client_callable_door
 where schema_name = 'workbench'
   and function_name in ('udt_row_words_many', '_udt_row_words', '_udt_row_granted', '_udt_display_spec');

drop function if exists workbench.udt_row_words_many(uuid, jsonb, uuid[]);
drop function if exists workbench._udt_row_words(uuid, uuid, jsonb, integer);
drop function if exists workbench._udt_row_granted(uuid);
drop function if exists workbench._udt_display_spec(jsonb);
