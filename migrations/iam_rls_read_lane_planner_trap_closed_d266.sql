-- ─────────────────────────────────────────────────────────────────────────────
-- D266 CLOSED — THE READ LANE HANDED THE ACCESS WALK TO THE PLANNER ON 306 TABLES,
-- AND THE GENERATOR NOW REFUSES TO BE PUT BACK THAT WAY.
--
-- Live incident 2026-09-12 02:05 UTC: a PDF surface hydrated its file chips and
-- ~30 `select … from files.files where id = $1` primary-key reads died in the
-- same two seconds with SQLSTATE 57014 under the `authenticated` role's 8s cap.
-- Measured as the affected user, in a rolled-back transaction, before this file:
--
--     files.files, one row by primary key:
--         Planning Time   1,288.8 ms
--         Execution Time      1.6 ms
--
-- 800× more time planning than executing an index scan on the primary key. That
-- is the §6d planner trap (db-rules FEATURE.md §6d): `unnest` carries a planner
-- support function (array_unnest_support) and `= ANY (array)` is costed by
-- scalararraysel; both call estimate_expression_value(), which const-folds
-- STABLE functions to size the set — so Postgres EXECUTES the SECURITY DEFINER
-- access walk `iam.accessible_entity_ids(...)` while PLANNING every statement
-- against the table, before a single row is read and whether or not the arm is
-- ever needed (for a row's own owner it never is). Twenty concurrent chip reads
-- each paying ~1.3 s of CPU on a shared box is exactly how 1.3 s becomes 8 s.
--
-- HOW IT CAME BACK. Both trapped forms were already fixed once, at the emitter:
--   * iam_rls_stop_planner_evaluating_accessible_entity_ids.sql (2026-08-24)
--     patched `select unnest(iam.accessible_entity_ids(` in both generators;
--   * iam_rls_close_scalararraysel_planner_evaluation.sql (2026-08-24) patched
--     the four `= any(iam.accessible_entity_ids(` crawl arms.
-- Then 20260829083724_shared_knowledge_open_library_rls_alignment.sql did a
-- wholesale `CREATE OR REPLACE FUNCTION iam.entity_read_expr` from a stale file
-- copy of the generator. It carried the pre-fix text of all eight sites back in
-- (and, as common-docs/log.md already records, dropped the component variant
-- guard from the file too). It re-applied only two tables — rag.data_stores and
-- files.files — so files.files became the ONE entity table carrying the trap
-- again, and every component table generated since inherits it. Filed as D266
-- on 2026-08-26 at 251 policies, 303 on 2026-09-08, 306 today.
--
-- The lesson is general and this file enforces it: A GENERATOR IS PATCHED FROM
-- THE CATALOG, NEVER REPLACED FROM A FILE. Every prior fix to it is invisible to
-- a file copy. So (a) this migration patches pg_get_functiondef() output in
-- place, transcribing nothing, and (b) it adds an ERROR lane to
-- platform._ddl_guard(): any future CREATE FUNCTION of iam.entity_read_expr or
-- iam._apply_rls_unchecked whose body emits either trapped form is REFUSED at
-- DDL time, with the remedy in the error. The lane is proven RED then GREEN
-- below, inside this transaction, by executing the old trapped body and
-- requiring the refusal.
--
-- A SECOND LATENT GENERATOR DEFECT, found by the dry run and closed here too.
-- The 2026-08-29 rewrite also added a "SECURITY DEFINER candidate superset"
-- lane — `id in (select iam.unnest_uuids(iam.accessible_entity_ids(<token>…)))`
-- — to the id-producing candidate set of EVERY variant, including `component`.
-- On an entity table that is what makes library grants readable and it is
-- already live on files.files. On a COMPONENT it is the 2026-08-13 class by
-- name: db-rules §6d, verbatim — "Component SELECT resolves its composition
-- PARENT IDs and filters on the child FKs — never call `accessible_entity_ids`
-- on the child token. The child-id form materialized 12.9M
-- seo.search_performance_daily UUIDs before returning one page and timed out
-- every authenticated read." No live component policy carries that lane (none
-- has been regenerated since 08-29), so regenerating 305 of them through the
-- generator as it stands would have installed it on all of them, including
-- seo.search_performance_daily. This file guards that lane on
-- `p_variant <> 'component'`, so a component's candidate set stays exactly what
-- was proven on 2026-08-26 (0 lost / 0 gained over 250,434 rows).
--
-- THE FIX, in the generator and nowhere else:
--     <fk> in (select iam.unnest_uuids(iam.accessible_entity_ids(…)))
-- for all eight sites. `iam.unnest_uuids(uuid[]) RETURNS SETOF uuid` is
-- `select unnest($1)` with NO support function, so the planner cannot reach
-- inside it. `x = ANY(arr)` ⇔ `x IN (SELECT unnest(arr))` in a boolean filter,
-- so semantics are byte-identical on every row; the policy text still names the
-- token and the walk verbatim, so `iam.verify_canonical`'s composition-parent
-- proof and the read-kernel fingerprint are untouched. Then every table whose
-- policies carry the old form is re-run through `iam.apply_rls` — the generator
-- is the only writer; hand-editing 306 policies would be undone by the next
-- apply.
--
-- PROOF, inside this transaction, or nothing commits:
--   0. the read-kernel fingerprint matches before AND after (the mirror is not
--      one of the 16 kernel functions; on a mismatch entity_read_expr emits an
--      UNBOUNDED has_access lane, and we refuse to regenerate 306 tables on that);
--   1. the DDL-guard lane refuses the OLD trapped generator body (RED) and
--      accepts the fixed one (GREEN);
--   2. every one of the eight emitter sites and the superset lane was actually
--      rewritten — a count that is not exactly what this file expects stops it;
--   3. neither generator still emits a trapped form;
--   4. every affected table regenerated — no silent skips, no named exceptions
--      (none of the D265 tables carries the trap);
--   5. for EVERY policy on EVERY affected table the regenerated expression is
--      byte-identical to the old one after the mechanical substitution
--      (deparse renames the SELECT alias with the function; that is normalised
--      too) and, for the four `= ANY` arms, the equivalent `IN (SELECT …)`
--      shape. Anything else moved → EXCEPTION. Untouched policies (write lanes,
--      admin, anon, service) must be byte-identical, full stop. No policy may
--      appear or disappear;
--   6. no live policy on any table carries either trapped form afterwards;
--   7. iam.entity_read_lane_preflight() reports nothing a client role cannot
--      EXECUTE (the 0478 total-lockout class);
--   8. `iam.verify_canonical` FAIL counts do not rise on any affected table
--      (60 pre-existing FAILs across the 306 tables are base-column/trigger
--      findings unrelated to RLS — carried, not created, by this change);
--   9. the ONE permitted narrowing — the 11 components created after 08-29 lose
--      the forbidden self-token lane — is re-proven per real identity over the
--      whole table: 0 lost / 0 gained, or nothing commits.
--
-- Guard: `pnpm check:db-guards` — its "RLS planner traps" detector reported all
-- 306 policies RED before this migration and must report zero after. Nothing in
-- this file adds an allowlist, a baseline, or an exception to that detector.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. PRECONDITION: the mirror must be current before we regenerate from it ──
DO $pre$
BEGIN
  IF iam.entity_read_kernel_fingerprint() IS DISTINCT FROM iam.entity_read_kernel_expected() THEN
    RAISE EXCEPTION
      'read-kernel fingerprint moved (live %, expected %): iam.entity_read_expr would emit UNBOUNDED policies. Re-prove the mirror first (aidream scripts/_verify_entity_read_equivalence.py) — refusing to regenerate 306 read policies on a stale mirror.',
      iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  END IF;
