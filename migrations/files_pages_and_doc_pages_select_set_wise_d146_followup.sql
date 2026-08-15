-- D146 FOLLOW-UP — hoist the `files.pages` and `docproc.processed_document_pages`
-- SELECT policies out of the per-row SECURITY DEFINER scan path.
--
-- Both tables are ALREADY OVER THE `authenticated` 8s statement_timeout today:
-- these are live 57014 -> HTTP 500s, not merely slow reads.
--
-- THE DEFECT (the same class as
-- migrations/docproc_extraction_grant_lane_set_wise_d146_followup.sql and
-- migrations/iam_hoist_has_org_access_set_wise_d146.sql). A `SECURITY DEFINER`
-- function in a policy's `USING` clause is called ONCE PER CANDIDATE ROW —
-- `SET search_path` alone forecloses inlining and hoisting. PERMISSIVE policies
-- are OR'd, so every row pays every lane. THE CLASS IS THE SHAPE, NOT THE
-- HELPER NAME.
--
-- MEASURED LIVE, 2026-08-14, session-mode pooler (port 5432), as each real
-- signed-in identity with that role's real statement_timeout applied:
--
--   select count(*) from files.pages                        -- 6,567 rows / 66 files
--     owner (5,808 rows visible) ................ 3,513 ms
--     grant-reader / other user / stranger ...... 57014 TIMEOUT at 8,000 ms
--
--   select count(*) from docproc.processed_document_pages    -- 8,787 rows / 137 docs
--     owner ..................................... 2,428 ms
--     everyone else ............................. 57014 TIMEOUT at 8,000 ms
--
--   select count(*) from docproc.processed_document_pages
--     where processed_document_id = '<one doc>'             -- only 618 candidates
--     non-owner ................................. 4,855 ms
--
-- That last one is why `pnpm check:access-matrix` was red at 41/42 with
-- `doc f3cf55a1 pages RLS (control) expected 0, got -1`: `-1` is
-- scripts/access-matrix/lib.ts's "the read itself errored" sentinel (NOT a
-- leak). PostgREST's `count=exact` pays that 4.9s twice — once to count, once
-- to fetch — crossing the 8s cap.
--
-- ============================================================================
-- THE REWRITE, AND WHY EACH PIECE IS EXACTLY EQUIVALENT
-- ============================================================================
-- Every arm below is COPIED BYTE-FOR-BYTE into a `RETURNS SETOF uuid` STABLE
-- SECURITY DEFINER twin owned by postgres (BYPASSRLS — so the inner scan sees
-- the same rows the old per-row helper saw, and the twin does not silently
-- become dependent on the scanned table's own RLS). Nothing about WHO is
-- admitted is re-derived, re-modeled, or widened — only WHEN the arms run.
--
-- 🚨 `iam.has_access` IS NOT SWAPPED FOR `accessible_entity_ids`. Re-deriving
-- the access model is the move that broke component reads on 2026-08-13. The
-- win here comes purely from CARDINALITY.
--
-- THE MEMBERSHIP IDENTITY. Each old predicate has the form
--     f(K)  =  EXISTS (SELECT 1 FROM parent d WHERE d.id = K AND COND(d))
-- and `d.id` is the parent's PRIMARY KEY, so
--     f(K)  <=>  K IN (SELECT d.id FROM parent d WHERE COND(d))
-- by construction — no argument about `has_access`/`can_read_*` semantics is
-- needed at all, because COND is character-identical on both sides.
--
-- THE `IS NOT NULL` GUARD is not optional. For a NULL key the old helper
-- returns FALSE while `NULL IN (<non-empty set>)` returns NULL. Both reject the
-- row, but only the guard keeps the predicate identical in all THREE truth
-- values rather than merely in which rows it admits (D146's reasoning,
-- unchanged). Every key column here — `files.pages.file_id`,
-- `processed_document_pages.processed_document_id` — is NOT NULL live with 0
-- NULL rows, so the guard can never fire. It is written anyway so the predicate
-- stays correct if a column is ever relaxed, and so no future reader has to
-- re-derive the question.
--
-- DOMAIN COMPLETENESS (why the twins cannot omit an admitted key):
--   * `readable_file_page_file_ids()` iterates `SELECT DISTINCT file_id FROM
--     files.pages` — its domain is EXACTLY the set of keys that occur, so it is
--     complete by construction and needs no FK argument.
--   * The three `processed_document` twins iterate `docproc.processed_documents`
--     (186 rows). `processed_document_pages.processed_document_id` is NOT NULL
--     with FK `..._processed_document_id_fkey` REFERENCES
--     `docproc.processed_documents(id)` ON DELETE CASCADE, and 0 rows violate
--     it, so every occurring key is in the domain. This matters because
--     `can_curate_library_document` short-circuits TRUE for a super-admin
--     *regardless of whether the doc exists*; over the FK-guaranteed domain the
--     two forms still agree on every real row, and the twin then emits all 186
--     ids for a super-admin exactly as the old per-row form returned TRUE for
--     all of them.
--
-- WHY `file_pages_select` COLLAPSES TO A PLAIN COLUMN COMPARISON. This one arm
-- is not hoisted — it is REDUCED, and the reduction was read out of the live
-- function body and the live registry row rather than assumed:
--   1. `public.resolve_shareable_resource('file_pages')` SUCCEEDS live —
--      `platform.shareable_resource_registry` has an `is_active` row
--      (schema_name='files', table_name='pages', id_column='id',
--      owner_column='owner_id'), so `is_resource_owner`'s exception arm (which
--      would make the policy fail silent-closed, per THE ONE TOKEN invariant,
--      db-rules FEATURE.md §6c) is NOT taken. The token IS valid.
--   2. `public.shareable_owner_column('files','pages','owner_id')` returns
--      'owner_id' (the column exists, so the `created_by` fallback is not
--      reached — `files.pages` has no `created_by`, correctly: it is a
--      component, §6d-1).
--   3. The helper then runs `SELECT owner_id FROM files.pages WHERE id = $1`.
--      `id` is the PRIMARY KEY, so this returns exactly the scanned row's own
--      `owner_id`; the helper is owned by postgres (BYPASSRLS) so the lookup is
--      not itself RLS-filtered.
--   4. `owner_id` is NOT NULL live (0 NULL rows), so `v_owner_id IS NOT NULL`
--      is always true, and the helper returns FALSE (never NULL) when
--      `auth.uid()` is NULL.
--   Therefore `is_resource_owner('file_pages', id)` is, in all three truth
--   values, `(SELECT auth.uid()) IS NOT NULL AND owner_id = (SELECT auth.uid())`
--   — which is character-for-character what this table's OWN `file_pages_insert`
--   / `file_pages_update` / `file_pages_delete` policies already assert. The
--   rewrite makes the four policies agree instead of expressing one of them
--   through a dynamic-SQL registry lookup executed 6,567 times.
--   Role is deliberately left as PUBLIC (unchanged): anon evaluated the old
--   helper to FALSE via its `v_uid IS NULL` early return, and evaluates the new
--   predicate to FALSE via the same guard. Anon is not widened by one row.
--
-- WHY THE `FOR ALL` POLICY IS DECOMPOSED. `processed_document_pages_via_doc_all`
-- carried USING (owner OR org-member) and a deliberately NARROWER WITH CHECK
-- (owner only). A `FOR ALL` policy cannot have its SELECT half rewritten in
-- isolation, and rewriting the whole thing would push the set-building twin
-- into the INSERT path — where the old per-row EXISTS was never a problem (a
-- WITH CHECK runs once per WRITTEN row, never over a scan) and where it would
-- be a regression. So it is split into the exact four commands `FOR ALL`
-- desugars to, preserving both expressions verbatim:
--     SELECT -> USING (set-wise rewrite of the USING expr)
--     INSERT -> WITH CHECK (original owner-only expr, unchanged)
--     UPDATE -> USING (original expr) WITH CHECK (original owner-only expr)
--     DELETE -> USING (original expr)
--   Same roles (PUBLIC), same PERMISSIVE-ness, so per-command OR semantics are
--   identical.
--
-- ============================================================================
-- EQUIVALENCE PROOF (run live, 2026-08-14, BEFORE applying this file)
-- ============================================================================
-- Ten identities — four page owners, a shared-knowledge grant reader, an
-- industry curator, three super-admins, an org admin, an org member, a member
-- of unrelated orgs, a stranger, and ANON — probed in rolled-back transactions
-- with `set local role` + `set local request.jwt.claims`, on the SESSION-mode
-- pooler port 5432 (transaction mode 6543 leaks `SET LOCAL ROLE` across clients
-- and silently corrupts identity-scoped RLS testing), asserting `current_user`
-- AND `auth.uid()` INSIDE every probe.
--
-- For every identity, over EVERY row / EVERY distinct key (plus an explicit
-- NULL key), under a strict `IS DISTINCT FROM`:
--        old predicate  IS DISTINCT FROM  new predicate   ->  0 disagreements.
-- Admitted-row sets were snapshotted per identity before and after and compared
-- ELEMENT-WISE: identical for all ten identities on both tables.
--
-- The proof is not vacuous: the grant reader sees 618 `processed_document_pages`
-- rows through `can_read_processed_document`'s data-store lane, the super-admins
-- take `can_curate_library_document`'s short-circuit, and the page owners are
-- admitted through the owner lane.
--
-- Idempotent: CREATE OR REPLACE + DROP POLICY IF EXISTS / CREATE POLICY.


