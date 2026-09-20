-- INVERSE of migrations/campaign/tidy_the_provenance_flush_rides_the_turns_session.sql
-- Drops the owner-role write. The flush then has to open its own session again, which is
-- what it did before and what cost the assembly three round trips a turn.

set lock_timeout = '3s';
set statement_timeout = '2min';

drop function if exists custom.provenance_write(uuid, uuid, text, jsonb);
delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'provenance_write';
