-- target: branch
--
-- THE SECOND HALF OF `migrations/campaign/w1_rule_apply_level_the_definer_door_lint.sql`,
-- and the reason it needs one, measured rather than assumed.
--
-- Transplanting production's five new bodies onto the branch left them LOOSER than
-- production, because something on the branch grants EXECUTE to `authenticated` on a newly
-- created function in these schemas and production does not. Measured 2026-09-17 19:14 UTC,
-- the same two functions on both databases:
--
--   branch      iam.is_client_lane  {postgres=X, dashboard_user=X, authenticated=X, service_role=X}
--   production  iam.is_client_lane  {postgres=X, dashboard_user=X, service_role=X, svc_seo=X}
--
-- It is NOT default privileges: `pg_default_acl` holds no row for `iam`, `platform` or
-- `esign` on EITHER database. So a branch-side grant sweep is doing it on creation, which is
-- the same class `W1-PROV-CLOSED` closed inside schema `custom` at 18:40 UTC, on objects
-- outside it — and it is why two unrelated functions (`esign._can_act`,
-- `platform.demote_custom_field_index`) also came back LOOSER tonight and needed
-- `grant_surface_level_two_that_came_back.sql`. The ROOT CAUSE is that sweep and it is not
-- this lane's; what is this lane's is that its exit gate, and every later lane's, reads the
-- grant surface.
--
-- Branch only (rule 9 forbids a REVOKE on production in any lane), idempotent, and it moves
-- the branch TOWARDS production, which is the only direction this gate has.

set lock_timeout = '5s';
set statement_timeout = '300s';

revoke execute on function iam.is_client_lane() from authenticated;
revoke execute on function platform.definer_access_decision_regex() from authenticated;
revoke execute on function platform.definer_body_decides_access(oid, integer) from authenticated;
revoke execute on function platform.definer_body_lint_findings() from authenticated;
revoke execute on function platform.door_body_must_decide() from authenticated;