END
$pre$;

-- ── 1. SNAPSHOT every policy on every affected table, for the byte-level proof ──
CREATE TEMP TABLE _d266_before ON COMMIT DROP AS
SELECT p.schemaname, p.tablename, p.policyname, p.cmd, p.roles::text AS roles,
       p.permissive, p.qual, p.with_check, et.token, et.rls_variant
FROM pg_policies p
LEFT JOIN platform.entity_types et
  ON et.schema_name = p.schemaname AND et.table_name = p.tablename AND et.is_active
WHERE (p.schemaname, p.tablename) IN (
  SELECT DISTINCT t.schemaname, t.tablename
  FROM pg_policies t
  WHERE coalesce(t.qual,'') || coalesce(t.with_check,'') ~ '(^|[^_a-z.])unnest\(iam\.accessible_entity_ids\('
     OR coalesce(t.qual,'') || coalesce(t.with_check,'') ~ 'ANY \(iam\.accessible_entity_ids\('
);

DO $snap$
DECLARE v_tables int; v_policies int; v_trapped int; v_bad text;
BEGIN
  SELECT count(DISTINCT (schemaname, tablename)), count(*),
         count(*) FILTER (WHERE coalesce(qual,'') || coalesce(with_check,'') ~ '(^|[^_a-z.])unnest\(iam\.accessible_entity_ids\('
                             OR coalesce(qual,'') || coalesce(with_check,'') ~ 'ANY \(iam\.accessible_entity_ids\(')
    INTO v_tables, v_policies, v_trapped
  FROM _d266_before;
  RAISE NOTICE 'D266 snapshot: % affected table(s), % policies captured, % of them trapped', v_tables, v_policies, v_trapped;
  IF v_trapped = 0 THEN
    RAISE EXCEPTION 'D266: no trapped policy found — nothing to regenerate; this migration is not the one you want';
  END IF;
  -- Every affected table must be a registered, active, non-machinery entity, or
  -- iam.apply_rls refuses it and the sweep below cannot be complete.
  SELECT string_agg(b.schemaname||'.'||b.tablename, ', ') INTO v_bad
  FROM (SELECT DISTINCT schemaname, tablename FROM _d266_before) b
  LEFT JOIN platform.entity_types et
    ON et.schema_name = b.schemaname AND et.table_name = b.tablename AND et.is_active
  WHERE et.token IS NULL OR coalesce(et.audit_class,'entity') = 'machinery';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'D266: affected table(s) unregistered or machinery — iam.apply_rls cannot regenerate them, handle by hand first: %', v_bad;
  END IF;
