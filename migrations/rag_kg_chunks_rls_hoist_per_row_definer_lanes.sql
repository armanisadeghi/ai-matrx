-- rag.kg_chunks — hoist the per-row SECURITY DEFINER RLS lanes (FOUND_DEFECTS D93).
--
-- MEASURED DEFECT (2026-08-15, live): as a user with no entitlement, a plain
-- `select count(*) from rag.kg_chunks` took 37,027 ms and returned 314 of 13,599
-- rows. The `authenticated` role's statement_timeout is 8s, so in the real app
-- this is a guaranteed `57014 canceling statement due to statement timeout` ->
-- HTTP 500. Denial-by-timeout burns a full statement budget and reads as an
-- outage instead of a clean empty result. Reproduced for five identities:
--   owner 12,408 ms | org member 19,327 ms | library-grant 22,124 ms
--   note sharee 34,846 ms | stranger 36,674 ms
--
-- CAUSE: three of the six SELECT lanes call a STABLE SECURITY DEFINER function
-- PER CANDIDATE ROW. A definer function with `SET search_path` can be neither
-- inlined nor hoisted, so Postgres evaluates it once per row across 13,599 rows
-- before RLS can conclude anything:
--     rag_source_has_library_grant(source_kind, source_id, null)
--     rag_user_can_see_note(source_id::uuid)
--     iam.has_access('file', source_id::uuid, 'viewer')
-- A fourth lane pays the same shape more cheaply via is_member_of_organization().
--
-- FIX — the shape already proven twice in this repo, not a third invention:
-- hoist the per-row definer call into a small set resolved ONCE, then filter on
-- an indexed column.
--   * migrations/iam_component_select_structural_parent_rls.sql resolved parent
--     id sets once per statement (a page-scoped query went to 3.3 ms).
--   * migrations/seo_search_performance_daily_rls_set_based_org_lane.sql
--     replaced per-row iam.has_org_access() with `organization_id IN (SELECT
--     iam.my_orgs())` (~16.5 s -> 200 ms).
-- Here the hoistable part is the CONSTANT (source_kind, source_id) predicate:
-- all three expensive lanes depend on nothing else from the row. rag.kg_chunks
-- has 13,599 rows but only 319 distinct live (source_kind, source_id) pairs, and
-- `idx_kg_chunks_source` already indexes exactly that pair. So each lane becomes
-- one definer call per DISTINCT SOURCE (319) instead of once per row (13,599),
-- and the row predicate collapses to an indexed set membership test.
--
-- WHY NOT THE CANONICAL GENERATOR: these six lanes cannot be expressed by
-- iam.apply_rls. They are bespoke for the reason D131 names — kg_chunks is not
-- an entity keyed by its own id; its access derives from a POLYMORPHIC
-- (source_kind, source_id) reference into four different source systems (cloud
-- files, notes, library docs, data-store grants), and two of the four resolve
-- through paths iam.apply_rls does not model at all: rag.data_store_grants
-- audience fan-out (global / organization / industry) and files.has_access_for,
-- which iam.has_access_for special-cases for p_type='file' and which therefore
-- is NOT equivalent to iam.accessible_entity_ids('file', ...). Forcing the
-- generated shape here would DROP lanes, which db-rules.md §6 rates as serious a
-- defect as a hole. They stay hand-written — but hoisted.
--
-- EQUIVALENCE IS THE WHOLE JOB. Each function below applies the SAME predicate
-- as the lane it serves, byte for byte, over a candidate set that is a superset
-- of every source any admissible row can carry (the policy already requires
-- valid_to IS NULL AND deleted_at IS NULL, which is exactly how the candidate
-- set is scoped). Row r is therefore admitted after iff it was admitted before.
-- Proven, not asserted: the full admitted row-id set was captured for five real
-- identities (owner / org member / library-grant holder / note sharee /
-- stranger) before and after, and compared by sha256 — plus eight synthetic
-- rolled-back scenarios covering the note-share lane and the global-library
-- lane, which admit ZERO rows for every identity on current data and so cannot
-- be proven from live rows alone (3 positives, 3 negatives, 2 controls).
--
-- Idempotent: CREATE OR REPLACE FUNCTION + ALTER POLICY (ALTER preserves the
-- other policies, including svc_all and the two lanes left untouched).

-- ---------------------------------------------------------------------------
-- The hoisted source sets. One definer call per distinct live source, evaluated
-- once per statement because each function is STABLE and takes no arguments.
-- Each reads rag.kg_chunks as its owner (postgres, which owns the table and has
-- BYPASSRLS; kg_chunks does not FORCE row level security), so there is no RLS
-- recursion — the candidate scan is not itself policy-filtered.
--
-- `AS MATERIALIZED` IS LOad-BEARING, NOT STYLE. Written as a plain sub-select,
-- the planner flattens the subquery and pushes the expensive definer predicate
-- BELOW the DISTINCT — restoring the exact per-row evaluation this migration
-- exists to remove. Measured, not theorised: the first cut of this migration
-- used a sub-select and the hashed SubPlan still cost 34,101 ms for one call,
-- because it evaluated iam.has_access once per each of the 12,574 cld_file ROWS
-- instead of once per each of the 103 distinct cld_file SOURCES (those 103 calls
-- cost 356 ms in total). MATERIALIZED is the documented optimisation fence that
-- forces the distinct set to be built first. Do not "simplify" it away.
-- ---------------------------------------------------------------------------

