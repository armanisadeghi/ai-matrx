-- D146 FOLLOW-UP — take the per-row SECURITY DEFINER calls out of the
-- `files.pages` and `docproc.processed_document_pages` SELECT scan paths.
--
-- THE DEFECT CLASS (same as
-- migrations/docproc_extraction_grant_lane_set_wise_d146_followup.sql and
-- migrations/iam_hoist_has_org_access_set_wise_d146.sql). A `SECURITY DEFINER`
-- function in a policy's `USING` clause is called ONCE PER CANDIDATE ROW —
-- `SET search_path` alone forecloses inlining and hoisting. PERMISSIVE policies
-- are OR'd, so every row pays every lane. THE CLASS IS THE SHAPE, NOT THE
-- HELPER NAME.
--
-- 🚨 READ THIS BEFORE "FINISHING THE JOB" ON files.pages. The set-wise parent
-- pivot that fixed the docproc extraction tables was TRIED HERE, MEASURED, AND
-- REJECTED — it made things WORSE. The measurements and the reason are in
-- section 2 below. Do not re-apply it without re-reading them.
--
-- MEASURED LIVE, 2026-08-14/15, session-mode pooler (port 5432), as each real
-- signed-in identity with that role's real statement_timeout applied.
--
--   BEFORE, docproc.processed_document_pages (8,787 rows / 137 docs):
--     select count(*)                     owner ......... 2,428 ms
--                                         everyone else . 57014 TIMEOUT @ 8s
--     ... where processed_document_id = '<one doc>'   (618 candidates)
--                                         non-owner ..... 4,855 ms
--   AFTER:
--     select count(*)                     owner ........... 206 ms
--                                         grant reader .... 549 ms
--                                         non-owner ....... 779 ms
--     ... filtered by one doc             non-owner ....... 793 ms
--
-- That filtered read is why `pnpm check:access-matrix` was red at 41/42 with
-- `doc f3cf55a1 pages RLS (control) expected 0, got -1`: `-1` is
-- scripts/access-matrix/lib.ts's "the read itself errored" sentinel (NOT a
-- leak). PostgREST's `count=exact` pays that 4.9s twice — once to count, once
-- to fetch — crossing the 8s cap. It is green after this migration.
--
-- ============================================================================
-- WHY EACH REWRITE IS EXACTLY EQUIVALENT
-- ============================================================================
-- Every arm is COPIED BYTE-FOR-BYTE into a `RETURNS SETOF uuid` STABLE twin.
-- Nothing about WHO is admitted is re-derived, re-modeled, or widened — only
-- WHEN the arms run.
--
-- 🚨 `iam.has_access` / `can_read_processed_document` are NOT swapped for
-- `accessible_entity_ids`. Re-deriving the access model is the move that broke
-- component reads on 2026-08-13. The win comes purely from CARDINALITY.
--
-- THE MEMBERSHIP IDENTITY. Each old predicate has the form
--     f(K)  =  EXISTS (SELECT 1 FROM parent d WHERE d.id = K AND COND(d))
-- and `d.id` is the parent's PRIMARY KEY, so
--     f(K)  <=>  K IN (SELECT d.id FROM parent d WHERE COND(d))
-- by construction — no argument about `can_read_*` semantics is needed at all,
-- because COND is character-identical on both sides.
--
-- SECURITY CONTEXT IS NOT UNIFORM ACROSS THE TWINS, AND THAT IS DELIBERATE:
--   * A twin replacing a FUNCTION CALL (`can_read_processed_document`,
--     `can_curate_library_document`) must be SECURITY DEFINER. Those helpers
--     are postgres-owned definers that already read their tables WITHOUT RLS,
--     so the twin must iterate the FULL parent table. Making it INVOKER would
--     shrink the domain to RLS-visible parents and NARROW the result.
--   * A twin replacing a DIRECT TABLE REFERENCE (the former `via_doc_all`
--     `EXISTS (SELECT 1 FROM docproc.processed_documents d ...)`) must be
--     SECURITY INVOKER. PostgreSQL applies a referenced table's own RLS to
--     subqueries inside a policy expression, so that subquery was already
--     filtered by processed_documents' policies — notably
--     `processed_documents_org_member_select`, which also requires
--     `deleted_at IS NULL`. A BYPASSRLS definer twin would see rows that
--     subquery could not (a soft-deleted document whose org the caller belongs
--     to) and would WIDEN the admitted set.
-- Over-tightening is as serious a defect as a hole (db-rules §6), so both
-- directions were checked, not just the leaky one.
--
-- THE `IS NOT NULL` GUARD is not optional. For a NULL key the old helper
-- returns FALSE while `NULL IN (<non-empty set>)` returns NULL. Both reject the
-- row, but only the guard keeps the predicate identical in all THREE truth
-- values rather than merely in which rows it admits (D146's reasoning,
-- unchanged). `processed_document_id` is NOT NULL live with 0 NULL rows, so the
-- guard can never fire. It is written anyway so the predicate stays correct if
-- the column is ever relaxed, and so no future reader has to re-derive it.
--
-- ⚠️ ONE DELIBERATE, UNREACHABLE EXCEPTION — stated because the proof FOUND it
-- rather than assumed it away. `can_curate_library_document(p_doc, p_user)`
-- begins `SELECT public.is_super_admin_user(p_user) OR EXISTS (...)`, so for a
-- SUPER-ADMIN caller it short-circuits TRUE **without ever looking at p_doc** —
-- including a NULL p_doc. The curator twin, being a set of real document ids,
-- yields FALSE there. Probed live across all ten identities over all 186
-- document ids plus an explicit NULL: the ONLY disagreeing key in the entire
-- matrix is that synthetic NULL, and only for the three super-admins:
--     key=NULL  old=TRUE  new=FALSE      (all 186 real keys: identical)
-- It is unreachable — `processed_document_id` is NOT NULL with 0 NULL rows and
-- an FK to `docproc.processed_documents` — and it NARROWS only a row that
-- cannot exist (a page belonging to no document). The old form admitting such a
-- row was itself the latent defect; it is not preserved.
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
-- Same roles (PUBLIC), same PERMISSIVE-ness, so per-command OR semantics are
-- identical.
--
-- ============================================================================
-- EQUIVALENCE PROOF (run live, 2026-08-14/15, before and after applying)
-- ============================================================================
-- Ten identities — four page owners, a shared-knowledge grant reader, an
-- industry curator, three super-admins, an org admin, an org member, a member
-- of unrelated orgs, a stranger, and ANON — probed in rolled-back transactions
-- with `set local role` + `set local request.jwt.claims`, on the SESSION-mode
-- pooler port 5432 (transaction mode 6543 leaks `SET LOCAL ROLE` across clients
-- and silently corrupts identity-scoped RLS testing), asserting `current_user`
-- AND `auth.uid()` INSIDE every probe.
--
-- For every identity, over EVERY row / EVERY distinct key, under a strict
-- `IS DISTINCT FROM`: 0 disagreements on every lane — the files.pages owner
-- lane compared per-ROW over all 6,567 rows, not per key. The single exception
-- in the whole matrix is the synthetic NULL key on the curator lane for
-- super-admins, dissected above.
--
-- Admitted-row sets were snapshotted per identity before and after and compared
-- ELEMENT-WISE: 38,686 admitted rows across 10 identities x 2 tables, ZERO
-- differences. The proof is not vacuous: the grant reader sees 618
-- `processed_document_pages` rows through `can_read_processed_document`'s
-- data-store lane, the super-admins take `can_curate_library_document`'s
-- short-circuit, and the page owners are admitted through the owner lane.
--
-- Idempotent: CREATE OR REPLACE + DROP POLICY IF EXISTS / CREATE POLICY.


