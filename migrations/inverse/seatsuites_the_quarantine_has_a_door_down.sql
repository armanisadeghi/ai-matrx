-- target: branch,production
-- additive: yes
-- INVERSE of seatsuites_the_quarantine_has_a_door.sql: the quarantine closed to clients again.

revoke execute on function custom.anon_submissions(uuid, uuid, text, integer, integer) from authenticated;
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'anon_submissions'
   and declared_by = 'migrations/campaign/seatsuites_the_quarantine_has_a_door.sql (lane SEAT-SUITES)';
drop function if exists custom.anon_submissions(uuid, uuid, text, integer, integer);
