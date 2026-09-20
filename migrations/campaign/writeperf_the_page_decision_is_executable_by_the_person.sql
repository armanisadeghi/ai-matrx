-- additive: yes
--
-- chair-step: it GRANTS EXECUTE to `authenticated` and `anon` on three SECURITY INVOKER functions
--   of schema `custom` (`custom.page_ceiling`, `custom.export_ceiling`, `custom.page_size`).
--   Nothing is created, replaced, dropped or revoked and no data is touched. None of the three is
--   SECURITY DEFINER, so none of them can widen anything: each runs with the CALLER's own
--   privileges and reads exactly what that caller could already read for themselves — the knob
--   register, which `authenticated` already holds SELECT on and already reaches through
--   `platform.knob_resolve` and `custom.store_is_open`. The inverse is
--   `migrations/inverse/writeperf_the_page_decision_is_executable_by_the_person_down.sql`.
--
-- WRITE-PERF — AND THE GRANT HAS TO BE RE-ISSUED, WHICH IS THE HALF I NEARLY MISSED.
--
-- `writeperf_the_page_decision_runs_as_its_caller.sql` made the three page helpers SECURITY
-- INVOKER so that `custom.entity_records_find` — a client door that runs as the person calling it
-- — could reach them. That was necessary and it was not sufficient: CREATE OR REPLACE keeps a
-- function's existing ACL, and the ACL on all three was the one
-- `platform.enforce_definer_client_grants` had already REVOKED while they were SECURITY DEFINER
-- and undeclared. Checked immediately after that file landed:
--
--     has_function_privilege('authenticated','custom.page_size(...)','EXECUTE')  ->  false
--
-- So the door was still broken, and a lane that had stopped at "the guard is green now" would
-- have shipped it. `anon` is included because `custom.anon_submissions` serves a public form and
-- decides a page size on that lane.

grant execute on function custom.page_ceiling(uuid) to authenticated, anon;
grant execute on function custom.export_ceiling(uuid) to authenticated, anon;
grant execute on function custom.page_size(uuid, text, integer, integer, integer) to authenticated, anon;