-- =====================================================================
-- 1. Set-valued twins for docproc.processed_document_pages. Arms copied
--    verbatim from the policies/helpers they replace.
-- =====================================================================

-- curator lane: can_curate_library_document(doc, auth.uid())
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
  'Set-wise twin of can_curate_library_document(doc, auth.uid()): the ids of every processed document the caller may curate. Uncorrelated, so `x IN (SELECT ...)` plans as ONE hashed SubPlan — the definer chain runs once per DOCUMENT (186) instead of once per PAGE (8,787). USE THIS FORM IN RLS POLICIES (D146).';

REVOKE ALL ON FUNCTION public.curatable_processed_document_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.curatable_processed_document_ids() TO authenticated, anon, service_role;

-- library-grant lane: can_read_processed_document(doc, auth.uid())
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

-- via-doc lane: the EXISTS(owner OR org-member) arm.
-- SECURITY INVOKER ON PURPOSE — see the security-context note in the header.
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
  'Set-wise twin of the processed_document_pages via-doc SELECT lane: the ids of every processed document the caller owns or reaches through org membership. Arms copied verbatim from the former processed_document_pages_via_doc_all USING clause. DELIBERATELY SECURITY INVOKER: it replaces a direct table reference inside a policy, which PostgreSQL already filters through docproc.processed_documents'' own RLS; a BYPASSRLS definer twin would widen the admitted set (e.g. soft-deleted org documents). USE THIS FORM IN RLS POLICIES (D146).';

