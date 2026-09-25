-- lock: custom,platform
-- lane: GRID-PRIMITIVES
-- chair-step: the inverse of gridprim_every_table_counts_its_rows_and_every_row_shows_its_header.sql. It DROPS custom.table_row_counts(uuid, uuid[]) and custom.record_headers(uuid, uuid[]) and deletes their platform.client_callable_door rows. Nothing it created replaced a live body.
-- WHAT IT DOES NOT UNDO: nothing — neither door ever wrote a row.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

drop function if exists custom.table_row_counts(uuid, uuid[]);
drop function if exists custom.record_headers(uuid, uuid[]);
delete from platform.client_callable_door
 where declared_by = 'gridprim_every_table_counts_its_rows_and_every_row_shows_its_header.sql';