END
$snap$;

-- Pre-change conformance baseline per affected table (FAIL rows only).
CREATE TEMP TABLE _d266_fails_before ON COMMIT DROP AS
SELECT et.schema_name, et.table_name, et.token, et.rls_variant,
       (SELECT count(*) FROM iam.verify_canonical(et.schema_name, et.table_name, et.token, et.rls_variant) v
         WHERE v.status = 'FAIL') AS fails
FROM (SELECT DISTINCT schemaname, tablename FROM _d266_before) b
JOIN platform.entity_types et
  ON et.schema_name = b.schemaname AND et.table_name = b.tablename AND et.is_active;

-- The OLD generator body, kept for the guard's RED proof in step 3.
CREATE TEMP TABLE _d266_old_generator ON COMMIT DROP AS
SELECT pg_get_functiondef('iam.entity_read_expr(text,text,text,text)'::regprocedure) AS def;

-- ── 2. THE DDL GUARD LANE — the generator may never be put back this way ──────
-- Patched into platform._ddl_guard() from its own catalog definition (the same
-- rule this file preaches), inserted as ERROR lane (f) directly before the
-- table-only section. The anchor must occur exactly once.
DO $guard$
DECLARE
  v_def  text := pg_get_functiondef('platform._ddl_guard()'::regprocedure);
  v_new  text;
  v_anchor CONSTANT text :=
    E'    IF cmd.command_tag NOT IN (''CREATE TABLE'',''ALTER TABLE'') THEN CONTINUE; END IF;';
  v_lane CONSTANT text := $lane$
    -- ERROR lane (f) [rls_generator_planner_trap]: the RLS read-lane generators may never emit a §6d planner
    -- trap again (D266, 2026-09-12). `unnest(<STABLE fn>)` and `= ANY (<STABLE fn>)`
    -- are const-folded by the planner, which then EXECUTES the SECURITY DEFINER
    -- access walk while planning EVERY statement against the table (files.files:
    -- 1,289 ms planning / 1.6 ms executing a primary-key read → 57014 under load).
    -- Both forms were fixed at the emitter on 2026-08-24 and came back on
    -- 2026-08-29 through a wholesale CREATE OR REPLACE from a stale file copy.
    -- Patch a generator from pg_get_functiondef(); never replace it from a file.
    IF cmd.command_tag = 'CREATE FUNCTION'
       AND (cmd.object_identity LIKE 'iam.entity_read_expr(%'
            OR cmd.object_identity LIKE 'iam._apply_rls_unchecked(%')
       AND EXISTS (
         SELECT 1 FROM pg_proc p WHERE p.oid = cmd.objid
           AND (p.prosrc ~ '(^|[^_a-z.])unnest\s*\(\s*iam\.accessible_entity_ids\s*\('
                OR p.prosrc ~* '=\s*any\s*\(\s*iam\.accessible_entity_ids\s*\(')
       ) THEN
      RAISE EXCEPTION 'ddl_guard: % emits a §6d RLS planner trap (unnest(iam.accessible_entity_ids(…)) or = ANY (iam.accessible_entity_ids(…)))', cmd.object_identity
        USING HINT = 'The planner const-folds STABLE functions inside unnest()/= ANY() and EXECUTES the access walk while planning every statement (D266, files.files 57014 outage 2026-09-12). Emit `<col> in (select iam.unnest_uuids(iam.accessible_entity_ids(…)))`. You are probably re-creating the generator from a file copy: patch the live definition from pg_get_functiondef() instead, so no prior fix is lost. See common-docs/systems/platform/db-rules/FEATURE.md §6d.',
              ERRCODE = 'check_violation';
    END IF;