-- Lane: kg_chunks_library_grant_select. No source_kind restriction — any kind
-- may be a data-store member — so this returns the (kind, id) pair.
CREATE OR REPLACE FUNCTION rag.kg_chunk_sources_library_granted()
RETURNS TABLE (source_kind text, source_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'platform', 'iam', 'rag'
AS $$
  WITH s AS MATERIALIZED (
    SELECT DISTINCT k.source_kind, k.source_id
    FROM rag.kg_chunks k
    WHERE k.valid_to IS NULL AND k.deleted_at IS NULL
  )
  SELECT s.source_kind, s.source_id
  FROM s
  WHERE public.rag_source_has_library_grant(s.source_kind, s.source_id, NULL::uuid)
$$;

-- Lane: kg_chunks_note_share_select. source_kind is always 'note' here, so the
-- policy keeps that literal and this returns ids only.
CREATE OR REPLACE FUNCTION rag.kg_chunk_sources_note_visible()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'platform', 'iam', 'rag', 'workbench'
AS $$
  WITH s AS MATERIALIZED (
    SELECT DISTINCT k.source_id
    FROM rag.kg_chunks k
    WHERE k.valid_to IS NULL AND k.deleted_at IS NULL AND k.source_kind = 'note'
  )
  SELECT s.source_id
  FROM s
  WHERE public.rag_user_can_see_note(s.source_id::uuid)
$$;

-- Lane: kg_chunks_cld_share_select. Calls iam.has_access exactly as the policy
-- does — NOT iam.accessible_entity_ids, which routes around files.has_access_for.
CREATE OR REPLACE FUNCTION rag.kg_chunk_sources_cld_readable()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'platform', 'iam', 'rag', 'files'
AS $$
  WITH s AS MATERIALIZED (
    SELECT DISTINCT k.source_id
    FROM rag.kg_chunks k
    WHERE k.valid_to IS NULL AND k.deleted_at IS NULL AND k.source_kind = 'cld_file'
  )
  SELECT s.source_id
  FROM s
  WHERE iam.has_access('file', s.source_id::uuid, 'viewer'::public.permission_level)
$$;

REVOKE ALL ON FUNCTION rag.kg_chunk_sources_library_granted() FROM public;
REVOKE ALL ON FUNCTION rag.kg_chunk_sources_note_visible() FROM public;
REVOKE ALL ON FUNCTION rag.kg_chunk_sources_cld_readable() FROM public;
GRANT EXECUTE ON FUNCTION rag.kg_chunk_sources_library_granted() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rag.kg_chunk_sources_note_visible() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION rag.kg_chunk_sources_cld_readable() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The four rewritten lanes. Role targeting, lane count, and every literal are
-- unchanged; only the evaluation shape moves.
-- ---------------------------------------------------------------------------

-- was: rag_source_has_library_grant(source_kind, source_id, NULL) per row
ALTER POLICY kg_chunks_library_grant_select ON rag.kg_chunks USING (
  valid_to IS NULL
  AND deleted_at IS NULL
  AND (SELECT auth.role()) = 'authenticated'
  AND (source_kind, source_id) IN (SELECT * FROM rag.kg_chunk_sources_library_granted())
);

-- was: rag_user_can_see_note(source_id::uuid) per row
ALTER POLICY kg_chunks_note_share_select ON rag.kg_chunks USING (
  valid_to IS NULL
  AND deleted_at IS NULL
  AND source_kind = 'note'
  AND source_id IN (SELECT rag.kg_chunk_sources_note_visible())
);

-- was: iam.has_access('file', source_id::uuid, 'viewer') per row
ALTER POLICY kg_chunks_cld_share_select ON rag.kg_chunks USING (
  valid_to IS NULL
  AND deleted_at IS NULL
  AND source_kind = 'cld_file'
  AND source_id IN (SELECT rag.kg_chunk_sources_cld_readable())
);

-- was: is_member_of_organization(organization_id) per row. Identical predicate:
--   is_member_of_organization(o) = iam.has_org_access_for(auth.uid(), o)
--                                = EXISTS (SELECT 1 FROM iam.organization_member
--                                          WHERE organization_id = o AND user_id = auth.uid())
--   iam.my_orgs()                = SELECT organization_id FROM iam.organization_member
--                                          WHERE user_id = auth.uid()
-- This is the seo.search_performance_daily rewrite, unchanged.
ALTER POLICY kg_chunks_org_member_select ON rag.kg_chunks USING (
  organization_id IS NOT NULL
  AND organization_id IN (SELECT iam.my_orgs())
  AND valid_to IS NULL
  AND deleted_at IS NULL
);

-- kg_chunks_owner_select and kg_chunks_global_library_select are already
-- constant-time on indexed columns and are deliberately left untouched.

NOTIFY pgrst, 'reload schema';