-- =====================================================================
-- 1. Set-valued twins. Arms copied verbatim from the policies/helpers they
--    replace; security context (postgres-owned SECURITY DEFINER, BYPASSRLS,
--    STABLE, explicit search_path) identical.
-- =====================================================================

-- files.pages grant lane: iam.has_access('file', file_id, 'viewer')
CREATE OR REPLACE FUNCTION public.readable_file_page_file_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'files', 'iam'
AS $function$
  SELECT k.file_id
  FROM (SELECT DISTINCT p.file_id FROM files.pages p) k
  WHERE iam.has_access('file'::text, k.file_id, 'viewer'::public.permission_level)
$function$;

COMMENT ON FUNCTION public.readable_file_page_file_ids() IS
  'Set-wise twin of the files.pages grant lane: every file_id occurring in files.pages that the caller may read at viewer level. Uncorrelated, so `file_id IN (SELECT public.readable_file_page_file_ids())` plans as ONE hashed SubPlan per query — the iam.has_access chain runs once per FILE (66) instead of once per PAGE (6,567). USE THIS FORM IN RLS POLICIES — never a per-row SECURITY DEFINER call (D146). MUST stay owned by a BYPASSRLS role: it reads files.pages from inside that table''s own SELECT policy, and only the definer''s RLS bypass keeps that from recursing.';