REVOKE ALL ON FUNCTION public.owned_or_org_processed_document_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owned_or_org_processed_document_ids() TO authenticated, anon, service_role;

-- Point the surviving single-row helpers at their set-wise siblings so the next
-- reader does not reintroduce the per-row form in a policy. The single-row
-- functions are KEPT — still granted, still correct for a one-row check.
COMMENT ON FUNCTION public.can_read_processed_document(uuid, uuid) IS
  'TRUE when the given user may read this processed document (owner, curator, org member, data-store grant, or iam grant). NEVER call this from an RLS USING clause — a SECURITY DEFINER helper there runs once per candidate row (measured: 4.9s over 618 candidate rows, 8s TIMEOUT over 8,787). Use public.readable_processed_document_ids() set-wise instead (D146).';

COMMENT ON FUNCTION public.can_curate_library_document(uuid, uuid) IS
  'TRUE when the given user may curate this library document (super-admin, or industry curator on a data store granting it). NEVER call this from an RLS USING clause — a SECURITY DEFINER helper there runs once per candidate row. Use public.curatable_processed_document_ids() set-wise instead (D146). NOTE: short-circuits TRUE for a super-admin without inspecting p_doc, so it returns TRUE even for a non-existent or NULL doc id.';

COMMENT ON FUNCTION public.is_resource_owner(text, uuid) IS
  'TRUE when auth.uid() owns the given shareable resource, resolved dynamically through platform.shareable_resource_registry. NEVER call this from an RLS USING clause — it is SECURITY DEFINER (so it runs once per candidate row) AND each call re-resolves the registry and queries information_schema before a dynamic single-row lookup. On a table that already carries its own owner column, compare that column directly, exactly as that table''s INSERT/UPDATE/DELETE policies do (D146; files.pages, 2026-08-15).';


