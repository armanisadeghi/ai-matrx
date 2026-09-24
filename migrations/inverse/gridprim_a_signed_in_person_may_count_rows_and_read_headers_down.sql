-- lock: custom,platform
-- lane: GRID-PRIMITIVES
-- chair-step: the inverse of gridprim_a_signed_in_person_may_count_rows_and_read_headers.sql.
-- It REVOKES EXECUTE on custom.table_row_counts(uuid, uuid[]) and custom.record_headers(uuid, uuid[])
-- from authenticated. What it undoes: a signed-in person's row counts and record headers are
-- refused again ("permission denied"). The door rows stay (they belong to G12's own file) but
-- their signed-in lane is CLOSED first, with its reason — otherwise the declared-doors sweep
-- puts the grant straight back in the same statement.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'closed by gridprim_a_signed_in_person_may_count_rows_and_read_headers_down.sql: the signed-in grant was taken back'
 where schema_name = 'custom' and function_name in ('table_row_counts', 'record_headers')
   and declared_by = 'gridprim_every_table_counts_its_rows_and_every_row_shows_its_header.sql';

revoke execute on function custom.table_row_counts(uuid, uuid[]) from authenticated;
revoke execute on function custom.record_headers(uuid, uuid[]) from authenticated;
