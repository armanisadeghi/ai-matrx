-- rls_curator_lane_definer_door_no_self_reference.sql
--
-- LIVE OUTAGE, 2026-09-12 11:10:40Z → : every signed-in read of
-- `platform.rulebook` returned HTTP 500 from PostgREST with
--
--     42P17  infinite recursion detected in policy for relation "rulebook"
--
-- and `seo.starter_pack` carried the identical shape, one regeneration away
-- from the same 500.
--
-- WHAT BROKE
-- ----------
-- `iam.entity_read_expr` — the mirror that builds every generated `std_select`
-- body — emitted the two industry-curator lanes as CANDIDATE SETS that read the
-- policy's own table:
--
--     select rb.id from platform.rulebook rb
--       join iam.industry_curators ic on ic.industry_id = rb.industry_id
--      where ic.user_id = (select auth.uid()) and rb.deleted_at is null
--
-- A SELECT policy on `platform.rulebook` whose USING clause selects from
-- `platform.rulebook` re-enters its own policy. Postgres detects it and refuses
-- the whole statement. There is no partial failure: the table is simply
-- unreadable by every non-superuser role.
--
-- WHY IT DID NOT RECUR BEFORE TODAY
-- ---------------------------------
-- The self-referencing lane has been in the generator since
-- `20260829083724_shared_knowledge_open_library_rls_alignment.sql`
-- (2026-08-29), carried forward unchanged through
-- `component_read_lane_no_created_by.sql` and
-- `hr_p3_privacy_wall_entity_read_expr.sql`. It was inert the whole time
-- because NEITHER table's policies had been regenerated since: their live
-- `std_select` still came from the older generation, whose curator lane went
-- through the SECURITY DEFINER door `public.is_rulebook_curator(...)` inside
-- `iam.has_access_for_base` and therefore never re-entered the policy.
--
-- `iam_admin_lane_honours_personal_visibility_dd136.sql` step 7 regenerated
-- EVERY registered table through `iam.apply_rls`. That is when the latent lane
-- was first written into a live policy, on both tables at once. It was not
-- restored verbatim by step 7b — 7b only restores policies `apply_rls` deleted
-- and did not recreate — it was EMITTED, by the generator, exactly as coded.
--
-- So this is a generator defect with two current victims, not a DD-136 defect:
-- any future `iam.apply_rls` run on either table reproduces it.
--
-- THE FIX — THE CLASS, NOT THE INSTANCE
-- -------------------------------------
-- 1. The curator lanes become SUFFICIENT ARMS that call the SECURITY DEFINER
--    doors the access kernel itself calls:
--
--      iam.has_access_for_base:
--        if p_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, p_id)
--          then return true; end if;
--        if p_type = 'rulebook' and public.is_rulebook_curator(v_uid, p_id) then
--          if p_required = 'viewer' then return true; end if; ...
--
--    Both doors are `STABLE SECURITY DEFINER` with a pinned `search_path`, so
--    the join against the entity table runs as the function owner with RLS off
--    — no re-entry, and the arm is EXACTLY the kernel's viewer lane, so nobody
--    gains or loses a row. (Measured live: 29 rulebooks, 7 starter packs, 1
--    curator row — the per-row definer call is free at this size, and it is the
--    same call the unbounded `iam.has_access` arm would make anyway.)
--
-- 2. The generator can no longer hand out a self-reading expression for ANY
--    table, token or variant. A candidate lane that reads the policy's own
--    relation makes the function DROP THE BOUND and emit the unbounded
--    `iam.has_access` lane — the same correct-but-slow degradation it already
--    takes for a stale kernel fingerprint — with a WARNING naming the lane; an
--    ARM that does it raises, because an arm has no safe degradation. This is a
--    class, not two tokens: `iam.memberships` (token `membership`) carries the
--    same latent shape through the membership candidate and would have gone
--    down on its next regeneration.
--
-- 3. Both victims are regenerated through `iam.apply_rls`, the ONE canonical
--    path, with the bespoke policies `apply_rls` deletes restored verbatim from
--    a pre-sweep snapshot (the same shape as DD-136 step 7b).
--
-- Guard in the repo: `pnpm check:rls-self-reference` (scripts/check-rls-self-reference.ts),
-- wired into `pnpm check:release-gates`. It fails when ANY live policy's
-- `qual`/`with_check` reads the relation the policy is attached to.
--
-- Nothing here touches `iam.has_access_for_base` or anything under `admin.*`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE MIRROR — patched from its own live catalog definition, the way DD-136
--    patched it. Re-typing a 400-line generator to change two lanes is how an
--    unrelated arm goes missing; anchored substitution cannot lose one. Every
--    anchor must occur EXACTLY ONCE or this migration refuses to run.
-- ─────────────────────────────────────────────────────────────────────────────
DO $patch$
DECLARE
  v_def text := pg_get_functiondef('iam.entity_read_expr(text,text,text,text)'::regprocedure);

  -- (a) the self-referencing curator candidate sets
  v_old_cur text := $old$  -- Curator lanes, token-specific and table-driven.
  if p_token = 'rulebook' then
    v_cands := array_append(v_cands,
      'select rb.id from platform.rulebook rb join iam.industry_curators ic'
      ' on ic.industry_id = rb.industry_id and ic.deleted_at is null'
      ' where ic.user_id = (select auth.uid()) and rb.deleted_at is null');
  end if;
  if p_token = 'seo_starter_pack' then
    v_cands := array_append(v_cands,
      'select sp.id from seo.starter_pack sp join iam.industry_curators ic'
      ' on ic.industry_id = sp.industry_id and ic.deleted_at is null'
      ' where ic.user_id = (select auth.uid())');
  end if;
