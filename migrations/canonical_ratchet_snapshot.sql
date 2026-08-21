-- canonical_ratchet_snapshot — the read side of the two BLOCKING canonical ratchets.
--
-- WHY THIS FUNCTION EXISTS AT ALL. The release gates that consume it live in
-- matrx-frontend/scripts/canonical-ratchets/ and read the database the way every
-- other frontend gate does: PostgREST with SUPABASE_SECRET_KEY. PostgREST does
-- not expose the `audit` schema (PGRST106 — deliberately; the conformance store
-- is internal), so there is no way for a TypeScript gate to read
-- audit.unregistered_candidates or audit.canonical_findings directly. This is the
-- house answer to exactly that problem: one STABLE SECURITY DEFINER snapshot
-- function in `public` returning jsonb, same shape and same purpose as
-- public.partition_runway_snapshot() (scripts/partition-runway/). It reads; it
-- never writes and never refreshes.
--
-- It is granted to service_role ONLY. The conformance store names every
-- structural weakness in the database — anon and authenticated are explicitly
-- revoked, unlike partition_runway_snapshot.
--
-- WHAT IT RETURNS
--   generated_at          now()
--   audit_refreshed_at    max(audit.refresh_log.run_at) — the FRESHNESS of the
--                         cached store. The gates never call audit.refresh()
--                         themselves (measured 4.5-5.5s, and it WRITES); they
--                         read the cache and scream when it is stale. See the
--                         freshness contract in the gate scripts.
--   ddl_guard_attached    is the `ddl_guard` event trigger live AND enabled?
--                         This is load-bearing: birth records come from it, and a
--                         project restore silently drops event triggers
--                         (db-rules FEATURE.md change log, 2026-08-20). If it is
--                         gone, the post-doctrine set stops growing and the
--                         ratchet would read green forever. The gate fails on
--                         false rather than trusting a blind measurement.
--   unregistered          audit.unregistered_candidates with base_col_score >= 4
--                         — live tables that look like real entities and are not
--                         in platform.entity_types.
--   post_doctrine_fails   iam.verify_canonical FAIL rows (as cached in
--                         audit.canonical_findings) for tables BORN after the
--                         doctrine cutoff, each carrying its born_at.
--
-- "BORN AFTER" — THE HEURISTIC, AND ITS TWO BLIND SPOTS.
-- platform.entity_types carries no registration timestamp, so the only
-- machine-readable birth record in this database is
-- platform.ddl_guard_log: min(occurred_at) WHERE command_tag = 'CREATE TABLE'
-- AND object_ref = '<schema>.<table>'. That is the heuristic, and it is a FLOOR,
-- not a census:
--   1. The guard's own log starts 2026-08-13 00:46 UTC (earliest recorded
--      CREATE TABLE: 06:15). A table created between the 2026-08-12 doctrine
--      cutoff and that moment has no birth row and is therefore treated as
--      legacy. The window is ~25 hours; a second heuristic is not available —
--      platform.entity_types carries no registration timestamp — which is why
--      the cutoff is an explicit parameter rather than a hidden constant.
--   2. If the event trigger is ever dropped (restore), births stop being
--      recorded — which is what ddl_guard_attached exists to catch.
-- Both are stated in the gate output, never silently absorbed.
--
-- No other DDL: this migration adds one function and nothing else.

CREATE OR REPLACE FUNCTION public.canonical_ratchet_snapshot(
  p_cutoff timestamptz DEFAULT timestamptz '2026-08-12 00:00:00+00',
  p_min_score integer DEFAULT 4
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH born AS (
    SELECT object_ref, min(occurred_at) AS born_at
    FROM platform.ddl_guard_log
    WHERE command_tag = 'CREATE TABLE'
    GROUP BY object_ref
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'audit_refreshed_at', (SELECT max(run_at) FROM audit.refresh_log),
    'post_doctrine_cutoff', p_cutoff,
    'min_base_col_score', p_min_score,
    'ddl_guard_attached', (
      SELECT coalesce(bool_or(evtenabled <> 'D'), false)
      FROM pg_event_trigger WHERE evtname = 'ddl_guard'
    ),
    'ddl_guard_log_earliest', (SELECT min(occurred_at) FROM platform.ddl_guard_log),
    'births_after_cutoff', (SELECT count(*) FROM born WHERE born_at > p_cutoff),
    'unregistered', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'schema', u.schema_name,
               'table', u.table_name,
               'score', u.base_col_score
             ) ORDER BY u.schema_name, u.table_name)
      FROM audit.unregistered_candidates u
      WHERE u.base_col_score >= p_min_score
    ), '[]'::jsonb),
    'post_doctrine_fails', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'schema', f.schema_name,
               'table', f.table_name,
               'token', f.token,
               'check_name', f.check_name,
               'detail', f.detail,
               'born_at', b.born_at
             ) ORDER BY f.schema_name, f.table_name, f.check_name)
      FROM audit.canonical_findings f
      JOIN born b ON b.object_ref = f.schema_name || '.' || f.table_name
      WHERE f.status = 'FAIL'
        AND b.born_at > p_cutoff
    ), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.canonical_ratchet_snapshot(timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.canonical_ratchet_snapshot(timestamptz, integer) FROM anon;
REVOKE ALL ON FUNCTION public.canonical_ratchet_snapshot(timestamptz, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_ratchet_snapshot(timestamptz, integer) TO service_role;

COMMENT ON FUNCTION public.canonical_ratchet_snapshot(timestamptz, integer) IS
  'Read-only snapshot feeding the two blocking canonical ratchets in matrx-frontend/scripts/canonical-ratchets/. service_role only. Reads the CACHED audit store — never refreshes it; audit_refreshed_at is the freshness the caller must judge.';

-- The remedy for a stale cache, reachable from the same PostgREST surface as the
-- snapshot. The gates never call this on the hot path — audit.refresh() is
-- measured at 4.5-5.5s and it WRITES (it rebuilds every snapshot table and runs
-- plpgsql_check over every plpgsql function), which is neither fast nor
-- deterministic enough for a release gate. It exists so that
-- `pnpm check:canonical-ratchets --refresh` (and the freshness FAIL message) has
-- something to point at other than "go find a session with DB access".
CREATE OR REPLACE FUNCTION public.canonical_ratchet_refresh()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT audit.refresh();
$function$;

REVOKE ALL ON FUNCTION public.canonical_ratchet_refresh() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.canonical_ratchet_refresh() FROM anon;
REVOKE ALL ON FUNCTION public.canonical_ratchet_refresh() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_ratchet_refresh() TO service_role;

COMMENT ON FUNCTION public.canonical_ratchet_refresh() IS
  'Thin service_role-only wrapper over audit.refresh() so the canonical ratchet gates have an explicit, opt-in remedy for a stale audit store. Never called on a gate hot path.';