REVOKE ALL ON FUNCTION public.readable_file_page_file_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.readable_file_page_file_ids() TO authenticated, anon, service_role;

-- processed_document_pages curator lane: can_curate_library_document(doc, uid)
CREATE OR REPLACE FUNCTION public.curatable_processed_document_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'docproc', 'rag', 'iam'
AS $function$
  SELECT d.id
  FROM docproc.processed_documents d
  WHERE public.can_curate_library_document(d.id, (SELECT auth.uid()))
$function$;

COMMENT ON FUNCTION public.curatable_processed_document_ids() IS
  'Set-wise twin of can_curate_library_document(doc, auth.uid()): the ids of every processed document the caller may curate. Uncorrelated — the definer chain runs once per DOCUMENT (186) instead of once per PAGE (8,787). USE THIS FORM IN RLS POLICIES (D146).';

REVOKE ALL ON FUNCTION public.curatable_processed_document_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.curatable_processed_document_ids() TO authenticated, anon, service_role;

-- processed_document_pages library-grant lane: can_read_processed_document(doc, uid)
CREATE OR REPLACE FUNCTION public.readable_processed_document_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'docproc', 'rag', 'iam'
AS $function$
  SELECT d.id
  FROM docproc.processed_documents d
  WHERE public.can_read_processed_document(d.id, (SELECT auth.uid()))
$function$;

COMMENT ON FUNCTION public.readable_processed_document_ids() IS
  'Set-wise twin of can_read_processed_document(doc, auth.uid()): the ids of every processed document the caller may read (owner, curator, org member, data-store grant, or iam grant). Uncorrelated — the nested definer chain runs once per DOCUMENT (186) instead of once per PAGE (8,787). USE THIS FORM IN RLS POLICIES (D146).';

REVOKE ALL ON FUNCTION public.readable_processed_document_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.readable_processed_document_ids() TO authenticated, anon, service_role;