$lane$;
  v_n int;
BEGIN
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'D266: expected the platform._ddl_guard() anchor line exactly once, found % — re-read the guard before patching it', v_n;
  END IF;
  IF v_def LIKE '%[rls_generator_planner_trap]%' THEN
    RAISE EXCEPTION 'D266: platform._ddl_guard() already carries the rls_generator_planner_trap lane — this file has been applied';
  END IF;
  v_new := replace(v_def, v_anchor, v_lane || v_anchor);
  EXECUTE v_new;
  RAISE NOTICE 'D266: platform._ddl_guard() ERROR lane (f) rls_generator_planner_trap installed';
END
$guard$;

-- ── 3. REWRITE THE EMITTER IN PLACE, from its own catalog definition ──────────
-- Each site is a distinct literal and each must change, or we stop. The guard
-- installed in step 2 sees this CREATE FUNCTION and must let it through (GREEN).
DO $emit$
DECLARE
  v_fn  regprocedure := 'iam.entity_read_expr(text,text,text,text)'::regprocedure;
  v_def text;
  v_new text;
  v_before int;
  v_after  int;
  v_superset_old CONSTANT text := E'  v_cands := array_append(v_cands, format(\n'
    || E'    ''select iam.unnest_uuids(iam.accessible_entity_ids(%L, ''''viewer''''::public.permission_level, 0, true))'',\n'
    || E'    p_token));';
  v_superset_new CONSTANT text := E'  -- D266 (2026-09-12): NEVER on a component. §6d — "Component SELECT resolves\n'
    || E'  -- its composition PARENT IDs and filters on the child FKs — never call\n'
    || E'  -- accessible_entity_ids on the child token" (the 12.9M-UUID\n'
    || E'  -- seo.search_performance_daily class, 2026-08-13). A component''s candidate\n'
    || E'  -- set is exactly what was proven on 2026-08-26.\n'
    || E'  if p_variant <> ''component'' then\n'
    || E'    v_cands := array_append(v_cands, format(\n'
    || E'      ''select iam.unnest_uuids(iam.accessible_entity_ids(%L, ''''viewer''''::public.permission_level, 0, true))'',\n'
    || E'      p_token));\n'
    || E'  end if;';
