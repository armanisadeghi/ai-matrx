-- D146 FOLLOW-UP — hoist the docproc page-extraction GRANT lane out of the
-- per-row scan path.
--
-- THE DEFECT (same disease, different helper name)
-- The 2026-08-15 sweep (migrations/iam_hoist_has_org_access_set_wise_d146.sql)
-- fixed every non-INSERT policy that named `iam.has_org_access`. THE CLASS IS
-- THE SHAPE, NOT THE HELPER NAME: any `SECURITY DEFINER` function in a policy's
-- `USING` clause is called ONCE PER CANDIDATE ROW, because `SET search_path`
-- alone forecloses inlining and hoisting.
--
-- `public.can_read_extraction_job(uuid)` is exactly that shape, and it is worse
-- than most: it is a NESTED per-row definer chain — each call runs
-- `iam.has_access('file', …)` and `public.can_read_processed_document(…)`,
-- which themselves scan `iam.permissions`, `iam.organization_member`,
-- `rag.data_store_members`/`_grants` and `iam.org_industries`.
--
-- MEASURED LIVE, as a real signed-in user, on a table holding just 492 rows:
--   select count(*) filter (where can_read_extraction_job(job_id))
--     from docproc.page_extraction_results            -> 3,570 ms
--   the equivalent hoisted org lane                   ->   530 ms (incl. connect)
-- Because PERMISSIVE policies are OR'd, EVERY row pays the grant lane even
-- though the sibling org lane went set-wise in the D146 sweep. At 492 rows this
-- is 3.5s; the same shape at scan scale is the 8s `authenticated`
-- statement_timeout -> 57014 -> HTTP 500 that reads like an outage.
--
-- THE REWRITE, AND WHY IT IS EXACTLY EQUIVALENT
-- `can_read_extraction_job(x)` is, verbatim:
--   EXISTS (SELECT 1 FROM docproc.page_extraction_jobs j
--           WHERE j.id = x AND (<arm A> OR <arm B> OR <arm C>))
-- so it is a membership test against the set
--   { j.id : j IN page_extraction_jobs, <arm A> OR <arm B> OR <arm C> }
-- `public.readable_extraction_job_ids()` below IS that set, spelled with the
-- THREE ARMS COPIED BYTE-FOR-BYTE, the same `SECURITY DEFINER` owner (postgres,
-- BYPASSRLS — so the inner scan sees the same rows the old helper saw, and the
-- rewrite does not become dependent on `page_extraction_jobs`' own RLS), and
-- the same `SET search_path TO 'public','docproc','iam'`. Nothing about WHO is
-- admitted is re-derived, re-modeled, or widened — only WHEN the arms run.
--
-- THE HARD ARM, PROVEN NOT ASSUMED. Arm B (`iam.has_access('file', j.file_id,
-- 'viewer')`) does NOT collapse into a set expression cleanly, and this
-- migration deliberately DOES NOT TRY. Replacing it with
-- `accessible_entity_ids('file', …)` would be a re-derivation of the access
-- model — the exact move that broke component reads in the 2026-08-13 incident
-- — so the arm is left as a per-row call INSIDE the set-producing function.
-- The win comes from cardinality, not from rewriting the access check: the
-- expensive chain now runs once per JOB (32 rows) instead of once per RESULT
-- (492), once per RUN (27) and once per PAGE-RUN (132) — one hashed SubPlan per
-- query instead of N nested definer chains. The arms are identical, so
-- equivalence needs no argument about `has_access`' semantics at all.
--
-- THE `IS NOT NULL` GUARD. For a NULL key the old helper returns FALSE while
-- `NULL IN (<non-empty set>)` returns NULL. Both reject the row, but only the
-- guard keeps the predicate identical in all THREE truth values rather than
-- merely in which rows it admits (D146's reasoning, unchanged). Every key
-- column here (`jobs.id`, and `job_id` on all three children) is already
-- NOT NULL live, so the guard can never fire — it is written anyway so the
-- predicate stays correct if a column is ever relaxed, and so no future reader
-- has to re-derive the question.
--
-- EQUIVALENCE PROOF (run live, 2026-08-14, before applying this file)
-- Seven identities — three job owners, an org admin, an org member, a member of
-- unrelated orgs, and a stranger — probed in rolled-back transactions with
-- `set local role authenticated` + `set local request.jwt.claims`, on the
-- SESSION-mode pooler port 5432 (transaction mode 6543 leaks `SET LOCAL ROLE`
-- across clients and silently corrupts identity-scoped RLS testing), asserting
-- `current_user` and `auth.uid()` INSIDE each probe. For every identity, over
-- EVERY row of all four tables, under a strict `IS DISTINCT FROM`:
--       old predicate  IS DISTINCT FROM  new predicate   ->  0 rows. Always.
-- The grant lane is doing real work in that sample, so this is not a vacuous
-- proof: the owner of ONE job reads 23 jobs / 438 results through arms B and C.
-- Admitted-row sets were snapshotted per identity before and after and compared
-- element-wise: identical.
--
-- SCOPE — all FOUR policies that name the helper, not just the two that were
-- reported. `page_extraction_runs` and `page_extraction_page_runs` carry the
-- byte-identical `can_read_extraction_job(job_id)` shape; fixing two of four
-- would leave the same defect live under a different table name.
--
-- The single-row `can_read_extraction_job(uuid)` is KEPT (still granted, still
-- correct for a one-row check) and its comment now points at the set-wise
-- sibling so the next reader does not reintroduce the per-row form in a policy.
--
-- Idempotent: CREATE OR REPLACE + DROP POLICY IF EXISTS / CREATE POLICY.

-- =====================================================================
-- 1. The set-valued twin. Arms copied verbatim from
--    public.can_read_extraction_job(uuid); security context identical.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.readable_extraction_job_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'docproc', 'iam'
AS $function$
  SELECT j.id
  FROM docproc.page_extraction_jobs j
  WHERE j.owner_id = auth.uid()
     OR (j.file_id IS NOT NULL AND iam.has_access('file', j.file_id, 'viewer'::permission_level))
     OR (j.processed_document_id IS NOT NULL
         AND public.can_read_processed_document(j.processed_document_id, auth.uid()))
$function$;

COMMENT ON FUNCTION public.readable_extraction_job_ids() IS
  'Set-wise twin of can_read_extraction_job(uuid): the ids of every page-extraction job the caller may read (owner, file-grant, or processed-document grant). Uncorrelated, so `x IN (SELECT public.readable_extraction_job_ids())` plans as ONE hashed SubPlan per query instead of a per-row nested SECURITY DEFINER chain. USE THIS FORM IN RLS POLICIES — never the single-row helper (D146).';

REVOKE ALL ON FUNCTION public.readable_extraction_job_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.readable_extraction_job_ids() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.can_read_extraction_job(uuid) IS
  'TRUE when the caller may read this page-extraction job (owner, file-grant, or processed-document grant). NEVER call this from an RLS USING clause — a SECURITY DEFINER helper there runs once per candidate row and this one nests two more definer chains (measured: 3.5s over 492 rows). Use public.readable_extraction_job_ids() set-wise instead (D146).';

-- =====================================================================
-- 2. The four grant-lane policies, hoisted in place. Same policy name, same
--    command, same roles, same PERMISSIVE-ness; only the predicate form
--    changes. Sibling owner/org policies are untouched.
-- =====================================================================

DROP POLICY IF EXISTS page_extraction_jobs_grant_read ON docproc.page_extraction_jobs;
CREATE POLICY page_extraction_jobs_grant_read ON docproc.page_extraction_jobs
  FOR SELECT TO authenticated
  USING (id IS NOT NULL AND id IN (SELECT public.readable_extraction_job_ids()));

DROP POLICY IF EXISTS page_extraction_results_grant_read ON docproc.page_extraction_results;
CREATE POLICY page_extraction_results_grant_read ON docproc.page_extraction_results
  FOR SELECT TO authenticated
  USING (job_id IS NOT NULL AND job_id IN (SELECT public.readable_extraction_job_ids()));

DROP POLICY IF EXISTS page_extraction_runs_grant_read ON docproc.page_extraction_runs;
CREATE POLICY page_extraction_runs_grant_read ON docproc.page_extraction_runs
  FOR SELECT TO authenticated
  USING (job_id IS NOT NULL AND job_id IN (SELECT public.readable_extraction_job_ids()));

DROP POLICY IF EXISTS page_extraction_page_runs_grant_read ON docproc.page_extraction_page_runs;
CREATE POLICY page_extraction_page_runs_grant_read ON docproc.page_extraction_page_runs
  FOR SELECT TO authenticated
  USING (job_id IS NOT NULL AND job_id IN (SELECT public.readable_extraction_job_ids()));
