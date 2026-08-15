-- D146 FOLLOW-UP #2 — make `iam.has_access` on the 'file' type CHEAP.
--
-- Parent: migrations/files_pages_and_doc_pages_select_set_wise_d146_followup.sql
-- READ ITS SECTION 2 FIRST. It records the set-wise parent pivot being TRIED on
-- `files.pages`, MEASURED, and REVERTED, and it names the real defect that this
-- file fixes: "the real defect on this table is not the policy shape — it is
-- that `iam.has_access` on the 'file' type is ~110 ms / 25k buffers per call."
-- Nothing here changes a policy. THE POLICY SHAPE IS NOT TOUCHED.
--
-- ============================================================================
-- WHAT WAS ACTUALLY WRONG — TWO CAUSES, NEITHER OF THEM THE ACCESS MODEL
-- ============================================================================
-- Measured live 2026-08-15 on the SESSION-mode pooler (port 5432), as
-- elliesadeghijd (a non-owner of ~all of files.pages), with
-- `EXPLAIN (ANALYZE, BUFFERS)` plus `pg_stat_statements.track = 'all'` to
-- attribute cost to the statements NESTED inside the definer chain:
--
--   select count(*) from files.pages   (6,567 rows / 66 distinct file_id)
--     -> 13,192 ms, 1,675,754 shared buffer hits.
--
-- CAUSE 1 — A BAD PLAN FROM STALE/ABSENT PLANNER STATISTICS (66% of buffers).
--   `iam.has_access_for_base` calls `public._edu_can_read_via_assignment`,
--   whose probe of `platform.associations_live` was planned as an index scan on
--   `idx_assoc_target_live` keyed ONLY on `target_type = 'scope'` — 191 rows
--   scanned and filtered per call, 78 buffers a call, 1,106,508 buffers over
--   the scan. The correct index (`idx_assoc_source_live`, on the highly
--   selective `source_type, source_id`) already existed; the planner would not
--   pick it because `platform.associations` estimated `target_type='scope'` at
--   ONE row when 191 matched. `ANALYZE` alone flipped the plan.
--   Every kernel table was checked: `platform.entity_types`,
--   `platform.entity_relationships`, `iam.permissions`, `iam.system_orgs`,
--   `iam.membership_grant`, `admin.admins`, `files.files`, `files.pages`,
--   `files.folders`, `web.snapshot`, `web.screenshot` had **never been
--   analyzed at all** (`last_analyze` and `last_autoanalyze` both NULL;
--   `files.files` reported 1,616 live tuples against ~40,000 real rows).
--   Effect of the ANALYZE pass: 1,675,754 -> 597,028 buffers, 13,192 -> 11,530 ms.
--
-- CAUSE 2 — A SQL-LANGUAGE FUNCTION NESTED INSIDE A SQL-LANGUAGE FUNCTION PAYS
--   A PLAN LOOKUP ON EVERY CALL. This is the ~110 ms/25k-buffer smell the
--   parent recorded, and it is a PostgreSQL execution property, not an access
--   rule. A `LANGUAGE sql` body is one query; each nested `LANGUAGE sql`
--   function call inside it re-acquires its callee's cached plan per
--   invocation, at a cost proportional to that callee's plan complexity.
--   `LANGUAGE plpgsql` instead caches each statement's plan in the function's
--   own session-lifetime plan cache and reuses it.
--
--   Isolated live, same 6,567 rows, same body, ONLY the language changed:
--     files.is_crawl_artifact called from a SQL function body ... 1,678 ms
--     ... identical body as plpgsql ............................... 187 ms   (9x)
--   Controls that rule out the alternative explanations:
--     * a trivial nested SECURITY DEFINER SQL fn (`select false`) costs 121 ms
--       over the same rows -> the tax scales with the CALLEE'S PLAN, it is not
--       a per-frame cost;
--     * the same function with no `SET search_path` costs the same -> it is
--       not search-path churn;
--     * hoisting its `exists (...)` subquery into a helper changes nothing ->
--       it is not per-call SubPlan setup;
--     * a bare wrapper around `iam.has_access_for_base` costs +200 ms total
--       (3%) -> plain nesting is cheap; the tax is the plan re-acquisition.
--
-- THE FIX IS THEREFORE PURELY MECHANICAL: every hot `LANGUAGE sql` function in
-- the file lane is rewritten as `LANGUAGE plpgsql` with its expression COPIED
-- CHARACTER-FOR-CHARACTER into `RETURN <expr>;`. Volatility, SECURITY DEFINER,
-- `SET search_path`, parameter names, defaults, and (via CREATE OR REPLACE)
-- the existing GRANTs are all preserved exactly.
--
-- ============================================================================
-- WHY THIS IS EXACTLY EQUIVALENT
-- ============================================================================
-- `RETURN <expr>;` in plpgsql evaluates `<expr>` with the same executor, the
-- same snapshot, the same search_path and the same definer identity as
-- `SELECT <expr>` in a SQL body. The expressions here are not rewritten,
-- reordered, merged, simplified, or re-derived — diff them against the parent
-- definitions and only `LANGUAGE`/`SELECT`->`RETURN` differ. Three-valued
-- logic is preserved because the expression is preserved; a NULL argument
-- yields the same NULL/FALSE it did before.
--
-- 🚨 `iam.has_access` is NOT swapped for `accessible_entity_ids`, and the
-- access model is NOT re-derived. That is the 2026-08-13 move that broke
-- component reads, and it is deliberately not made here. Over-tightening is as
-- serious a defect as a hole (db-rules FEATURE.md §6 THE SECURITY PHILOSOPHY),
-- so the proof below checks BOTH directions, not only the leaky one.
--
-- Section 4 additionally makes TWO mechanical changes inside
-- `iam.has_access_for_base`. Its LADDER IS UNTOUCHED — same arms, same order,
-- same guards, same short-circuit points; only HOW two of them are evaluated
-- changes (an OUT-param call made as an expression instead of `select * into`,
-- and a lazy memo of the `is_org_admin_for(v_uid, v_org)` answer that this
-- function already asks TWICE with identical arguments). Worth -510 ms (-7%).
--
-- Two REAL rewrites of that ladder were prototyped, measured, and REJECTED —
-- recorded so the next reader does not repeat them:
--   * Merging the OR'd arms into one statement (10 statements -> 1):
--     6,499 ms -> 25,219 ms. Each execution rebuilds the hashed SubPlans for
--     `iam.system_orgs` and `iam.organization_member`.
--   * The same merge using scalar helper calls instead of inline subqueries:
--     -716 ms before the language fix, and only -308 ms (-4%) after it — not
--     worth restructuring a function that 975 policies depend on.
--
-- ============================================================================
-- EQUIVALENCE PROOF (run live, 2026-08-15, before and after applying)
-- ============================================================================
-- Twelve identities — a page owner who is also a super-admin, the shared-
-- knowledge grant reader, two more super-admins, three org admins, two org
-- members, two strangers with no org, and ANON — probed in rolled-back
-- transactions on the SESSION-mode pooler port 5432 (transaction mode 6543
-- leaks `SET LOCAL ROLE` across clients and silently corrupts identity-scoped
-- RLS testing), asserting `current_user`, `auth.uid()` AND `auth.role()`
-- INSIDE every probe.
--
--   * VERDICT MATRIX: `iam.has_access_for(uid, token, id, level)` over every
--     active entity token (up to 3 live rows each) x all three permission
--     levels x all twelve identities.
--   * ADMITTED ROW SETS: the real-RLS `id` list of files.pages, files.files,
--     docproc.processed_document_pages, docproc.processed_documents,
--     web.snapshot, web.screenshot and platform.associations, per identity,
--     compared ELEMENT-WISE (not by count).
--
-- RESULT — 31,464 verdict probes (874 rows across 308 active entity tokens x 3
-- levels x 12 identities) and 62,436 admitted rows: **ZERO differences**, under
-- a strict inequality, element-wise, in BOTH directions. Nothing narrowed and
-- nothing widened. `pnpm check:access-matrix` re-run after: 42/42 green.
--
-- The proof is not vacuous — it separates the identities it is meant to
-- separate: 1,918 / 1,275 / 520 / 407 / 399 / 259 / 175 / 133 / 130 / 0 true
-- verdicts respectively across the twelve, and admitted `files.pages` counts of
-- 5,808 (owner) / 1,083 (grant reader) / 804 / 157 / 137 / 29 / 0 / 0 (anon).
--
-- ⚠️ THE RAW COMPARISON SHOWED FOUR "GAINED" ROWS, ALL EXPLAINED AND STATED
-- HERE RATHER THAN FILTERED AWAY. Three `files.files` rows (`0b7f313e…`,
-- `0a68fc20…`, `01bb9d2c…` — all `payload.json`, owner `4cf62e4e…`, org
-- `f9cb3e35…`, visibility `personal`) were INSERTED BY ANOTHER SESSION at
-- 08:54:37, 08:57:46 and 09:12:32 UTC, inside the window between the two runs
-- (this is a shared live database). They appear progressively across the
-- snapshots exactly in creation order, they are visible only to the identities
-- that own or share their org, and **zero rows were LOST anywhere in the
-- matrix** — a widening bug cannot present as "only the newest rows, only to
-- their own owner and org". Excluding those three ids from BOTH sides, the
-- comparison is byte-identical.
--
-- ============================================================================
-- MEASURED EFFECT, AND WHAT IS STILL NOT FIXED
-- ============================================================================
-- `select count(*) from files.pages` (6,567 rows), unfiltered, per identity,
-- with the role's real 8 s statement_timeout. Five consecutive runs vary by
-- under 40 ms, so these are stable numbers, not samples.
--
--                              before          after
--   owner (arman) ........... 2,013 ms        1,284 ms
--   grant reader (ellie) .... 8 s TIMEOUT     6,898 ms
--   super-admin (admin) ..... 8 s TIMEOUT     7,555 ms
--   super-admin (info) ...... 8 s TIMEOUT     8,423 ms   <-- STILL OVER
--   org admin / org member /
--     stranger .............. 8 s TIMEOUT     8,551-8,722 ms   <-- STILL OVER
--   anon .......................  171 ms         51 ms
--   filtered one-document read  281-377 ms    99-104 ms
--   buffers, full scan ...... 1,675,754         597,028
--
-- 🚨 THE UNFILTERED SCAN IS NOT UNDER THE CAP FOR EVERY IDENTITY. It is fixed
-- for the grant reader and one super-admin and roughly 35% faster for the rest,
-- but an identity that is admitted FEW rows still pays the full ladder ~6,500
-- times and lands at 8.4-8.7 s. Every real surface reads pages filtered by
-- file_id and is served in ~100 ms.
--
-- What is left is intrinsic to the shape, not to any remaining defect:
-- ~15,600 kernel invocations for 6,567 rows (each page resolves its file, then
-- that file's folder), at ~0.55 ms each. About 2.6 s of that is plpgsql's
-- un-cacheable dynamic SQL — `platform.entity_row_access_attrs` (~1.35 s) plus
-- the parent-FK fetch in the containment loop (~0.9 s) — and neither can be
-- made static while the kernel stays generic over `platform.entity_types`.
--
-- TWO further moves were identified and NOT taken, because neither is provable
-- to the standard above and both are the owner's call, not an agent's:
--   * Merging the attrs read and the parent-FK fetch into one dynamic query
--     (~0.9 s). It changes WHEN a registry-drift error surfaces: today a bogus
--     `fk_column` is never read if an earlier parent already granted access.
--   * Marking the kernel `PARALLEL SAFE` so the scan splits across workers.
--     `entity_row_access_attrs` uses `BEGIN … EXCEPTION` (a subtransaction),
--     and parallel-safety on the access kernel is a security-adjacent decision.
-- The remaining alternative — hoisting to a set-wise twin — is the move the
-- parent migration already tried, measured and reverted. Do not retry it.
--
-- Idempotent: ANALYZE + CREATE OR REPLACE only. No policy is created, dropped,
-- or altered anywhere in this file.


-- =====================================================================
-- 1. Planner statistics for every table the access kernel reads.
--
--    Most of these had NEVER been analyzed. This is not cosmetic: it is
--    64% of the buffer traffic of every `iam.has_access` call in the
--    platform, on every table, for every user.
-- =====================================================================

ANALYZE platform.entity_types;
ANALYZE platform.entity_relationships;
ANALYZE platform.reachability;
ANALYZE platform.associations;
ANALYZE iam.permissions;
ANALYZE iam.memberships;
ANALYZE iam.membership_grant;
ANALYZE iam.organization_member;
ANALYZE iam.system_orgs;
ANALYZE admin.admins;
ANALYZE files.files;
ANALYZE files.pages;
ANALYZE files.folders;
ANALYZE web.snapshot;
ANALYZE web.screenshot;
ANALYZE web.site;

-- Keep the association statistics honest without waiting for the default
-- autovacuum threshold (10% of 15k rows). `platform.associations` is read by
-- `_edu_can_read_via_assignment` on EVERY kernel call, so a stale estimate
-- there is a platform-wide slowdown, which is exactly what happened.
ALTER TABLE platform.associations SET (autovacuum_analyze_scale_factor = 0.02);


-- =====================================================================
-- 2. The file lane, re-expressed in plpgsql. Expressions copied verbatim.
-- =====================================================================

CREATE OR REPLACE FUNCTION files.is_crawl_artifact(p_file_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'files', 'web'
AS $function$
begin
  return exists (
    select 1 from files.files f
    where f.id = p_file_id
      and f.metadata @> '{"system_artifact": true, "artifact_domain": "web_crawl"}'::jsonb
  ) or exists (
    select 1 from web.snapshot s
    where s.body_file_id = p_file_id or s.markdown_file_id = p_file_id
  ) or exists (
    select 1 from web.screenshot s where s.file_id = p_file_id
  );
end;
$function$;

COMMENT ON FUNCTION files.is_crawl_artifact(uuid) IS
  'TRUE when the file is web-crawl evidence (crawl-domain system artifact, snapshot body/markdown, or screenshot image). DELIBERATELY plpgsql, not sql: it is called from inside files.has_access_for''s body once per candidate row, and a LANGUAGE sql callee nested in a LANGUAGE sql body re-acquires its plan on every call — 1,678 ms vs 187 ms over 6,567 rows, same body (D146 follow-up, 2026-08-15). Do not "simplify" it back to LANGUAGE sql.';

CREATE OR REPLACE FUNCTION files.crawl_site_conveys(p_user_id uuid, p_file_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'files', 'web', 'iam'
AS $function$
begin
  return exists (
    select 1
    from files.files f
    where f.id = p_file_id
      and f.deleted_at is null
      and (
        -- Metadata-only legacy/site artifact.
        exists (
          select 1
          from web.site ws
          where ws.organization_id = f.organization_id
            and ws.deleted_at is null
            and f.metadata ->> 'web_site_id'
                ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and ws.id = (f.metadata ->> 'web_site_id')::uuid
            and iam.has_access_for(
              p_user_id, 'web_site', ws.id, 'viewer'::public.permission_level
            )
        )
        -- Snapshot body/markdown: a page or snapshot share is sufficient.
        or exists (
          select 1
          from web.snapshot s
          where s.organization_id = f.organization_id
            and s.deleted_at is null
            and (s.body_file_id = f.id or s.markdown_file_id = f.id)
            and iam.has_access_for(
              p_user_id, 'web_snapshot', s.id, 'viewer'::public.permission_level
            )
        )
        -- Screenshot image: a page, snapshot, or screenshot share is sufficient.
        or exists (
          select 1
          from web.screenshot s
          where s.organization_id = f.organization_id
            and s.deleted_at is null
            and s.file_id = f.id
            and iam.has_access_for(
              p_user_id, 'web_screenshot', s.id, 'viewer'::public.permission_level
            )
        )
      )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION files.has_access_for(p_user_id uuid, p_file_id uuid, p_required public.permission_level DEFAULT 'viewer'::public.permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'files', 'web', 'iam', 'auth'
AS $function$
begin
  return case
    when auth.role() = 'anon' then false
    when auth.role() = 'authenticated'
      and (auth.uid() is null or auth.uid() is distinct from p_user_id) then false
    when p_user_id is null then false
    when files.is_crawl_artifact(p_file_id) then
      case
        -- Canonical immutable evidence: VIEWER-CEILING for everyone.
        -- Read conveys from the site (either lane) OR from the base kernel at
        -- viewer (owner, org-internal, explicit grants, super-admin) so a
        -- deleted site never locks the owning org out. Write/admin: nobody.
        when exists (
          select 1 from files.files fi
          where fi.id = p_file_id and fi.metadata @> '{"system_immutable": true}'::jsonb
        )
        then p_required = 'viewer'::public.permission_level and (
          files.crawl_site_conveys(p_user_id, p_file_id)
          or iam.has_access_for_base(p_user_id, 'file', p_file_id, 'viewer'::public.permission_level)
        )
        -- Derived (variants) / legacy reference-classified files: site
        -- conveyance grants READ, and the base kernel keeps normal rights
        -- (owner write/admin for re-render/cleanup, org-internal read, …).
        else (
          p_required = 'viewer'::public.permission_level
          and files.crawl_site_conveys(p_user_id, p_file_id)
        )
        or iam.has_access_for_base(p_user_id, 'file', p_file_id, p_required)
      end
    else iam.has_access_for_base(p_user_id, 'file', p_file_id, p_required)
  end;
end;
$function$;

COMMENT ON FUNCTION files.has_access_for(uuid, uuid, public.permission_level) IS
  'The file lane of the access kernel: crawl evidence is viewer-ceiling and may convey from its site, everything else defers to iam.has_access_for_base. DELIBERATELY plpgsql — see files.is_crawl_artifact''s comment; this body calls three other definer functions once per candidate row (D146 follow-up, 2026-08-15).';

CREATE OR REPLACE FUNCTION iam.has_access_for(p_user_id uuid, p_type text, p_id uuid, p_required public.permission_level DEFAULT 'viewer'::public.permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'files', 'iam'
AS $function$
begin
  return case
    when p_type = 'file' then files.has_access_for(p_user_id, p_id, p_required)
    else iam.has_access_for_base(p_user_id, p_type, p_id, p_required)
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION iam.has_access(p_type text, p_id uuid, p_required public.permission_level DEFAULT 'viewer'::public.permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
begin
  return iam.has_access_for((select auth.uid()), p_type, p_id, p_required);
end;
$function$;

COMMENT ON FUNCTION iam.has_access(text, uuid, public.permission_level) IS
  'THE access predicate for RLS policies: may the current user reach this row at this level. DELIBERATELY plpgsql so its callees'' plans are cached across the calls a scan makes — see files.is_crawl_artifact''s comment (D146 follow-up, 2026-08-15). NOTE it is still called ONCE PER CANDIDATE ROW in a policy; that is correct for a table read with a filter, and it is why an UNFILTERED read of a large child table is still the expensive case.';

CREATE OR REPLACE FUNCTION iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required public.permission_level DEFAULT 'viewer'::public.permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
begin
  return iam.has_access_for_base(p_user_id, p_type, p_id, p_required, true);
end;
$function$;


-- =====================================================================
-- 3. The leaf predicates the kernel ladder calls on every invocation.
--    Same treatment, same verbatim expressions.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._edu_can_read_via_assignment(p_user_id uuid, p_type text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  return exists (
    select 1
    from platform.associations_live a
    join iam.memberships m
      on m.container_type = 'scope'
     and m.container_id   = a.target_id
     and m.user_id        = p_user_id
     and m.status         = 'active'
     and m.deleted_at is null
    where a.source_type = p_type
      and a.source_id   = p_id
      and a.target_type = 'scope'
      and a.role        = 'assignment'
  )
  or (
    p_type = 'fc_card' and exists (
      select 1
      from platform.associations_live link
      join platform.associations_live a
        on a.source_type = 'fc_set'
       and a.source_id   = link.target_id
       and a.target_type = 'scope'
       and a.role        = 'assignment'
      join iam.memberships m
        on m.container_type = 'scope'
       and m.container_id   = a.target_id
       and m.user_id        = p_user_id
       and m.status         = 'active'
       and m.deleted_at is null
      where link.source_type = 'fc_card'
        and link.source_id   = p_id
        and link.target_type = 'fc_set'
        and link.role        = 'member'
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public._edu_can_read_via_assignment(p_type text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  return public._edu_can_read_via_assignment((select auth.uid()), p_type, p_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_org_admin_for(p_user_id uuid, p_org_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return exists (
    select 1
    from iam.organization_member om
    where om.organization_id = p_org_id
      and om.user_id = p_user_id
      and om.role in ('owner', 'admin')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin_for(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return exists (
    select 1 from admin.admins a
    where a.user_id = p_user_id and a.level = 'super_admin'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION iam.has_org_access_for(p_user_id uuid, p_org uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return exists (select 1 from iam.organization_member m
                 where m.organization_id = p_org and m.user_id = p_user_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.user_can_read_data_store_via_grant(p_user uuid, p_store uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'rag', 'iam'
AS $function$
begin
  return p_user is not null and p_store is not null
     and (auth.uid() is null or auth.uid() = p_user or public.is_admin())
     and exists (
       select 1 from rag.data_store_grants g
       where g.data_store_id = p_store
         and (g.audience = 'global'
           or (g.audience = 'organization' and g.organization_id in (select om.organization_id from iam.organization_member om where om.user_id = p_user))
           or (g.audience = 'industry' and exists (select 1 from iam.org_industries oi join iam.organization_member om on om.organization_id = oi.organization_id where om.user_id = p_user and oi.industry_id = g.industry_id)))
     );
end;
$function$;


-- =====================================================================
-- 4. `iam.has_access_for_base` — two mechanical changes inside the ladder.
--    The LADDER ITSELF IS UNTOUCHED: same arms, same order, same guards,
--    same short-circuit points. Only HOW two of them are evaluated changes.
--
--    Two rewrites of this function's ladder were prototyped and REJECTED,
--    recorded here so nobody retries them:
--      * merging the eight OR'd arms into ONE statement, inline subqueries:
--        6,499 ms -> 25,219 ms. Every execution rebuilds the hashed SubPlans
--        for iam.system_orgs and iam.organization_member.
--      * the same merge via scalar helper calls: only -308 ms (-4%) once the
--        leaves became plpgsql — not worth restructuring a function that 975
--        policies depend on.
-- =====================================================================

CREATE OR REPLACE FUNCTION iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
declare
  v_schema text;
  v_table text;
  v_uid uuid := p_user_id;
  v_vis platform.visibility;
  v_owner uuid;
  v_org uuid;
  v_found boolean;
  v_parent_id uuid;
  v_parent_include_public boolean;
  rec record;
  v_attrs record;
  v_is_org_admin boolean;
begin
  if v_uid is null then return false; end if;

  select et.schema_name, et.table_name into v_schema, v_table
  from platform.entity_types et
  where et.token = p_type and et.is_active;
  if v_schema is null then return false; end if;

  if p_type = 'data_store'
     and p_required = 'viewer'::public.permission_level
     and public.user_can_read_data_store_via_grant(v_uid, p_id)
  then return true; end if;

  -- Assigned as an expression rather than `select * into ... from f(...)`:
  -- same function, same arguments, same values -- but plpgsql's simple-expression
  -- path instead of a full SPI query per call (measured -246 ms over 6,567 rows).
  v_attrs := platform.entity_row_access_attrs(v_schema, v_table, p_id);
  v_vis := v_attrs.o_vis; v_owner := v_attrs.o_owner;
  v_org := v_attrs.o_org; v_found := v_attrs.o_found;
  if not coalesce(v_found, false) then return false; end if;

  if v_owner = v_uid then return true; end if;
  -- `is_org_admin_for(v_uid, v_org)` is asked TWICE in this function with the
  -- identical arguments (here, and again in the org-visibility lane below).
  -- Memoized LAZILY, so it is still only ever evaluated when a guard that
  -- would have called it anyway is satisfied. Same predicate, same result.
  if p_required = 'viewer'::public.permission_level
     and v_org is not null
  then
    if v_is_org_admin is null then
      v_is_org_admin := public.is_org_admin_for(v_uid, v_org);
    end if;
    if v_is_org_admin then return true; end if;
  end if;
  if p_include_public
     and v_vis = 'public'::platform.visibility
     and p_required = 'viewer'::public.permission_level
  then return true; end if;
  if p_include_public
     and p_required = 'viewer'::public.permission_level
     and v_vis >= 'internal'::platform.visibility
     and v_org is not null
     and v_org in (select organization_id from iam.system_orgs where global_readable)
  then return true; end if;
  if v_org is not null
     and v_org in (select organization_id from iam.system_orgs where global_readable)
     and public.is_super_admin_for(v_uid)
  then return true; end if;
  if public.has_permission_for(v_uid, p_type, p_id, p_required) then return true; end if;
  if exists (
    select 1
    from iam.memberships m
    join iam.membership_grant g
      on g.member_role = m.role
     and g.container_type in (p_type, '*')
    where m.container_type = p_type
      and m.container_id = p_id
      and m.user_id = v_uid
      and m.deleted_at is null
      and g.confers >= p_required
  ) then return true; end if;
  if p_required = 'viewer'::public.permission_level
     and public._edu_can_read_via_assignment(v_uid, p_type, p_id)
  then return true; end if;

  -- Association conveyance also preserves the caller's public-lane posture.
  for rec in
    select r.container_type, r.container_id
    from platform.reachability r
    where r.item_type = p_type
      and r.item_id = p_id
      and r.max_level >= p_required
  loop
    if (rec.container_type, rec.container_id) is distinct from (p_type, p_id)
       and iam.has_access_for_base(
         v_uid, rec.container_type, rec.container_id, p_required,
         p_include_public and (v_vis is null or v_vis = 'public'::platform.visibility)
       )
    then return true; end if;
  end loop;

  if v_vis >= 'internal'::platform.visibility and v_org is not null then
    if v_is_org_admin is null then
      v_is_org_admin := public.is_org_admin_for(v_uid, v_org);
    end if;
    if v_is_org_admin then return true; end if;
    if p_required <= 'editor'::public.permission_level
       and iam.has_org_access_for(v_uid, v_org)
    then return true; end if;
  end if;

  -- A row with its own non-public visibility is a visibility boundary.
  v_parent_include_public :=
    p_include_public and (v_vis is null or v_vis = 'public'::platform.visibility);

  for rec in
    select er.parent_type, er.fk_column
    from platform.entity_relationships er
    where er.child_type = p_type
      and er.kind in ('composition', 'containment')
    order by er.kind, er.parent_type, er.fk_column
  loop
    execute format(
      'select %I from %I.%I where id = $1',
      rec.fk_column, v_schema, v_table
    ) into v_parent_id using p_id;
    if v_parent_id is not null
       and iam.has_access_for_base(
         v_uid, rec.parent_type, v_parent_id, p_required, v_parent_include_public
       )
    then return true; end if;
  end loop;

  return false;
end;
$function$;