BEGIN
  v_def := pg_get_functiondef(v_fn);

  -- (a) the four parent-cascade arms: `select unnest(iam.accessible_entity_ids(`
  v_before := (length(v_def) - length(replace(v_def, 'select unnest(iam.accessible_entity_ids(', '')))
              / length('select unnest(iam.accessible_entity_ids(');
  IF v_before <> 4 THEN
    RAISE EXCEPTION 'D266: expected exactly 4 `select unnest(iam.accessible_entity_ids(` emitter sites in iam.entity_read_expr, found % — the generator is not the one this migration was written against; stop and re-read it', v_before;
  END IF;
  v_new := replace(v_def,
    'select unnest(iam.accessible_entity_ids(',
    'select iam.unnest_uuids(iam.accessible_entity_ids(');

  -- (b) the four `= any(...)` crawl arms of the bespoke `file` branch. Each is
  -- rewritten as a full literal (not a bare `= any(` swap) because the IN form
  -- needs one more closing parenthesis than the ANY form.
  v_before := (length(v_new) - length(replace(v_new, ' = any(iam.accessible_entity_ids(', '')))
              / length(' = any(iam.accessible_entity_ids(');
  IF v_before <> 4 THEN
    RAISE EXCEPTION 'D266: expected exactly 4 `= any(iam.accessible_entity_ids(` emitter sites, found %', v_before;
  END IF;
  v_new := replace(v_new,
    $o$ws.id = any(iam.accessible_entity_ids(''web_site'', ''viewer''::public.permission_level, 0, true))$o$,
    $n$ws.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_site'', ''viewer''::public.permission_level, 0, true)))$n$);
  v_new := replace(v_new,
    $o$s.id = any(iam.accessible_entity_ids(''web_snapshot'', ''viewer''::public.permission_level, 0, true))$o$,
    $n$s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_snapshot'', ''viewer''::public.permission_level, 0, true)))$n$);
  v_new := replace(v_new,
    $o$s.id = any(iam.accessible_entity_ids(''web_screenshot'', ''viewer''::public.permission_level, 0, true))$o$,
    $n$s.id in (select iam.unnest_uuids(iam.accessible_entity_ids(''web_screenshot'', ''viewer''::public.permission_level, 0, true)))$n$);
  v_after := (length(v_new) - length(replace(v_new, ' = any(iam.accessible_entity_ids(', '')))
             / length(' = any(iam.accessible_entity_ids(');
  IF v_after <> 0 THEN
    RAISE EXCEPTION 'D266: % `= any(iam.accessible_entity_ids(` site(s) survived the literal rewrite — the emitted text differs from what this migration expects', v_after;
  END IF;

  -- (c) the self-token candidate superset lane: entity/system only.
  v_before := (length(v_new) - length(replace(v_new, v_superset_old, ''))) / length(v_superset_old);
  IF v_before <> 1 THEN
    RAISE EXCEPTION 'D266: expected the candidate-superset lane exactly once in iam.entity_read_expr, found % — re-read the generator', v_before;
  END IF;
  v_new := replace(v_new, v_superset_old, v_superset_new);

  IF v_new IS NOT DISTINCT FROM v_def THEN
    RAISE EXCEPTION 'D266: the emitter did not change';
  END IF;

  EXECUTE v_new;   -- passes the new ddl_guard lane: GREEN
  RAISE NOTICE 'D266: iam.entity_read_expr rewritten — 4 unnest sites + 4 = any sites route through iam.unnest_uuids; superset lane guarded on variant';
END
$emit$;

-- Neither generator may still emit a trapped form (scoped to the generators:
-- iam.component_original_lane reconstructs the pre-D254 lane on purpose, for the
-- prover's `original` baseline, and ordinary RPC bodies that unnest the walk in
-- their own query execute it anyway).
DO $emitcheck$
DECLARE v_left text;
BEGIN
  SELECT string_agg(n.nspname||'.'||p.proname, ', ') INTO v_left
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'iam' AND p.proname IN ('entity_read_expr', '_apply_rls_unchecked')
    AND (p.prosrc ~ '(^|[^_a-z.])unnest\s*\(\s*iam\.accessible_entity_ids\s*\('
      OR p.prosrc ~* '=\s*any\s*\(\s*iam\.accessible_entity_ids\s*\(');
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'D266: generator(s) still emit a planner-evaluated access walk: %', v_left;
  END IF;
END
$emitcheck$;

-- THE GUARD MUST FAIL WHEN IT SHOULD (RED): re-creating the OLD trapped body is
-- refused, and the refusal rolls the attempt back so the fixed body stays live.
DO $red$
DECLARE
  v_old text;
  v_refused boolean := false;
  v_msg text;