-- =====================================================================
-- 2. files.pages — the OWNER lane only.
--
--    `file_pages_select` used `is_resource_owner('file_pages', id)`: a
--    SECURITY DEFINER that, PER ROW, re-resolved the shareable registry,
--    queried information_schema, and then ran a dynamic single-row lookup —
--    6,567 times per scan. It reduces exactly to a plain column comparison,
--    and the reduction was read out of the live function body and the live
--    registry row rather than assumed:
--      1. `public.resolve_shareable_resource('file_pages')` SUCCEEDS live —
--         `platform.shareable_resource_registry` has an `is_active` row
--         (schema_name='files', table_name='pages', id_column='id',
--         owner_column='owner_id'), so `is_resource_owner`'s exception arm
--         (which would make the policy fail silent-closed, per THE ONE TOKEN
--         invariant, db-rules §6c) is NOT taken. The token IS valid.
--      2. `public.shareable_owner_column('files','pages','owner_id')` returns
--         'owner_id' (the column exists, so the `created_by` fallback is not
--         reached — files.pages has no `created_by`, correctly: it is a
--         component, §6d-1).
--      3. The helper then runs `SELECT owner_id FROM files.pages WHERE id=$1`.
--         `id` is the PRIMARY KEY, so this returns exactly the scanned row's
--         own `owner_id`; the helper is postgres-owned (BYPASSRLS) so the
--         lookup is not itself RLS-filtered.
--      4. `owner_id` is NOT NULL live (0 NULL rows), so `v_owner_id IS NOT
--         NULL` is always true, and the helper returns FALSE (never NULL)
--         when `auth.uid()` is NULL.
--    Therefore it is, in all three truth values,
--      `(SELECT auth.uid()) IS NOT NULL AND owner_id = (SELECT auth.uid())`
--    — character-for-character what this table's OWN file_pages_insert /
--    file_pages_update / file_pages_delete policies already assert. Proven
--    per-ROW over all 6,567 rows for all ten identities: 0 disagreements.
--    Role stays PUBLIC: anon evaluated the old helper to FALSE via its
--    `v_uid IS NULL` early return and evaluates the new predicate to FALSE via
--    the same guard. Anon is not widened by one row.
--
-- 🚨 WHY `file_pages_grant_read` IS LEFT ALONE — TRIED, MEASURED, REVERTED.
--    The obvious next move is the docproc parent pivot: hoist
--    `iam.has_access('file', file_id, 'viewer')` into a
--    `readable_file_page_file_ids()` twin over the 66 distinct file_ids. That
--    was built and applied here on 2026-08-15, and it made the table WORSE:
--
--      filtered read of ONE file (618 rows), grant reader
--          per-row grant lane (original) ....... PASSED the access matrix
--          hoisted twin ........................ 12,606 ms  -> matrix -1
--      unfiltered count(*), owner
--          per-row grant lane (original) ........ 3,513 ms
--          hoisted twin ......................... 7,009 ms
--
--    THE PIVOT ASSUMES THE PER-CALL COST IS SMALL AND THE ROW COUNT IS THE
--    PROBLEM. On this table that assumption is false. `EXPLAIN (ANALYZE,
--    BUFFERS)` shows the hoist itself worked perfectly — ONE `hashed SubPlan`,
--    `loops=1` — while a SINGLE `iam.has_access('file', ...)` call costs
--    ~110 ms and ~25,000 shared buffers, because the file lane
--    (`files.has_access_for` -> `files.is_crawl_artifact` /
--    `files.crawl_site_conveys` / `iam.has_access_for_base`) is expensive.
--    66 x 110 ms is ~7 s of UNCONDITIONAL work on every read, however narrow —
--    the twin cannot see the query's `file_id` filter, so a request for one
--    document pays for all 66. The per-row form, by contrast, costs nothing
--    when the filter excludes rows and runs warm on repeated identical
--    file_ids, which is exactly how the app reads pages (always by file).
--
--    So the per-row shape is retained here DELIBERATELY. The real defect on
--    this table is not the policy shape — it is that `iam.has_access` on the
--    'file' type is ~110 ms / 25k buffers per call. Fixing THAT is a separate,
--    tracked piece of work; it must not be "fixed" by re-deriving the access
--    model with `accessible_entity_ids` (the 2026-08-13 component-read
--    breakage). Until it is fixed, an UNFILTERED `select * from files.pages`
--    remains over the 8 s cap for non-owners. Every real surface reads pages
--    filtered by file, which is served fine.
--
--    ✅ THAT WORK WAS DONE, 2026-08-15, in
--    migrations/iam_access_kernel_plpgsql_plan_cache_d146_followup.sql — read
--    it before touching the resolver. It found TWO causes, neither of them the
--    access model: (1) planner statistics that had NEVER been collected on most
--    kernel tables, which mis-planned `_edu_can_read_via_assignment` and
--    accounted for 66% of all buffer traffic; (2) a `LANGUAGE sql` function
--    nested inside a `LANGUAGE sql` body re-acquiring its callee's plan on
--    every call (same body as plpgsql: 1,678 ms -> 187 ms). The policies on
--    this table were NOT changed. Filtered reads are now ~100 ms (was
--    281-377 ms); the unfiltered scan is ~35% faster and passes for some
--    identities but STILL exceeds 8 s (8.4-8.7 s) for an identity admitted few
--    rows. That file records exactly what remains and why.
-- =====================================================================

DROP POLICY IF EXISTS file_pages_select ON files.pages;
CREATE POLICY file_pages_select ON files.pages
  FOR SELECT TO PUBLIC
  USING ((SELECT auth.uid()) IS NOT NULL AND owner_id = (SELECT auth.uid()));

-- Restored to its original per-row form (see the note above). Recreated
-- explicitly, rather than left untouched, so this file is a complete and
-- idempotent statement of the live policy set.
DROP POLICY IF EXISTS file_pages_grant_read ON files.pages;
CREATE POLICY file_pages_grant_read ON files.pages
  FOR SELECT TO authenticated
  USING (iam.has_access('file'::text, file_id, 'viewer'::public.permission_level));

-- The abandoned twin from the reverted attempt. Dropped so no future reader
-- finds an unused set-wise helper and assumes it is the intended form.
DROP FUNCTION IF EXISTS public.readable_file_page_file_ids();


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