-- processed_document_pages via-doc lane: the EXISTS(owner OR org-member) arm.
--
-- 🚨 THIS ONE IS `SECURITY INVOKER`, AND THAT IS THE WHOLE POINT — it is the
-- only twin here replacing a DIRECT TABLE REFERENCE rather than a function
-- call. PostgreSQL applies a referenced table's OWN RLS to subqueries inside a
-- policy expression, so the former `EXISTS (SELECT 1 FROM
-- docproc.processed_documents d ...)` was already filtered by
-- processed_documents' policies (notably `processed_documents_org_member_select`,
-- which additionally requires `deleted_at IS NULL`). A SECURITY DEFINER twin
-- owned by a BYPASSRLS role would see rows that subquery could not — e.g. a
-- soft-deleted document whose org the caller belongs to — and would WIDEN the
-- admitted set. INVOKER reproduces the original filtering exactly.
--
-- The other three twins replace FUNCTION CALLS (`iam.has_access`,
-- `can_read_processed_document`, `can_curate_library_document`), which are
-- themselves postgres-owned SECURITY DEFINER and therefore already read their
-- tables WITHOUT RLS. Those twins must stay SECURITY DEFINER — making them
-- INVOKER would shrink their domain to the RLS-visible parents and NARROW the
-- result. Over-tightening is as serious a defect as a hole (db-rules §6).
CREATE OR REPLACE FUNCTION public.owned_or_org_processed_document_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public', 'docproc', 'iam'
AS $function$
  SELECT d.id
  FROM docproc.processed_documents d
  WHERE d.owner_id = (SELECT auth.uid())
     OR (d.organization_id IS NOT NULL AND public.is_member_of_organization(d.organization_id))
$function$;

COMMENT ON FUNCTION public.owned_or_org_processed_document_ids() IS
  'Set-wise twin of the processed_document_pages via-doc SELECT lane: the ids of every processed document the caller owns or reaches through org membership. Arms copied verbatim from the former processed_document_pages_via_doc_all USING clause. Uncorrelated — is_member_of_organization runs once per DOCUMENT (186) instead of once per PAGE (8,787). DELIBERATELY SECURITY INVOKER: it replaces a direct table reference inside a policy, which PostgreSQL already filters through docproc.processed_documents'' own RLS; a BYPASSRLS definer twin would widen the admitted set (e.g. soft-deleted org documents). USE THIS FORM IN RLS POLICIES (D146).';

REVOKE ALL ON FUNCTION public.owned_or_org_processed_document_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owned_or_org_processed_document_ids() TO authenticated, anon, service_role;

-- Point the surviving single-row helpers at their set-wise siblings so the next
-- reader does not reintroduce the per-row form in a policy. The single-row
-- functions are KEPT — still granted, still correct for a one-row check.
COMMENT ON FUNCTION public.can_read_processed_document(uuid, uuid) IS
  'TRUE when the given user may read this processed document (owner, curator, org member, data-store grant, or iam grant). NEVER call this from an RLS USING clause — a SECURITY DEFINER helper there runs once per candidate row (measured: 4.9s over 618 candidate rows, 8s TIMEOUT over 8,787). Use public.readable_processed_document_ids() set-wise instead (D146).';

COMMENT ON FUNCTION public.can_curate_library_document(uuid, uuid) IS
  'TRUE when the given user may curate this library document (super-admin, or industry curator on a data store granting it). NEVER call this from an RLS USING clause — a SECURITY DEFINER helper there runs once per candidate row. Use public.curatable_processed_document_ids() set-wise instead (D146).';

COMMENT ON FUNCTION public.is_resource_owner(text, uuid) IS
  'TRUE when auth.uid() owns the given shareable resource, resolved dynamically through platform.shareable_resource_registry. NEVER call this from an RLS USING clause — it is SECURITY DEFINER (so it runs once per candidate row) AND each call re-resolves the registry and queries information_schema before a dynamic single-row lookup. On a table that already carries its own owner column, compare that column directly, exactly as the table''s INSERT/UPDATE/DELETE policies do (D146; files.pages, 2026-08-14).';


