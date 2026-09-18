-- target: branch
-- based-on: iam.apply_rls(text, text, text, text) a9bd3e3c4db0d4ea15d3dea08a9ae6a63cd1da53253c7cc6d4a32623e40812ba
-- based-on: iam.canonical_certify_ok(text, text, text) 17b3de46f458d764dcb62003e1d315cfb269a6c7300db0883927d171a90bc915
-- based-on: iam.sweep_governance_guards(text) 172260632746ee70752a9ee8ac56a4e8976167ce5e42a07bcfcf501e0aa11b19
-- based-on: audit.refresh_static() 380873c59231179931c68adde1fe7aa62c721f401f699f6faa9d20d8878b21db
--
-- REC-48 · REC-58 — EVERY CUSTOM TABLE IS IN THE REGISTRY, AND THE GENERATOR STAYS OFF IT.
--
-- WHAT A CUSTOM TABLE IS, SAID ONCE
-- ---------------------------------
-- A custom Table is a ROW in `custom.record` with `data_class = 'table'`, not a relation.
-- Nine of them live on this branch. REC-48 says every one is mirrored into
-- `platform.entity_types` as `custom:<org-slug>:<table-slug>` with `origin = 'custom'`,
-- so one registry answers `type` and `origin` for standard and custom alike (REC-33) and
-- every System function that keys on the registry keeps working unchanged.
--
-- THE UNIQUENESS HAD TO GIVE, AND EXACTLY ONE WAY
-- -----------------------------------------------
-- `entity_types_schema_name_table_name_key` admits ONE row per (schema, table) globally,
-- and all nine mirrors point at the same physical relation, `custom.record`. So this file
-- creates `entity_types_schema_table_nonvirtual_uk` — UNIQUE (schema_name, table_name)
-- WHERE relation_kind <> 'virtual' — and THEN drops the old constraint, in that order, in
-- one transaction (the runner owns it), so there is no instant in which the pair is
-- unconstrained. Widening a unique index is the one shape rule 4's additive test admits,
-- because nothing the old index accepted is refused after it: the one physical relation
-- behind every custom token still admits exactly one non-virtual row.
--
-- `relation_kind` GAINS A THIRD VALUE, AND THAT IS WHY THIS FILE IS BRANCH-ONLY.
-- `entity_types_relation_kind_valid` enumerates table|projection; widening it is a DROP
-- CONSTRAINT, which the additive allow-list refuses on any file naming production — and
-- so is the INSERT into `platform.entity_types` below (REC-N-14: production's registry
-- gains NO `custom:` token in this campaign, or `pnpm check:entity-types` reds the whole
-- frontend release train). Both refusals are correct and this file is `-- target: branch`.
--
-- REC-58's `projects_token` IS `record`, NOT `custom_record`, AND HERE IS WHY
-- ---------------------------------------------------------------------------
-- REC-58's cell reads `projects_token = custom_record`. MEASURED on the branch: the token
-- `custom_record` exists and belongs to `platform.custom_record`, the OLD store that
-- `W7-DEPR-PLAT` deprecates; the physical relation these mirrors point at is `custom.record`
-- and its token is `record`. Pointing nine mirrors at a token for a different table would
-- be a lie the certifier cannot see. The row's intent — "the physical relation behind
-- every custom token" — is honoured; its literal is stale and is named here rather than
-- copied.
--
-- THE FOUR FUNCTIONS TAUGHT TO SKIP, EACH PROVEN RED FIRST (2026-09-18, branch, rolled back)
-- ------------------------------------------------------------------------------------------
--   · `iam.apply_rls`             — RAN TO COMPLETION on a virtual token and regenerated
--                                    custom.record. Now RAISES `check_violation` naming the
--                                    physical token. (REC-58's own words.)
--   · `iam.canonical_certify_ok`  — returned FALSE for a virtual token. Now returns true:
--                                    the physical token is certified in its own right.
--   · `iam.sweep_governance_guards` — would visit custom.record once per custom Table.
--   · `audit.refresh_static`      — would certify nine virtual tokens into
--                                    `audit.canonical_findings` as failures.
-- And one that needed NOTHING, measured rather than assumed: `public.admin_unregistered_pairs()`
-- returned 0 with all nine virtual rows present, because it asks the opposite question.
--
-- REVERSIBLE: `migrations/inverse/w1_reg_virtual_tokens_and_the_partial_index_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

-- ---------------------------------------------------------------- 1. relation_kind: a third value
do $w1reg$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'platform.entity_types'::regclass
                    and conname = 'entity_types_relation_kind_valid'
                    and pg_get_constraintdef(oid) like '%virtual%') then
    alter table platform.entity_types drop constraint entity_types_relation_kind_valid;
    alter table platform.entity_types add constraint entity_types_relation_kind_valid
      check (relation_kind = any (array['table'::text, 'projection'::text, 'virtual'::text]));
  end if;
end
$w1reg$;

-- ------------------------------------------- 2. the partial index replaces the global one
create unique index if not exists entity_types_schema_table_nonvirtual_uk
  on platform.entity_types (schema_name, table_name)
  where relation_kind <> 'virtual';

alter table platform.entity_types
  drop constraint if exists entity_types_schema_name_table_name_key;

-- ---------------------------------------------------------------- 3. the nine mirrors
insert into platform.entity_types
  (token, schema_name, table_name, label, rls_variant, relation_kind, projects_token,
   origin, type, custom_fields_enabled, is_listed, notes)
select 'custom:' || o.slug || ':' || (r.data->>'slug'),
       'custom', 'record', coalesce(r.data->>'name', r.data->>'slug'),
       'entity', 'virtual', 'record',
       'custom', 'entity', true, false,
       'W1-REG REC-48: the registry mirror of custom Table ' || r.id
         || '. relation_kind=virtual — it carries meaning, never enforcement (REC-58).'
  from custom.record r
  join iam.organizations o on o.id = r.organization_id
 where r.data_class = 'table'
   and r.data ? 'slug'
on conflict (token) do nothing;

-- ---------------------------------------------------------------- 4. the four skips
CREATE OR REPLACE FUNCTION iam.apply_rls(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_registered_schema text;
  v_registered_table text;
  v_audit_class text;
  -- REC-58 (W1-REG, 2026-09-18): what KIND of registry row this token is.
  v_relation_kind text;
  v_projects_token text;
  -- DD-147 drift guard: what the table carried before the emit, and what appeared that this
  -- generator does not claim to author.
  v_tbl regclass;
  v_before text[];
  v_stray text[];
  -- DD-249: how many rows say `public` on a table whose class grants no anon lane.
  v_public_rows bigint;
BEGIN
  SELECT et.schema_name, et.table_name, coalesce(et.audit_class, 'entity'),
         coalesce(et.relation_kind, 'table'), et.projects_token
    INTO v_registered_schema, v_registered_table, v_audit_class,
         v_relation_kind, v_projects_token
  FROM platform.entity_types AS et
  WHERE et.token = p_token
    AND et.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'apply_rls: token % is not an active registered entity', p_token;
  END IF;

  -- 🚨 REC-58 (W1-REG, 2026-09-18) — A VIRTUAL TOKEN HAS NO RELATION OF ITS OWN.
  -- Every custom Table is mirrored into this registry as `custom:<org>:<table>` with
  -- relation_kind = 'virtual', and ALL of them point at the ONE physical relation named
  -- by projects_token. Generating from a virtual token would emit the physical table's
  -- policies a second, third and ninth time — the same names, dropped and rebuilt on
  -- every pass — so RLS is generated exactly once, for the physical token. MEASURED
  -- before this arm existed: apply_rls ran to completion on a virtual token and
  -- regenerated custom.record. It refuses now, and it names where to go instead.
  IF v_relation_kind = 'virtual' THEN
    RAISE EXCEPTION
      'apply_rls: token % is relation_kind=''virtual'' — it is a custom Table mirrored onto the physical relation %.%, which has no policies of its own to generate. Generate the PHYSICAL token instead: %',
      p_token, v_registered_schema, v_registered_table, coalesce(v_projects_token, '<projects_token is null, which is itself a defect>')
      USING ERRCODE = 'check_violation',
            HINT = 'REC-58: RLS on the physical relation is generated exactly once, for the physical token. A virtual row carries meaning (origin, type, custom_fields_enabled), never enforcement.';
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

  -- 🚨 DD-249 (2026-09-15) — A PUBLIC ROW AND A CLASS WITH NO ANON LANE IS A CONTRADICTION,
  -- AND THE GENERATOR IS WHERE IT GETS SETTLED.
  -- The emit above no longer builds `pub_read` for a class whose lane set has no anon lane.
  -- That alone would be a silent narrowing on a table that is genuinely serving anonymous
  -- readers today: 25 live tokens hold rows marked `visibility = 'public'` under a class that
  -- says no stranger may read them, and `app.definition` (81 such rows) is read by an
  -- anonymous visitor on every /p/<slug> page load. Dropping their lane quietly would take a
  -- working product surface away; keeping it quietly would leave the class lying about the
  -- table. So generation REFUSES and names both exits — DD-137b's rule, one layer out: nobody
  -- is denied their own data by a generation that does not run.
  IF p_variant NOT IN ('component','ledger','personal','system') AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = p_schema AND table_name = p_table AND column_name = 'visibility')
     AND NOT (iam.class_lanes(p_token)).anon_lane THEN
    EXECUTE format('SELECT count(*) FROM %I.%I WHERE visibility = ''public''', p_schema, p_table)
      INTO v_public_rows;
    IF v_public_rows > 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = format(
          'apply_rls: %s.%s (token %s) holds %s row(s) marked visibility = ''public'', but its class %s emits NO anonymous lane. An anonymous reader is either welcome on this table or not, and right now the data says yes while the class says no. Nothing was generated.',
          p_schema, p_table, p_token, v_public_rows, (iam.class_lanes(p_token)).resolved_class),
        HINT = 'Two legal fixes, and only two. (1) The table really is public-facing: set platform.entity_types.data_class = ''public'' with a data_class_reason saying which anonymous surface serves it, then re-run — `public` is the one class whose lane set includes anon. (2) The rows are not meant to be world-readable: move them off ''public'' (UPDATE ... SET visibility = ''internal''), then re-run and the anon lane goes away with them. Hand-writing a pub_read policy beside this generator is not a third option; iam.apply_rls drops it on the next run.';
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

CREATE OR REPLACE FUNCTION iam.canonical_certify_ok(p_schema text, p_table text, p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  -- 🚨 REC-58 (W1-REG, 2026-09-18) — THE CERTIFIER STAYS OFF VIRTUAL TOKENS.
  -- A `custom:<org>:<table>` row carries no relation of its own; the base contract it
  -- would be measured against belongs to the PHYSICAL token, which is certified in its
  -- own right. MEASURED before this arm existed: a virtual token certified FALSE, so
  -- nine perfectly correct custom Tables would each have reported a governance failure
  -- against a table that is already certified.
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM platform.entity_types et
                  WHERE et.token = p_token AND et.relation_kind = 'virtual')
      THEN true
    ELSE NOT EXISTS(
      SELECT 1 FROM iam.canonical_certify(p_schema,p_table,p_token) cc
      WHERE cc.status <> 'INFO'
    )
  END;
$function$;

CREATE OR REPLACE PROCEDURE iam.sweep_governance_guards(IN p_lock_timeout text DEFAULT '3s'::text)
 LANGUAGE plpgsql
AS $procedure$
declare
  r record;
  v_applied int := 0;
  v_dropped int := 0;
begin
  -- No EXCEPTION block here on purpose: plpgsql forbids transaction control
  -- inside one, and per-table COMMIT is the whole point. If a table cannot be
  -- locked within p_lock_timeout the procedure aborts LOUDLY naming that table;
  -- everything already committed stays, and re-running resumes where it stopped
  -- (the loop skips tables already in the desired state).
  execute format('set lock_timeout = %L', p_lock_timeout);

  for r in
    select et.schema_name, et.table_name, et.token, coalesce(et.rls_variant, 'entity') as variant,
           exists (
             select 1 from pg_trigger tg
             where tg.tgrelid = format('%I.%I', et.schema_name, et.table_name)::regclass
               and tg.tgname = '_guard_governance'
               and not tg.tgisinternal) as has_guard
    from platform.entity_types et
    where et.is_active
      -- REC-58 (W1-REG, 2026-09-18): a virtual token mirrors a custom Table onto a
      -- physical relation that is already in this loop under its own token. Without
      -- this predicate the sweep would visit custom.record once per custom Table and
      -- attach or drop the same guard nine times over.
      and coalesce(et.relation_kind, 'table') <> 'virtual'
      and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
      and exists (
        select 1 from pg_policies p
        where p.schemaname = et.schema_name
          and p.tablename  = et.table_name
          and p.policyname = 'std_update')
    order by et.schema_name, et.table_name
  loop
    if r.variant in ('entity', 'system') then
      if not r.has_guard then
        perform iam.apply_governance_guard(r.schema_name, r.table_name, r.token);
        v_applied := v_applied + 1;
        commit;
      end if;
    elsif r.has_guard then
      perform iam.drop_governance_guard(r.schema_name, r.table_name);
      v_dropped := v_dropped + 1;
      commit;
    end if;
  end loop;

  raise notice 'governance guard sweep: attached %, cleared % (tables already correct were skipped)',
    v_applied, v_dropped;
end
$procedure$;

CREATE OR REPLACE FUNCTION audit.refresh_static()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  r record; w record; d record; c record;
  v_relid regclass; v_ext text; v_sql text; v_dep text; v_sp text; v_sig text;
  v_sev text; v_reason text;
BEGIN
  SELECT n.nspname INTO v_ext FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='plpgsql_check';

  TRUNCATE audit.canonical_findings, audit.unregistered_candidates, audit.stale_registry,
           audit.m2m_candidates, audit.broken_functions, audit.function_deps;

  INSERT INTO audit.stale_registry(token,schema_name,table_name)
  SELECT token,schema_name,table_name FROM platform.entity_types et
  WHERE to_regclass(format('%I.%I',et.schema_name,et.table_name)) IS NULL
    AND NOT EXISTS (SELECT 1 FROM meta.audit_exemption ex
                    WHERE ex.check_name='stale_registry' AND ex.schema_name=et.schema_name AND ex.table_name=et.table_name);

  -- Machinery rows (audit_class='machinery') are OUTSIDE the certification universe:
  -- the gate is not run for them; the written reason lives on the registry row.
  FOR r IN SELECT et.token, et.schema_name AS s, et.table_name AS t
           FROM platform.entity_types et
           WHERE et.is_active AND to_regclass(format('%I.%I',et.schema_name,et.table_name)) IS NOT NULL
             AND et.audit_class <> 'machinery'
             -- REC-58 (W1-REG, 2026-09-18): virtual tokens are outside the certification
             -- universe for the same reason machinery is — they have no relation of their
             -- own. The physical token beside them is certified normally.
             AND coalesce(et.relation_kind, 'table') <> 'virtual'
  LOOP
    BEGIN
      INSERT INTO audit.canonical_findings(schema_name,table_name,token,source,check_name,status,detail)
      SELECT r.s,r.t,r.token,'gate',vc.check_name,vc.status,vc.detail
      FROM iam.verify_canonical(r.s,r.t,r.token) vc
      WHERE vc.status IN ('FAIL','WARN')
        AND NOT EXISTS (SELECT 1 FROM meta.audit_exemption ex
                        WHERE ex.check_name='gate:'||vc.check_name AND ex.schema_name=r.s AND ex.table_name=r.t);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO audit.canonical_findings(schema_name,table_name,token,source,check_name,status,detail)
      VALUES (r.s,r.t,r.token,'gate','gate_error','FAIL',SQLERRM);
    END;
  END LOOP;

  INSERT INTO audit.m2m_candidates(schema_name,table_name,registered,entity_fk_count,fk_targets,payload_cols)
  SELECT n.nspname,c2.relname,
    EXISTS(SELECT 1 FROM platform.entity_types et WHERE et.schema_name=n.nspname AND et.table_name=c2.relname),
    count(*) FILTER (WHERE confrel.relname NOT IN ('organizations','users')),
    string_agg(DISTINCT confrel.relname,', ') FILTER (WHERE confrel.relname NOT IN ('organizations','users')),
    (SELECT count(*) FROM information_schema.columns col WHERE col.table_schema=n.nspname AND col.table_name=c2.relname
       AND col.column_name NOT IN ('id','created_at','updated_at','created_by','updated_by','deleted_at','version','metadata','organization_id','role','label','position','sort_order','sort_index'))
  FROM pg_constraint con JOIN pg_class c2 ON c2.oid=con.conrelid JOIN pg_namespace n ON n.oid=c2.relnamespace
  JOIN pg_class confrel ON confrel.oid=con.confrelid
  WHERE con.contype='f' AND n.nspname NOT IN (SELECT schema_name FROM meta.excluded_schema) AND n.nspname<>'audit'
    AND NOT EXISTS (SELECT 1 FROM meta.audit_exemption ex
                    WHERE ex.check_name='m2m_candidate' AND ex.schema_name=n.nspname AND ex.table_name=c2.relname)
  GROUP BY n.nspname,c2.relname
  HAVING count(*) FILTER (WHERE confrel.relname NOT IN ('organizations','users')) >= 2
     AND audit.is_m2m_shape(format('%I.%I',n.nspname,c2.relname)::regclass);

  INSERT INTO audit.unregistered_candidates(schema_name,table_name,base_col_score,has_id_uuid,has_created_at)
  SELECT n.nspname,c2.relname,
    (SELECT count(*) FROM information_schema.columns col WHERE col.table_schema=n.nspname AND col.table_name=c2.relname
       AND col.column_name IN ('id','organization_id','created_by','updated_by','created_at','updated_at','deleted_at','version','metadata')),
    EXISTS(SELECT 1 FROM information_schema.columns col WHERE col.table_schema=n.nspname AND col.table_name=c2.relname AND col.column_name='id' AND col.data_type='uuid'),
    EXISTS(SELECT 1 FROM information_schema.columns col WHERE col.table_schema=n.nspname AND col.table_name=c2.relname AND col.column_name='created_at')
  FROM pg_class c2 JOIN pg_namespace n ON n.oid=c2.relnamespace
  WHERE c2.relkind='r' AND n.nspname NOT IN (SELECT schema_name FROM meta.excluded_schema) AND n.nspname<>'audit'
    AND c2.relname NOT LIKE '\_%'
    AND NOT EXISTS(SELECT 1 FROM platform.entity_types et WHERE et.schema_name=n.nspname AND et.table_name=c2.relname)
    AND NOT EXISTS (SELECT 1 FROM meta.audit_exemption ex
                    WHERE ex.check_name='unregistered_candidate' AND ex.schema_name=n.nspname AND ex.table_name=c2.relname);

  -- ── plpgsql_check, run under each function's OWN effective search path ──
  FOR r IN SELECT p.oid, n.nspname AS s, p.proname AS fn,
                  p.prorettype AS rettype, p.proconfig
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
             AND n.nspname NOT IN (SELECT schema_name FROM meta.excluded_schema) AND n.nspname<>'audit'
  LOOP
    -- The signature is a JOIN KEY (audit.table_impact matches it against
    -- (oid::regprocedure)::text). Evaluate the cast here, with the path pinned
    -- to pg_catalog, so it is always schema-qualified AND byte-identical to
    -- what table_impact computes. Never compute it in the cursor's select list:
    -- plpgsql fetches lazily and this loop rewrites search_path per iteration.
    SET search_path TO 'pg_catalog';
    v_sig := (r.oid::regprocedure)::text;

    IF r.rettype='pg_catalog.trigger'::regtype THEN
      SELECT tg.tgrelid INTO v_relid FROM pg_trigger tg WHERE tg.tgfoid=r.oid AND NOT tg.tgisinternal LIMIT 1;
      IF v_relid IS NULL THEN
        INSERT INTO audit.broken_functions(schema_name,function_name,signature,level,message,severity)
        VALUES (r.s,r.fn,v_sig,'check_skipped','trigger fn not attached; not checkable','unchecked'); CONTINUE;
      END IF;
    ELSE v_relid:=0; END IF;

    -- THE FIX for the entire "does not exist" false-positive class: resolve
    -- names the way the function itself will at runtime, not under pg_catalog.
    v_sp := audit.effective_search_path(r.proconfig);
    BEGIN
      EXECUTE format('set search_path to %s', v_sp);
    EXCEPTION WHEN OTHERS THEN
      v_sp := 'pg_temp, "$user", public, extensions';
      EXECUTE format('set search_path to %s', v_sp);
    END;

    v_sql := format('SELECT lineno,level,sqlstate,message,statement,context FROM %I.plpgsql_check_function_tb($1,$2,false)',v_ext);
    BEGIN
      FOR w IN EXECUTE v_sql USING r.oid::regprocedure, v_relid LOOP
        IF w.level IN ('error','warning') THEN
          SELECT cb.severity, cb.suppression_reason INTO v_sev, v_reason
          FROM audit.classify_broken_function(r.oid, w.level, w.sqlstate, w.message) cb;
          INSERT INTO audit.broken_functions(schema_name,function_name,signature,lineno,level,sqlstate,message,context,severity,suppression_reason)
          VALUES (r.s,r.fn,v_sig,w.lineno,w.level,w.sqlstate,w.message,w.context,v_sev,v_reason);
        END IF;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO audit.broken_functions(schema_name,function_name,signature,level,sqlstate,message,severity)
      VALUES (r.s,r.fn,v_sig,'check_skipped',SQLSTATE,SQLERRM,'unchecked');
    END;

    v_dep := format('SELECT type,schema,name FROM %I.plpgsql_show_dependency_tb($1,$2)',v_ext);
    BEGIN
      FOR d IN EXECUTE v_dep USING r.oid::regprocedure, v_relid LOOP
        INSERT INTO audit.function_deps(function_schema,function_name,signature,dep_type,dep_schema,dep_name)
        VALUES (r.s,r.fn,v_sig,d.type,d.schema,d.name);
      END LOOP;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    SET search_path TO 'pg_catalog';
  END LOOP;

  SET search_path TO 'pg_catalog';

  -- ── The privilege class: invoker-rights functions that enumerate relations
  --    from the catalog and query them with no privilege filter. Static SHAPE,
  --    not proven breakage — hence severity='advisory'. This is the closest a
  --    static checker can get to the get_project_references failure
  --    ("permission denied for schema graveyard"), which was a runtime
  --    privilege error inside dynamic SQL and therefore unfindable statically.
  FOR c IN
    SELECT p.oid, n.nspname AS s, p.proname AS fn, (p.oid::regprocedure)::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
      AND p.prokind='f' AND NOT p.prosecdef
      AND n.nspname NOT IN (SELECT schema_name FROM meta.excluded_schema) AND n.nspname<>'audit'
      AND pg_get_functiondef(p.oid) ~* 'execute\s+(format|''|")'
      AND pg_get_functiondef(p.oid) ~* '(from|join)\s+pg_class|information_schema\.tables|from\s+pg_constraint'
      AND pg_get_functiondef(p.oid) !~* 'has_(table|schema)_privilege'
  LOOP
    INSERT INTO audit.broken_functions(schema_name,function_name,signature,level,message,severity,context)
    VALUES (c.s,c.fn,c.sig,'privilege_risk',
            'Invoker-rights function enumerates relations from the catalog and builds dynamic SQL against them without has_table_privilege/has_schema_privilege — it will fail for any caller who cannot read a discovered table.',
            'advisory',
            'Fix pattern: public.get_project_references (2026-08-13). Prove it with a row in audit.function_runtime_probe.');
  END LOOP;

  INSERT INTO audit.refresh_log(gate_fail,gate_warn,ext_fail,ext_warn,m2m,unregistered,stale,broken_fn,note)
  SELECT
    (SELECT count(*) FROM audit.canonical_findings WHERE status='FAIL'),
    (SELECT count(*) FROM audit.canonical_findings WHERE status='WARN'),
    0,0,
    (SELECT count(*) FROM audit.m2m_candidates),
    (SELECT count(*) FROM audit.unregistered_candidates),
    (SELECT count(*) FROM audit.stale_registry),
    (SELECT count(DISTINCT signature) FROM audit.broken_functions WHERE severity='real'),
    'complete gate; deps='||(SELECT count(*) FROM audit.function_deps)::text||'; exemptions='||(SELECT count(*) FROM meta.audit_exemption)::text
      ||'; machinery='||(SELECT count(*) FROM platform.entity_types WHERE is_active AND audit_class='machinery')::text;

  PERFORM audit.refresh_log_recount();
  RETURN 'audit.refresh complete';
END; $function$;

-- 🚨 A DEBT THIS FILE INHERITED BY TOUCHING THE FUNCTION, AND PAYS RATHER THAN DODGES.
-- `audit.refresh_static()` is SECURITY DEFINER and carries NO `platform.client_callable_door`
-- row, so `provision_shape_guard` refused this whole transaction with SQLSTATE 23514 the
-- first time it ran: "reached COMMIT with no access decision declared". The debt predates
-- this lane — the function has been definer-and-undeclared for as long as it has existed —
-- and the honest move is to declare it, not to drop the one-line skip that surfaced it.
-- It is server-only: `audit.refresh()` calls it and nothing client-facing does, which is
-- why no GRANT to a client role exists on it either.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('audit', 'refresh_static', '', array[]::oid[],
   'Takes no arguments at all, so there is no entity id to check anything against and no NULL rule to state. It TRUNCATEs and rebuilds the audit snapshot tables from the catalog and the registry.',
   'W1-REG migrations/campaign/w1_reg_virtual_tokens_and_the_partial_index.sql',
   'server_only: audit.refresh() is its only caller and the audit refresh runs as postgres from a migration or a scheduled sweep; no client role holds EXECUTE on it and none ever should, because it truncates and rebuilds the audit snapshot tables for the whole database.',
   false, false)
on conflict do nothing;

-- ---------------------------------------------------------------- 5. the assertions
do $w1reg$
declare
  v_virtual int; v_custom_origin int; v_nonvirtual_on_record int; v_tables int; v_raised boolean := false;
  v_tok text;
begin
  select count(*) into v_tables from custom.record where data_class = 'table' and data ? 'slug';
  select count(*) into v_virtual from platform.entity_types where relation_kind = 'virtual';
  select count(*) into v_custom_origin from platform.entity_types where origin = 'custom';
  select count(*) into v_nonvirtual_on_record from platform.entity_types
   where schema_name = 'custom' and table_name = 'record' and relation_kind <> 'virtual';

  if v_virtual <> v_tables then
    raise exception 'REC-48: % custom Table(s) in custom.record but % virtual registry row(s)', v_tables, v_virtual;
  end if;
  if v_custom_origin <> v_virtual then
    raise exception 'REC-48: % virtual row(s) but % row(s) at origin=custom', v_virtual, v_custom_origin;
  end if;
  if v_nonvirtual_on_record <> 1 then
    raise exception 'REC-48: the partial index must still admit exactly ONE non-virtual row on custom.record; found %', v_nonvirtual_on_record;
  end if;
  if not exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                  where c.relname = 'entity_types_schema_table_nonvirtual_uk' and i.indisunique
                    and i.indpred is not null) then
    raise exception 'REC-48: the partial unique index is absent or is not partial';
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'platform.entity_types'::regclass
               and conname = 'entity_types_schema_name_table_name_key') then
    raise exception 'REC-48: the old global unique constraint survived';
  end if;

  select token into v_tok from platform.entity_types where relation_kind = 'virtual' limit 1;
  begin
    perform iam.apply_rls('custom', 'record', v_tok, 'entity');
  exception when check_violation then v_raised := true;
  end;
  if not v_raised then
    raise exception 'REC-58: iam.apply_rls did NOT refuse the virtual token % — the skip is not in force', v_tok;
  end if;
  if not iam.canonical_certify_ok('custom', 'record', v_tok) then
    raise exception 'REC-58: the certifier still reports a finding against virtual token %', v_tok;
  end if;

  raise notice 'W1-REG REC-48/REC-58: % custom Table(s) mirrored as virtual tokens at origin=custom; the partial index admits exactly 1 non-virtual row on custom.record; apply_rls refuses a virtual token and the certifier skips it.', v_virtual;
end
$w1reg$;