$old$;
  v_new_cur text := $new$  -- ── THE CURATOR LANES ─────────────────────────────────────────────────────
  -- 🚨 A CANDIDATE SET MAY NEVER READ THE POLICY'S OWN TABLE. These two lanes
  -- used to be emitted as `select rb.id from platform.rulebook rb join
  -- iam.industry_curators ...`, i.e. a SELECT policy on platform.rulebook whose
  -- USING clause selects from platform.rulebook. Postgres answers that with
  -- `42P17 infinite recursion detected in policy for relation "rulebook"` and
  -- the table becomes unreadable for every non-superuser role — measured live
  -- 2026-09-12, every signed-in GET 500 from 11:10:40Z, the moment DD-136's
  -- step 7 first regenerated the table through this generator.
  --
  -- The kernel's own curator lane is a SECURITY DEFINER door:
  --     if p_type = 'rulebook' and public.is_rulebook_curator(v_uid, p_id) then
  --       if p_required = 'viewer' then return true; end if; ...
  --     if p_type = 'seo_starter_pack' and public.is_pack_curator(v_uid, p_id)
  --       then return true; end if;
  -- so the arm below is that same viewer lane, evaluated the same way, outside
  -- RLS and therefore outside the recursion. It is a SUFFICIENT arm rather than
  -- a candidate set because a boolean door cannot produce an id set, and it
  -- needs no `iam.has_access` confirmation: the kernel grants exactly this.
  if p_token = 'rulebook' then
    v_arms := array_append(v_arms,
      'public.is_rulebook_curator((select auth.uid()), id)');
  end if;
  if p_token = 'seo_starter_pack' then
    v_arms := array_append(v_arms,
      'public.is_pack_curator((select auth.uid()), id)');
  end if;
$new$;

  -- (b) declaration slots for the candidate filter and the assembled expression
  v_old_decl text := $old$  v_owner_col text;
$old$;
  v_new_decl text := $new$  v_owner_col text;
  v_cand text;
  v_expr text;
  v_selfref text;
$new$;

  -- (c) THE CANDIDATE FILTER — appended to the existing stale-mirror bail-out,
  --     which is where this function already degrades to correct-and-slow.
  v_old_filt text := $old$  if v_stale then
    v_cands := '{}';   -- stale mirror: never bound the definer call
  end if;
$old$;
  v_new_filt text := $new$  if v_stale then
    v_cands := '{}';   -- stale mirror: never bound the definer call
  end if;

  -- 🚨 NO CANDIDATE SET MAY READ THE POLICY'S OWN TABLE (2026-09-12).
  -- A SELECT policy whose USING clause selects from its own relation raises
  -- `42P17 infinite recursion detected in policy for relation "..."` and the
  -- table becomes unreadable for every non-superuser role — not slow, not
  -- subtly wrong: 500 on every read. The industry-curator lane was exactly that
  -- for 14 days and went live the moment DD-136 regenerated the table.
  -- `iam.memberships` carries the same latent shape through the membership
  -- candidate (`select m.container_id from iam.memberships m ...`, token
  -- `membership`), so this is a CLASS, not two tokens.
  --
  -- The safe direction is the one this function already takes for a stale
  -- kernel fingerprint and for an unknown bespoke resolver: DROP THE BOUND and
  -- emit the unbounded `iam.has_access` lane. Correct, slower, and it can never
  -- deny a row — the opposite of silently omitting the offending lane, which
  -- WOULD deny rows. It screams so the lane gets a SECURITY DEFINER door of its
  -- own (see the curator lanes above) rather than living on as a slow path.
  v_selfref := '(from|join)[[:space:]]*\(?[[:space:]]*(' || p_schema || '\.)?'
               || p_table || '([^a-z0-9_]|$)';
  if cardinality(v_cands) > 0 then
    foreach v_cand in array v_cands loop
      if v_cand ~* v_selfref then
        raise warning 'entity_read_expr: a candidate lane for %.% READS THAT TABLE '
          'ITSELF (the 42P17 class). Dropping the bound and emitting an unbounded '
          'iam.has_access lane for %.% — correct but slow. Give the lane a SECURITY '
          'DEFINER door instead. Lane: %', p_schema, p_table, p_schema, p_table, v_cand;
        v_cands := '{}';
        exit;
      end if;
    end loop;
  end if;
