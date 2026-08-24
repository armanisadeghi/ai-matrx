-- The release-time reachability guard performs a fresh full-graph derivation.
-- It was designed as a long-running read-only integrity check, but the public
-- report inherited PostgREST's eight-second authenticator timeout and began
-- failing as the graph grew. The sibling daily self-heal already grants the
-- same derivation ten minutes because it runs the walk twice around a rebuild.
-- Keep the report bounded at that established ceiling without changing its
-- signature, privileges, search path, or result contract.

ALTER FUNCTION public.reachability_guard_report()
  SET statement_timeout TO '10min';

COMMENT ON FUNCTION public.reachability_guard_report() IS
  'Standing guard report (2026-08-21) for scripts/access-matrix/check-reachability-guards.ts: definition parity + reachability drift in one call. The full-graph derivation has a function-local 10-minute timeout matching platform.heal_reachability_drift().';