BEGIN
  SELECT def INTO v_old FROM _d266_old_generator;
  BEGIN
    EXECUTE v_old;
  EXCEPTION WHEN check_violation THEN
    v_refused := true;
    v_msg := SQLERRM;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'D266: the ddl_guard lane did NOT refuse the old trapped generator body — a guard nobody has seen fail is not a guard';
  END IF;
  IF v_msg NOT LIKE '%planner trap%' THEN
    RAISE EXCEPTION 'D266: the refusal came from somewhere else (%), not the planner-trap lane', v_msg;
  END IF;
  -- and the fixed body is what is live
  IF (SELECT prosrc FROM pg_proc WHERE oid = 'iam.entity_read_expr(text,text,text,text)'::regprocedure)
       ~ '(^|[^_a-z.])unnest\s*\(\s*iam\.accessible_entity_ids\s*\(' THEN
    RAISE EXCEPTION 'D266: the refused CREATE FUNCTION left the trapped body live';
  END IF;
  RAISE NOTICE 'D266: ddl_guard lane (f) proven RED on the old body, GREEN on the fixed body';
END
$red$;

-- ── 4. THE REGENERATION SWEEP — every affected table, no exceptions ───────────
DO $sweep$
DECLARE
  r record;
  v_done int := 0;
  v_failed text[] := '{}';
  v_ok boolean;
  v_last text;
  v_retried int := 0;
BEGIN
  FOR r IN
    SELECT et.token, et.schema_name, et.table_name, et.rls_variant
    FROM (SELECT DISTINCT schemaname, tablename FROM _d266_before) b
    JOIN platform.entity_types et
      ON et.schema_name = b.schemaname AND et.table_name = b.tablename AND et.is_active
    ORDER BY et.schema_name, et.table_name
  LOOP
    -- DROP/CREATE POLICY takes an exclusive lock on the table. The scheduler
    -- writes scheduler.sch_run / sch_trigger continuously, and the rolled-back
    -- dry run of this file deadlocked on exactly those two while every other
    -- table went through. Lock contention is retried, bounded and announced;
    -- any other failure stops the migration on the first attempt.
    v_ok := false;
    FOR attempt IN 1..6 LOOP
      BEGIN
        PERFORM iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
        v_ok := true;
        EXIT;
      EXCEPTION
        WHEN deadlock_detected OR lock_not_available THEN
          v_last := SQLERRM;
          v_retried := v_retried + 1;
          RAISE NOTICE 'D266 regeneration: %.% attempt % hit lock contention (%) — retrying',
            r.schema_name, r.table_name, attempt, v_last;
          PERFORM pg_sleep(0.5 * attempt);
        WHEN OTHERS THEN
          v_last := SQLERRM;
          EXIT;
      END;
    END LOOP;
    IF v_ok THEN
      v_done := v_done + 1;
    ELSE
      v_failed := array_append(v_failed, format('%s.%s (%s/%s): %s',
                                r.schema_name, r.table_name, r.token, r.rls_variant, v_last));
    END IF;
  END LOOP;
  IF v_retried > 0 THEN
    RAISE NOTICE 'D266 regeneration: % lock-contention retries were needed', v_retried;
  END IF;
  RAISE NOTICE 'D266 regeneration: % table(s) regenerated, % failed', v_done, cardinality(v_failed);
  IF cardinality(v_failed) > 0 THEN
    RAISE EXCEPTION 'D266 regeneration failed on % table(s) — nothing is committed: %',
      cardinality(v_failed), array_to_string(v_failed, ' | ');
  END IF;
END
$sweep$;

-- ── 5. THE PROOF ──────────────────────────────────────────────────────────────
-- What the OLD deparsed expression must become under the substitution and
-- nothing else. Session-local; gone with the transaction.
CREATE FUNCTION pg_temp._d266_normalise(p_expr text, p_token text, p_variant text) RETURNS text
LANGUAGE sql IMMUTABLE AS $f$
  SELECT regexp_replace(
           regexp_replace(
             replace(
               -- THE ONE PERMITTED NARROWING, components only: the self-token
               -- candidate-superset lane the 2026-08-29 generator installed on the
               -- 11 components created since. Removing it is what §6d orders, and
               -- step 5g below re-proves it row-for-row against real identities.
               CASE WHEN p_variant = 'component' THEN
                 replace(p_expr,
                   E'( SELECT iam.unnest_uuids(iam.accessible_entity_ids(' || quote_literal(p_token)
                     || E'::text, ''viewer''::permission_level, 0, true)) AS unnest_uuids\nUNION\n SELECT p.resource_id',
                   '( SELECT p.resource_id')
               ELSE p_expr END,
               'unnest(iam.accessible_entity_ids(', 'iam.unnest_uuids(iam.accessible_entity_ids('),
             '(iam\.accessible_entity_ids\([^()]*\)\)) AS unnest\)', '\1 AS unnest_uuids)', 'g'),
           '(\w+\.\w+) = ANY \(iam\.accessible_entity_ids\(([^()]*)\)\)',
           '\1 IN ( SELECT iam.unnest_uuids(iam.accessible_entity_ids(\2)) AS unnest_uuids)', 'g')
