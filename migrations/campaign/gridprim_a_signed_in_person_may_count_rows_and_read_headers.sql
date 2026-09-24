-- chair-step: it (re)opens the signed-in lane on G12's two door rows and runs
--   `select custom.reopen_declared_doors()`, which ISSUES the
--   EXECUTE grant to `authenticated` that G12's two `platform.client_callable_door` rows declare,
--   for `custom.table_row_counts(uuid, uuid[])` and `custom.record_headers(uuid, uuid[])`. A GRANT
--   is the one shape the production allow-list refuses by name, so it comes through this route
--   (the same route as gridprim_a_signed_in_person_may_ask_which_measures_there_are.sql). Nothing
--   is replaced, dropped or revoked; `anon` gains nothing. Apply AFTER
--   gridprim_every_table_counts_its_rows_and_every_row_shows_its_header.sql. The inverse is
--   `migrations/inverse/gridprim_a_signed_in_person_may_count_rows_and_read_headers_down.sql`.
-- lane: GRID-PRIMITIVES
-- lock: custom,platform
--
-- LANE GRID-PRIMITIVES G12, THE GRANT. Measured on the rehearsal branch 2026-09-24 02:1x UTC:
-- after G12 the ddl guard took the client EXECUTE back at birth ("definer_client_grant_revoked"),
-- so from a real test@test.com connection `custom.record_headers` answered "permission denied"
-- and `record_read`'s header stayed empty. The psql seat suite had passed only because its
-- fixture re-opens the declared doors inside its own transaction.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The rows are G12's; this file only says their signed-in lane is OPEN (it already is on a
-- first apply — this makes a re-apply after the inverse open it again).
update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where schema_name = 'custom' and function_name in ('table_row_counts', 'record_headers')
   and declared_by = 'gridprim_every_table_counts_its_rows_and_every_row_shows_its_header.sql';

select custom.reopen_declared_doors();