$new$;

  -- (d) the return, now asserted
  v_old_ret text := $old$  return array_to_string(v_arms, ' or ');
end;
$old$;
  v_new_ret text := $new$  v_expr := array_to_string(v_arms, ' or ');

  -- 🚨 THE LAST WALL. The candidate filter above degrades safely, so anything
  -- still reading the table here is an ARM — hand-written, with no safe
  -- degradation available and no way to bound it. That is a coding error in
  -- this function, and a coding error that ships makes the table unreadable
  -- (42P17) for everyone. It dies here, at generation time, naming the table,
  -- instead of at 11:10 on a Saturday in every user's browser.
  -- Repo guard: pnpm check:rls-self-reference.
  if v_expr ~* v_selfref then
    raise exception
      'iam.entity_read_expr: an ARM built for %.% (token %, variant %) reads '
      '%.% ITSELF — a policy that selects from its own relation raises 42P17 '
      'and makes the table unreadable. Route the lane through a SECURITY '
      'DEFINER door (see the curator lanes) instead of a join on the entity.',
      p_schema, p_table, p_token, p_variant, p_schema, p_table;
  end if;

  return v_expr;
end;
$new$;

  v_hits int;
BEGIN
  v_hits := (length(v_def) - length(replace(v_def, v_old_cur, ''))) / length(v_old_cur);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'curator-lane anchor occurs % time(s) in iam.entity_read_expr, expected exactly 1 — the generator moved underneath this migration; re-read it before patching', v_hits;
  END IF;
  v_def := replace(v_def, v_old_cur, v_new_cur);

  v_hits := (length(v_def) - length(replace(v_def, v_old_decl, ''))) / length(v_old_decl);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'declaration anchor (v_owner_col) occurs % time(s) in iam.entity_read_expr, expected exactly 1', v_hits;
  END IF;
  v_def := replace(v_def, v_old_decl, v_new_decl);

  v_hits := (length(v_def) - length(replace(v_def, v_old_filt, ''))) / length(v_old_filt);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'stale-mirror anchor occurs % time(s) in iam.entity_read_expr, expected exactly 1', v_hits;
  END IF;
  v_def := replace(v_def, v_old_filt, v_new_filt);

  v_hits := (length(v_def) - length(replace(v_def, v_old_ret, ''))) / length(v_old_ret);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION 'return anchor occurs % time(s) in iam.entity_read_expr, expected exactly 1', v_hits;
  END IF;
  v_def := replace(v_def, v_old_ret, v_new_ret);

  EXECUTE v_def;
  RAISE NOTICE 'iam.entity_read_expr patched — curator lanes go through the SECURITY DEFINER door, and the generator now refuses any self-reading expression';
END
$patch$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PROVE THE GENERATOR, BEFORE ANY POLICY IS TOUCHED.
-- ─────────────────────────────────────────────────────────────────────────────
DO $gencheck$
DECLARE
  v_rb text := iam.entity_read_expr('platform', 'rulebook', 'rulebook', 'entity');
  v_sp text := iam.entity_read_expr('seo', 'starter_pack', 'seo_starter_pack', 'system');
BEGIN
  IF v_rb !~* 'is_rulebook_curator' THEN
    RAISE EXCEPTION 'rulebook expression lost its curator lane';
  END IF;
  IF v_sp !~* 'is_pack_curator' THEN
    RAISE EXCEPTION 'starter_pack expression lost its curator lane';
  END IF;
  IF v_rb ~* '(from|join)[[:space:]]*\(?[[:space:]]*platform\.rulebook' THEN
    RAISE EXCEPTION 'rulebook expression still reads platform.rulebook';
  END IF;
  IF v_sp ~* '(from|join)[[:space:]]*\(?[[:space:]]*seo\.starter_pack' THEN
    RAISE EXCEPTION 'starter_pack expression still reads seo.starter_pack';
  END IF;
  RAISE NOTICE 'generator proved: both curator lanes present, neither expression reads its own table';