$f$;

DO $proof$
DECLARE
  r record;
  v_qual text;
  v_wc   text;
  v_bad text[] := '{}';
  v_checked int := 0;
  v_still_trapped int;
  v_extra int;
  v_blocked text;
BEGIN
  -- 5a. Every snapshotted policy still exists with the same command, roles and
  --     permissiveness, and its expressions equal the normalised old ones.
  FOR r IN SELECT * FROM _d266_before ORDER BY schemaname, tablename, policyname LOOP
    SELECT p.qual, p.with_check INTO v_qual, v_wc
    FROM pg_policies p
    WHERE p.schemaname = r.schemaname AND p.tablename = r.tablename AND p.policyname = r.policyname
      AND p.cmd = r.cmd AND p.roles::text = r.roles AND p.permissive = r.permissive;
    IF NOT FOUND THEN
      v_bad := array_append(v_bad, format('%s.%s/%s: policy missing or its cmd/roles/permissive changed', r.schemaname, r.tablename, r.policyname));
      CONTINUE;
    END IF;
    IF pg_temp._d266_normalise(r.qual, r.token, r.rls_variant) IS DISTINCT FROM v_qual THEN
      v_bad := array_append(v_bad, format('%s.%s/%s USING differs beyond the substitution', r.schemaname, r.tablename, r.policyname));
    END IF;
    IF pg_temp._d266_normalise(r.with_check, r.token, r.rls_variant) IS DISTINCT FROM v_wc THEN
      v_bad := array_append(v_bad, format('%s.%s/%s WITH CHECK differs beyond the substitution', r.schemaname, r.tablename, r.policyname));
    END IF;
    v_checked := v_checked + 1;
  END LOOP;

  -- 5b. No policy appeared on an affected table either.
  SELECT count(*) INTO v_extra
  FROM pg_policies p
  WHERE (p.schemaname, p.tablename) IN (SELECT DISTINCT schemaname, tablename FROM _d266_before)
    AND NOT EXISTS (SELECT 1 FROM _d266_before b
                     WHERE b.schemaname = p.schemaname AND b.tablename = p.tablename AND b.policyname = p.policyname);
  IF v_extra > 0 THEN
    v_bad := array_append(v_bad, format('%s policy(ies) appeared on affected tables that were not there before', v_extra));
  END IF;

  IF cardinality(v_bad) > 0 THEN
    RAISE EXCEPTION 'D266 proof FAILED on % policy(ies) — rolling back: %', cardinality(v_bad),
      array_to_string(v_bad[1:20], ' | ');
  END IF;
  RAISE NOTICE 'D266 proof: % policies byte-identical modulo the planner-safe substitution', v_checked;

  -- 5c. No live policy anywhere carries either trapped form.
  SELECT count(*) INTO v_still_trapped
  FROM pg_policies p
  WHERE coalesce(p.qual,'') || coalesce(p.with_check,'') ~ '(^|[^_a-z.])unnest\(iam\.accessible_entity_ids\('
     OR coalesce(p.qual,'') || coalesce(p.with_check,'') ~ 'ANY \(iam\.accessible_entity_ids\(';
  IF v_still_trapped > 0 THEN
    RAISE EXCEPTION 'D266: % live policy(ies) still hand iam.accessible_entity_ids to the planner', v_still_trapped;
  END IF;

  -- 5d. The fingerprint did not move (the mirror is not a kernel function).
  IF iam.entity_read_kernel_fingerprint() IS DISTINCT FROM iam.entity_read_kernel_expected() THEN
    RAISE EXCEPTION 'D266: read-kernel fingerprint moved — this migration touches the mirror only and must not move it';
  END IF;

  -- 5e. Reachability: nothing the regenerated lane calls is un-EXECUTE-able by a
  --     client role (aidream migration 0479 — the total-lockout class).
  SELECT string_agg(role_name||' -> '||function_signature, ', ') INTO v_blocked
  FROM iam.entity_read_lane_preflight();
  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION 'D266: the read lane calls function(s) a client role cannot EXECUTE — every regenerated table would be locked: %', v_blocked;
  END IF;

  -- 5f. Conformance did not regress on any affected table.
  IF EXISTS (
    SELECT 1 FROM _d266_fails_before b
    WHERE (SELECT count(*) FROM iam.verify_canonical(b.schema_name, b.table_name, b.token, b.rls_variant) v
            WHERE v.status = 'FAIL') > b.fails
  ) THEN
    RAISE EXCEPTION 'D266: iam.verify_canonical FAIL count ROSE on: %',
      (SELECT string_agg(b.schema_name||'.'||b.table_name, ', ') FROM _d266_fails_before b
        WHERE (SELECT count(*) FROM iam.verify_canonical(b.schema_name, b.table_name, b.token, b.rls_variant) v
                WHERE v.status = 'FAIL') > b.fails);
  END IF;

  RAISE NOTICE 'D266: CLOSED — 306 read policies regenerated planner-safe, generator guarded, proofs 0..8 green';
