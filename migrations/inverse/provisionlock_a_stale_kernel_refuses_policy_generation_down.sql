-- chair-step: inverse of migrations/campaign/provisionlock_a_stale_kernel_refuses_policy_generation.sql (lane PROVISION-LOCK): restores iam.apply_rls byte-for-byte from production as of 2026-09-27 and removes the rule row.
-- lane: PROVISION-LOCK
-- based-on: iam.apply_rls(text, text, text, text) b3034a7ada5c201ea2fa9ebba7a06898d9b155dca877082a948fc0145d391d73

CREATE OR REPLACE FUNCTION iam.apply_rls(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_registered_schema text;
  v_registered_table text;
  v_audit_class text;
  -- DD-147 drift guard: what the table carried before the emit, and what appeared that this
  -- generator does not claim to author.
  v_tbl regclass;
  v_before text[];
  v_stray text[];
  -- DD-249: how many rows say `public` on a table whose class grants no anon lane.
  v_public_rows bigint;
  -- R12: whether `anon` actually holds a key to this table — table-level, column-level,
  -- granted to PUBLIC or inherited. One built-in answers all four.
  v_anon_has_key boolean;
BEGIN
  SELECT et.schema_name, et.table_name, coalesce(et.audit_class, 'entity')
    INTO v_registered_schema, v_registered_table, v_audit_class
  FROM platform.entity_types AS et
  WHERE et.token = p_token
    AND et.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'apply_rls: token % is not an active registered entity', p_token;
  END IF;

  IF v_registered_schema IS DISTINCT FROM p_schema
     OR v_registered_table IS DISTINCT FROM p_table THEN
    RAISE EXCEPTION
      'apply_rls: token % maps to %.%, not %.%',
      p_token, v_registered_schema, v_registered_table, p_schema, p_table;
  END IF;

  IF v_audit_class = 'machinery' THEN
    RAISE EXCEPTION
      'apply_rls: token % (%.%) is access machinery; generic RLS is forbidden because machinery owns inputs consumed by the access resolver',
      p_token, p_schema, p_table;
  END IF;

  -- 🚨 DD-137b (VISIBILITY-BY-CLASS §3.1, chair R3). AN UNSET CLASS IS NOT A VALUE, IT IS A
  -- REFUSAL. Generation is the one place in this system that CAN refuse safely: nobody is
  -- denied their own data by a generation that does not run. The runtime half — the kernel —
  -- resolves unset to `private` instead, because refusing there WOULD deny somebody.
  IF p_variant NOT IN ('component','ledger') AND NOT EXISTS (
       SELECT 1 FROM platform.entity_types et
        WHERE et.token = p_token AND et.data_class IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23502',
      MESSAGE = format('apply_rls: token %s (%s.%s) has no data_class. Which access lanes this table emits is decided by its class, and nobody has decided it.', p_token, p_schema, p_table),
      HINT = 'Set platform.entity_types.data_class (private | confidential | organization | public) with a data_class_reason, then re-run. An unset class is not defaulted to anything: a default here would silently widen a live table.';
  END IF;

  -- 🚨 DD-249 (2026-09-15), AS CORRECTED BY RULING R12 (chair, 2026-09-18) — AN ANONYMOUS
  -- READER WHO HOLDS NO KEY IS NOT A CONTRADICTION.
  -- The emit below no longer builds `pub_read` for a class whose lane set has no anon lane.
  -- On a table that is genuinely serving anonymous readers today that would be a silent
  -- narrowing — `app.definition` (81 public rows) is read by an anonymous visitor on every
  -- /p/<slug> page load — so generation REFUSES instead, DD-137b's rule one layer out:
  -- nobody is denied their own data by a generation that does not run.
  --
  -- WHAT R12 CHANGED, AND WHY. This asked a PROXY question — "does a row marked
  -- visibility = 'public' exist?" — and treated a yes as proof that an anonymous reader is
  -- being served. In this schema that inference does not hold, because anonymity is decided by
  -- the GRANT, not by the value: a `pub_read` policy with no grant behind it is a door with no
  -- key, and visibility = 'public' then means "every signed-in user" — the community lane,
  -- which every one of these tables still has. Measured live 2026-09-18: of the 341 tables
  -- carrying a `pub_read` policy, only 26 give `anon` a key; 315 are doors with no key. So the
  -- proxy produced FALSE POSITIVES and froze 20 tokens (2,647 public rows) out of regeneration
  -- for a contradiction that was not there — `files.files` among them, where `anon` holds no
  -- table grant, no column grant, and a plain select as `anon` returns
  -- `42501 permission denied for table files`.
  --
  -- So it now asks the real question. The refusal is UNCHANGED in the case it was built for —
  -- the 5 remaining tokens where `anon` really can read, `app.definition` included, still
  -- refuse — and generation proceeds where there is no anonymous reader to protect. Nothing
  -- about the doctrine moved: the lane set, the classes and the access words are untouched.
  -- Semantics-unchanged amendment under ruling R12, recorded in the Data Doctrine adoption
  -- register's DD-249 row.
  --
  -- A COLUMN GRANT IS A KEY. `has_table_privilege` alone is a false negative: `app.definition`
  -- has no table grant and 47 column-level SELECT grants to `anon`, and `anon` reads all 81 of
  -- its public rows. Asking only the table-level question would have let this guard proceed on
  -- the very surface it was written to protect, dropped that `pub_read` lane, and taken a live
  -- anonymous page away. Both grants are asked, always.
  -- Repo guard: tests/test_r12_dd249_guard_asks_the_real_question.py.
  IF p_variant NOT IN ('component','ledger','personal','system') AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = p_schema AND table_name = p_table AND column_name = 'visibility')
     AND NOT (iam.class_lanes(p_token)).anon_lane THEN
    -- ONE built-in, because three hand-rolled ways of asking this were all wrong.
    -- `has_any_column_privilege` is true when `anon` can read the table OR any single column
    -- of it, and it resolves grants made to PUBLIC and grants inherited through role
    -- membership. The two alternatives do not:
    --   * `has_table_privilege` alone MISSES a column grant. app.definition has 0 table grants
    --     and 47 column grants to `anon` and serves 81 public rows to anonymous visitors.
    --   * `information_schema.column_privileges` is ROLE-FILTERED and keyed on the named
    --     grantee, so it misses a grant made to PUBLIC that `anon` inherits. Proven live,
    --     rolled back, 2026-09-18: after `grant select (id) on <t> to public`,
    --     has_table_privilege('anon',…)=false, information_schema rows for grantee 'anon'=0,
    --     and has_any_column_privilege('anon',…)=TRUE. A guard built on either of the first
    --     two would hand an anonymous reader's lane away without noticing.
    -- Cross-checked against a pg_attribute.attacl/aclexplode walk on both known cases and
    -- across the whole census: identical answers, and this one also covers inheritance.
    v_anon_has_key := has_any_column_privilege(
      'anon', format('%I.%I', p_schema, p_table)::regclass, 'SELECT');
    IF v_anon_has_key THEN
      EXECUTE format('SELECT count(*) FROM %I.%I WHERE visibility = ''public''', p_schema, p_table)
        INTO v_public_rows;
      IF v_public_rows > 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
          MESSAGE = format(
            'apply_rls: %s.%s (token %s) holds %s row(s) marked visibility = ''public'' AND grants `anon` SELECT, but its class %s emits NO anonymous lane. An anonymous reader is either welcome on this table or not, and right now the data and the grant both say yes while the class says no. Regenerating would drop the pub_read lane those readers are using. Nothing was generated.',
            p_schema, p_table, p_token, v_public_rows, (iam.class_lanes(p_token)).resolved_class),
          HINT = 'FOUR legal fixes. (0) THE ROWS REALLY ARE MEANT FOR ANONYMOUS READERS AND THE TABLE IS OTHERWISE ORG-SCOPED: declare the lane per table -- set platform.entity_types.client_anonymous_public_read = true with a client_anonymous_public_read_reason naming the anonymous surface, and list the columns anon must not hold in client_anonymous_excluded_columns -- then re-run. The lane admits only public, non-deleted rows, iam.apply_table_grants issues the grant, and nothing else in the registry changes (chair ruling 2026-09-22). (1) The table really is public-facing: set platform.entity_types.data_class = ''public'' with a data_class_reason saying which anonymous surface serves it, then re-run — `public` is the one class whose lane set includes anon. (2) The rows are not meant to be world-readable: move them off ''public'' (UPDATE ... SET visibility = ''internal''), then re-run and the anon lane goes away with them. (3) The anonymous lane is over: withdraw `anon`''s SELECT grant at BOTH table and column level, including anything granted to PUBLIC that it inherits — has_any_column_privilege(''anon'', <tbl>, ''SELECT'') is the question, because a column grant and a PUBLIC grant are both keys — then re-run; the rows keep meaning "every signed-in user". Hand-writing a pub_read policy beside this generator is not a fourth option; iam.apply_rls drops it on the next run.';
      END IF;
    END IF;
  END IF;

  -- 🚨 DD-147 (2026-09-12) — THE DRIFT GUARD OVER THE CATALOG.
  -- `iam._apply_rls_unchecked` now drops only the names in `iam.generated_policy_names()` and KEEPS
  -- everything else. That makes the catalog load-bearing: an eighth emitted name that nobody added
  -- to it would look bespoke, survive its own regeneration, and be preserved forever by the very
  -- function that wrote it. So the catalog is not trusted, it is CHECKED — on every single run,
  -- against what the emit actually produced. A policy that is new AND outside the catalog is a
  -- generator whose catalog is a lie, and this refuses to leave one behind quietly.
  v_tbl := to_regclass(format('%I.%I', p_schema, p_table));
  IF v_tbl IS NULL THEN
    RAISE EXCEPTION 'apply_rls: %.% does not exist', p_schema, p_table;
  END IF;
  SELECT coalesce(array_agg(polname ORDER BY polname), '{}') INTO v_before
    FROM pg_policy WHERE polrelid = v_tbl;

  PERFORM iam._apply_rls_unchecked(p_schema, p_table, p_token, p_variant);

  SELECT coalesce(array_agg(polname ORDER BY polname), '{}') INTO v_stray
    FROM pg_policy
   WHERE polrelid = v_tbl
     AND NOT (polname = ANY (iam.generated_policy_names()))
     AND NOT (polname = ANY (v_before));
  IF cardinality(v_stray) > 0 THEN
    RAISE EXCEPTION
      'apply_rls: the generation of %.% (token %) created policy/policies % that are NOT in iam.generated_policy_names(). The catalog is what tells regeneration which policies are ours to drop, so a name outside it would be treated as bespoke and preserved for ever by the function that wrote it. Add the name to iam.generated_policy_names() in the same change that emits it.',
      p_schema, p_table, p_token, array_to_string(v_stray, ', ');
  END IF;
END
$function$;

delete from platform.provision_rule_message where rule_id = 'apply_rls.stale_kernel';
