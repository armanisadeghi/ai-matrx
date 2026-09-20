-- chair-step: anon holds EXECUTE on three functions in schema custom by PostgreSQL default; this takes the PUBLIC grant back and gives authenticated the explicit grant its six siblings hold
--
-- W4-DOOR-RECORD — `anon` REACHED THREE FUNCTIONS IN SCHEMA `custom`. IT REACHES NONE NOW.
--
-- FOUND BY THE PACKAGE'S OWN STANDING ASSERTION, not by reading anything: the
-- `@ai-matrx/records` real-door suite asserts `anon` holds EXECUTE on exactly 0 functions
-- in schema `custom`, and at 07:53 UTC on 2026-09-19 it answered 3.
--
--   custom.organization_kernel_id()   custom.presentation_kernel_id()   custom.widget_kernel_id()
--
-- All three were created minutes earlier by `rec3_the_organization_kernel_accessor.sql`
-- (applied 07:50:27 UTC) with no ACL of their own, so PostgreSQL's default EXECUTE-to-
-- PUBLIC stood — and PUBLIC includes `anon`, in a schema whose whole contract is that a
-- caller with no account reaches nothing.
--
-- THIS IS THE SAME CLASS `w4_door_the_decision_helper_is_not_a_door.sql` wrote down and
-- fixed one instance of: `platform.enforce_definer_client_grants` judges SECURITY DEFINER
-- functions only, so a SECURITY INVOKER helper added beside a door is covered by nothing
-- and is handed to PUBLIC by default. Six sibling accessors (`table_kernel_id`,
-- `field_kernel_id`, `person_kernel_id`, `rule_kernel_id`, `file_kernel_id`,
-- `merge_field_kernel_id`) each carry an explicit ACL; these three were the first to be
-- added without one, and they will not be the last while nothing takes the default back.
-- THE STANDING FIX — an INVOKER-side counterpart to `enforce_definer_client_grants`, which
-- would revoke PUBLIC from any undeclared function in `custom` at ddl_command_end — is NOT
-- built here on purpose: REC3 holds this schema right now, and an event trigger that fires
-- on their next apply is not a thing to land underneath a lane that is still working. It is
-- named here so the next seat builds it rather than rediscovering it.
--
-- WHAT THIS FILE DOES, and nothing else: takes the default PUBLIC grant back from those
-- three and gives `authenticated` the explicit EXECUTE its six siblings hold, so the app
-- keeps exactly the reach it has today and `anon` keeps none. Declaring them in
-- `platform.client_callable_door` is REC3's to do with the rest of their door rows.

revoke all on function custom.organization_kernel_id() from public;
revoke all on function custom.presentation_kernel_id() from public;
revoke all on function custom.widget_kernel_id() from public;

grant execute on function custom.organization_kernel_id() to authenticated;
grant execute on function custom.presentation_kernel_id() to authenticated;
grant execute on function custom.widget_kernel_id() to authenticated;