END
$gencheck$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. REGENERATE THE TWO VICTIMS through `iam.apply_rls` — the ONE canonical
--    path — restoring any bespoke policy the sweep deletes, verbatim, from a
--    pre-sweep snapshot (DD-136 step 7b's shape, scoped to two tables).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _pre_sweep_policies ON COMMIT DROP AS
SELECT n.nspname                                          AS schema_name,
       c.relname                                          AS table_name,
       pol.polname                                        AS policy_name,
       CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                       WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                       ELSE 'ALL' END                     AS cmd,
       pol.polpermissive                                  AS permissive,
       (SELECT string_agg(quote_ident(r.rolname), ', ')
          FROM pg_roles r WHERE r.oid = ANY (pol.polroles))
                                                          AS roles,
       pg_get_expr(pol.polqual, pol.polrelid)             AS using_expr,
       pg_get_expr(pol.polwithcheck, pol.polrelid)        AS check_expr
FROM pg_policy pol
JOIN pg_class c      ON c.oid = pol.polrelid
JOIN pg_namespace n  ON n.oid = c.relnamespace
WHERE (n.nspname = 'platform' AND c.relname = 'rulebook')
   OR (n.nspname = 'seo'      AND c.relname = 'starter_pack');

DO $regen$
DECLARE
  r        record;
  v_missing record;
  v_sql    text;
  v_restored text[] := '{}';
BEGIN
  FOR r IN
    SELECT et.schema_name, et.table_name, et.token, et.rls_variant
    FROM platform.entity_types et
    WHERE (et.schema_name = 'platform' AND et.table_name = 'rulebook')
       OR (et.schema_name = 'seo'      AND et.table_name = 'starter_pack')
  LOOP
    PERFORM iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
    RAISE NOTICE 'regenerated %.% (token %, variant %)', r.schema_name, r.table_name, r.token, r.rls_variant;
  END LOOP;

  FOR v_missing IN
    SELECT p.*
    FROM _pre_sweep_policies p
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_policy pol
      JOIN pg_class c     ON c.oid = pol.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = p.schema_name AND c.relname = p.table_name
        AND pol.polname = p.policy_name)
  LOOP
    v_sql := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
                    v_missing.policy_name, v_missing.schema_name, v_missing.table_name,
                    CASE WHEN v_missing.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                    v_missing.cmd,
                    coalesce(v_missing.roles, 'PUBLIC'));
    IF v_missing.using_expr IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_missing.using_expr);
    END IF;
    IF v_missing.check_expr IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_missing.check_expr);
    END IF;
    EXECUTE v_sql;
    v_restored := array_append(v_restored, v_missing.schema_name||'.'||v_missing.table_name||'.'||v_missing.policy_name);
  END LOOP;

  IF cardinality(v_restored) > 0 THEN
    RAISE WARNING 'iam.apply_rls DELETED % bespoke policy/policies while regenerating; restored verbatim from the pre-sweep snapshot: %',
      cardinality(v_restored), array_to_string(v_restored, ', ');
  ELSE
    RAISE NOTICE 'no bespoke policies were deleted by the regeneration';
  END IF;
END
$regen$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. THE ACCEPTANCE — live, on the policies that now exist.
-- ─────────────────────────────────────────────────────────────────────────────
DO $accept$
DECLARE
  v_bad text;
BEGIN
  -- 4a. NO POLICY ANYWHERE IN THE DATABASE READS ITS OWN RELATION.
  SELECT string_agg(x.sig, ', ')
    INTO v_bad
  FROM (
    SELECT n.nspname||'.'||c.relname||'.'||pol.polname AS sig
    FROM pg_policy pol
    JOIN pg_class c     ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
          ~* ('(from|join)[[:space:]]*\(?[[:space:]]*(' || n.nspname || '\.)?'
              || c.relname || '([^a-z0-9_]|$)')
  ) x;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'policies still read their own relation (42P17 class): %', v_bad;
  END IF;

  -- 4b. The curator lane survived the regeneration, through the definer door.
  PERFORM 1 FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='platform' AND c.relname='rulebook' AND pol.polname='std_select'
    AND pg_get_expr(pol.polqual, pol.polrelid) ~* 'is_rulebook_curator';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform.rulebook std_select lost its curator lane';
  END IF;

  PERFORM 1 FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='seo' AND c.relname='starter_pack' AND pol.polname='std_select'
    AND pg_get_expr(pol.polqual, pol.polrelid) ~* 'is_pack_curator';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo.starter_pack std_select lost its curator lane';
  END IF;

  -- 4c. Both tables still certify canonical.
  IF NOT iam.canonical_certify_ok('platform', 'rulebook', 'rulebook') THEN
    RAISE EXCEPTION 'platform.rulebook no longer certifies canonical';
  END IF;
  IF NOT iam.canonical_certify_ok('seo', 'starter_pack', 'seo_starter_pack') THEN
    RAISE EXCEPTION 'seo.starter_pack no longer certifies canonical';
  END IF;

  RAISE NOTICE 'acceptance passed: no self-referencing policy in the database, both curator lanes intact, both tables certify canonical';
END
$accept$;