-- =====================================================================
-- 2. files.pages — both SELECT policies hoisted in place. Same policy names,
--    same commands, same roles, same PERMISSIVE-ness; only the predicate form
--    changes. The INSERT/UPDATE/DELETE policies are untouched.
-- =====================================================================

DROP POLICY IF EXISTS file_pages_grant_read ON files.pages;
CREATE POLICY file_pages_grant_read ON files.pages
  FOR SELECT TO authenticated
  USING (file_id IS NOT NULL AND file_id IN (SELECT public.readable_file_page_file_ids()));

DROP POLICY IF EXISTS file_pages_select ON files.pages;
CREATE POLICY file_pages_select ON files.pages
  FOR SELECT TO PUBLIC
  USING ((SELECT auth.uid()) IS NOT NULL AND owner_id = (SELECT auth.uid()));


-- =====================================================================
-- 3. docproc.processed_document_pages — the two SELECT policies hoisted in
--    place, and the FOR ALL policy decomposed so ONLY its SELECT half changes.
--    processed_document_pages_curator_update (FOR UPDATE) is untouched.
-- =====================================================================

DROP POLICY IF EXISTS processed_document_pages_curator_select ON docproc.processed_document_pages;
CREATE POLICY processed_document_pages_curator_select ON docproc.processed_document_pages
  FOR SELECT TO PUBLIC
  USING (processed_document_id IS NOT NULL
         AND processed_document_id IN (SELECT public.curatable_processed_document_ids()));

DROP POLICY IF EXISTS processed_document_pages_library_grant_select ON docproc.processed_document_pages;
CREATE POLICY processed_document_pages_library_grant_select ON docproc.processed_document_pages
  FOR SELECT TO authenticated
  USING (processed_document_id IS NOT NULL
         AND processed_document_id IN (SELECT public.readable_processed_document_ids()));

-- The FOR ALL policy, desugared into its exact four commands.
DROP POLICY IF EXISTS processed_document_pages_via_doc_all ON docproc.processed_document_pages;

DROP POLICY IF EXISTS processed_document_pages_via_doc_select ON docproc.processed_document_pages;
CREATE POLICY processed_document_pages_via_doc_select ON docproc.processed_document_pages
  FOR SELECT TO PUBLIC
  USING (processed_document_id IS NOT NULL
         AND processed_document_id IN (SELECT public.owned_or_org_processed_document_ids()));

-- INSERT / UPDATE / DELETE keep the ORIGINAL per-row EXISTS verbatim: a
-- WITH CHECK runs once per written row, never over a scan, and the INSERT arm
-- is deliberately narrower (owner only) than the read arm.
DROP POLICY IF EXISTS processed_document_pages_via_doc_insert ON docproc.processed_document_pages;
CREATE POLICY processed_document_pages_via_doc_insert ON docproc.processed_document_pages
  FOR INSERT TO PUBLIC
  WITH CHECK (EXISTS (SELECT 1
                      FROM docproc.processed_documents d
                      WHERE d.id = processed_document_pages.processed_document_id
                        AND d.owner_id = auth.uid()));

DROP POLICY IF EXISTS processed_document_pages_via_doc_update ON docproc.processed_document_pages;
CREATE POLICY processed_document_pages_via_doc_update ON docproc.processed_document_pages
  FOR UPDATE TO PUBLIC
  USING (EXISTS (SELECT 1
                 FROM docproc.processed_documents d
                 WHERE d.id = processed_document_pages.processed_document_id
                   AND (d.owner_id = auth.uid()
                        OR (d.organization_id IS NOT NULL
                            AND is_member_of_organization(d.organization_id)))))
  WITH CHECK (EXISTS (SELECT 1
                      FROM docproc.processed_documents d
                      WHERE d.id = processed_document_pages.processed_document_id
                        AND d.owner_id = auth.uid()));

DROP POLICY IF EXISTS processed_document_pages_via_doc_delete ON docproc.processed_document_pages;
CREATE POLICY processed_document_pages_via_doc_delete ON docproc.processed_document_pages
  FOR DELETE TO PUBLIC
  USING (EXISTS (SELECT 1
                 FROM docproc.processed_documents d
                 WHERE d.id = processed_document_pages.processed_document_id
                   AND (d.owner_id = auth.uid()
                        OR (d.organization_id IS NOT NULL
                            AND is_member_of_organization(d.organization_id)))));