END
$proof$;

-- ── 5g. THE NARROWED COMPONENTS LOSE NOTHING — proven against real identities ──
-- For every component whose OLD std_select carried the self-token superset lane,
-- compare the OLD deployed expression (as the baseline) with what the fixed
-- generator now emits, per probe user (iam.entity_read_probe_users: real
-- non-admin members) plus the platform admin, over the WHOLE table. `lost` is a
-- denial and `gained` is a leak; a narrowing must show 0 of each. Measured in
-- the rolled-back rehearsal of this file: 11 tables × 9 identities × 5,247 rows,
-- 0 lost / 0 gained, and zero rows in iam.permissions / iam.memberships /
-- platform.reachability / platform.associations_live / platform.entity_grants
-- keyed on any of the 11 tokens — the removed lane could never have admitted a
-- row the remaining lanes do not.
DO $narrow$
DECLARE
  r record;
  u record;
  v_lost bigint; v_gained bigint; v_compared bigint;
  v_tables int := 0; v_pairs int := 0; v_rows bigint := 0;
  v_bad text[] := '{}';
BEGIN
  FOR r IN
    SELECT b.schemaname, b.tablename, b.token, b.qual
    FROM _d266_before b
    WHERE b.policyname = 'std_select' AND b.rls_variant = 'component'
      AND b.qual LIKE '%( SELECT iam.unnest_uuids(iam.accessible_entity_ids(' || quote_literal(b.token) || '::text%'
    ORDER BY 1, 2
  LOOP
    v_tables := v_tables + 1;
    FOR u IN
      SELECT user_id FROM iam.entity_read_probe_users(8)
      UNION (SELECT a.user_id FROM public.current_user_is_admin a WHERE a.is_admin IS TRUE ORDER BY a.user_id LIMIT 1)
    LOOP
      SELECT lost, gained, compared INTO v_lost, v_gained, v_compared
      FROM iam.entity_read_equivalence(r.schemaname, r.tablename, r.token, u.user_id, NULL, r.qual);
      v_pairs := v_pairs + 1; v_rows := greatest(v_rows, v_compared);
      IF v_lost <> 0 OR v_gained <> 0 THEN
        v_bad := array_append(v_bad, format('%s.%s user %s: lost %s gained %s of %s',
                              r.schemaname, r.tablename, u.user_id, v_lost, v_gained, v_compared));
      END IF;
    END LOOP;
  END LOOP;
  IF cardinality(v_bad) > 0 THEN
    RAISE EXCEPTION 'D266: removing the self-token lane from a component CHANGED its row set — rolling back: %',
      array_to_string(v_bad, ' | ');
  END IF;
  -- iam.entity_read_equivalence sets request.jwt.claims transaction-locally to
  -- impersonate each identity; clear it so nothing after this block (the
  -- applier's ledger write included) runs as the last probe user.
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'D266 narrowing proof: % component table(s), % (table, identity) pairs, 0 lost / 0 gained', v_tables, v_pairs;
END
$narrow$;
