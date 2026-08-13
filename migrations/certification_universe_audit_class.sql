-- certification_universe_audit_class.sql
--
-- THE CERTIFICATION UNIVERSE RULING (Arman-ratified 2026-08-12, focused session).
-- Some registered tokens are the MACHINERY the canonical contract is built FROM
-- (iam.organizations, iam.memberships, platform.associations, the platform's own
-- audit trail, …). Scoring them against the base-entity contract is circular where
-- it isn't simply inapplicable, and it kept the canonicalization summary showing
-- the platform's foundations as failures. This migration gives the registry a
-- first-class marker:
--
--   platform.entity_types.audit_class        'entity' (default) | 'machinery'
--   platform.entity_types.audit_class_reason required (CHECK) when machinery
--
-- audit.refresh() skips the gate loop for machinery rows (no findings generated;
-- the written reason lives on the registry row). audit.summary exposes the class
-- and a machinery row can never read as certified OR as failing. iam.verify_canonical
-- is deliberately UNTOUCHED: a manual gate run still shows raw distance-from-contract.
--
-- Also applies the ratified per-row verdicts (8 machinery rows) and registry-flag
-- truth fixes (is_versioned/has_soft_delete/rls_variant that contradicted live state).
-- Rules doc: common-docs/systems/db-rules/FEATURE.md §11.

-- ── 1. Columns + constraints ────────────────────────────────────────────────
ALTER TABLE platform.entity_types
  ADD COLUMN IF NOT EXISTS audit_class text NOT NULL DEFAULT 'entity';
ALTER TABLE platform.entity_types
  ADD COLUMN IF NOT EXISTS audit_class_reason text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'platform.entity_types'::regclass
                   AND conname = 'entity_types_audit_class_valid') THEN
    ALTER TABLE platform.entity_types
      ADD CONSTRAINT entity_types_audit_class_valid
      CHECK (audit_class IN ('entity','machinery'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'platform.entity_types'::regclass
                   AND conname = 'entity_types_machinery_reason') THEN
    ALTER TABLE platform.entity_types
      ADD CONSTRAINT entity_types_machinery_reason
      CHECK (audit_class = 'entity' OR audit_class_reason IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN platform.entity_types.audit_class IS
  'Certification universe membership: ''entity'' = scored by iam.verify_canonical via audit.refresh; ''machinery'' = shared platform machinery permanently outside the certification universe (reason required). Ruling: db-rules FEATURE.md §11.';

-- ── 2. The ratified machinery verdicts (reason required by the CHECK) ───────
UPDATE platform.entity_types SET audit_class='machinery', audit_class_reason=
  'MACHINERY: tenant root of the access system (~130 FKs target it); RLS deliberately bespoke (creator+member select, creator-only update, personal-org protections); has_access resolves THROUGH org membership, so gating orgs on it is circular. Ruled 2026-08-12.'
  WHERE token='organization';
UPDATE platform.entity_types SET audit_class='machinery', audit_class_reason=
  'MACHINERY: the membership ledger has_access''s org lane reads; writes are RPC-only (mbr_* via iam._container_authz). Gating it on has_access(''membership'') would gate the resolver''s own input. Ruled 2026-08-12.'
  WHERE token='membership';
UPDATE platform.entity_types SET audit_class='machinery', audit_class_reason=
  'MACHINERY: grant-creating machinery; inv_* RPCs are the only write path; inv_invitee_read is a deliberate identity-matched policy the canonical set cannot express; visibility is meaningless on an invite. Ruled 2026-08-12.'
  WHERE token='invitation';
UPDATE platform.entity_types SET audit_class='machinery', audit_class_reason=
  'MACHINERY: RPC-first by design (access_request_* family, 2026-08-11); ar_own_select + service only — inbox authorization is computed per-resource in access_request_list, never by row grants. Ruled 2026-08-12.'
  WHERE token='access_request';
UPDATE platform.entity_types SET audit_class='machinery', audit_class_reason=
  'MACHINERY: access-grant rule table (curator→industry, feeds rag industry-audience grants), same family as iam.membership_grant; a grant row is not a shareable entity (no id column by design). Ruled 2026-08-12.'
  WHERE token='industry_curator';
UPDATE platform.entity_types SET audit_class='machinery', audit_class_reason=
  'MACHINERY: loud-recovery ops log for personal-org provisioning; super-admin read + service write by design; version/updated_at are noise on an error log. Ruled 2026-08-12.'
  WHERE token='system_personal_org_failure';
UPDATE platform.entity_types SET audit_class='machinery', audit_class_reason=
  'MACHINERY: the platform''s own append-only audit trail (79k rows; same class as history.row_versions, which is deliberately unregistered); the base contract is meaningless on immutable log rows. Ruled 2026-08-12.'
  WHERE token='activity';
UPDATE platform.entity_types SET audit_class='machinery', audit_class_reason=
  'MACHINERY: token points at platform.associations (deliberate 2026-07-13 junction collapse — binding rows ARE edges); the association engine''s org-scoped RLS is its documented design (db-rules §3). Resolve registry lookups by token, never schema+table. Ruled 2026-08-12.'
  WHERE token='agent_surface_binding';

-- ── 3. Registry-flag truth fixes (flags contradicted live state) ────────────
-- organizations: no _version_capture trigger, zero history rows, no deleted_at column.
UPDATE platform.entity_types SET is_versioned=false, has_soft_delete=false WHERE token='organization';
-- activity_log: append-only ledger; no deleted_at, no capture trigger; variant is descriptive truth.
UPDATE platform.entity_types SET rls_variant='ledger', is_versioned=false, has_soft_delete=false WHERE token='activity';
-- associations (via agent_surface_binding row): edges are hard-deleted by design; no deleted_at, no capture trigger.
UPDATE platform.entity_types SET is_versioned=false, has_soft_delete=false WHERE token='agent_surface_binding';

-- ── 4. audit.refresh: machinery rows are outside the gate loop ──────────────
CREATE OR REPLACE FUNCTION audit.refresh()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE r record; w record; d record; v_relid regclass; v_ext text; v_sql text; v_dep text;
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
  SELECT n.nspname,c.relname,
    EXISTS(SELECT 1 FROM platform.entity_types et WHERE et.schema_name=n.nspname AND et.table_name=c.relname),
    count(*) FILTER (WHERE confrel.relname NOT IN ('organizations','users')),
    string_agg(DISTINCT confrel.relname,', ') FILTER (WHERE confrel.relname NOT IN ('organizations','users')),
    (SELECT count(*) FROM information_schema.columns col WHERE col.table_schema=n.nspname AND col.table_name=c.relname
       AND col.column_name NOT IN ('id','created_at','updated_at','created_by','updated_by','deleted_at','version','metadata','organization_id','role','label','position','sort_order','sort_index'))
  FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_class confrel ON confrel.oid=con.confrelid
  WHERE con.contype='f' AND n.nspname NOT IN (SELECT schema_name FROM meta.excluded_schema) AND n.nspname<>'audit'
    AND NOT EXISTS (SELECT 1 FROM meta.audit_exemption ex
                    WHERE ex.check_name='m2m_candidate' AND ex.schema_name=n.nspname AND ex.table_name=c.relname)
  GROUP BY n.nspname,c.relname
  HAVING count(*) FILTER (WHERE confrel.relname NOT IN ('organizations','users')) >= 2
     AND audit.is_m2m_shape(format('%I.%I',n.nspname,c.relname)::regclass);

  INSERT INTO audit.unregistered_candidates(schema_name,table_name,base_col_score,has_id_uuid,has_created_at)
  SELECT n.nspname,c.relname,
    (SELECT count(*) FROM information_schema.columns col WHERE col.table_schema=n.nspname AND col.table_name=c.relname
       AND col.column_name IN ('id','organization_id','created_by','updated_by','created_at','updated_at','deleted_at','version','metadata')),
    EXISTS(SELECT 1 FROM information_schema.columns col WHERE col.table_schema=n.nspname AND col.table_name=c.relname AND col.column_name='id' AND col.data_type='uuid'),
    EXISTS(SELECT 1 FROM information_schema.columns col WHERE col.table_schema=n.nspname AND col.table_name=c.relname AND col.column_name='created_at')
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND n.nspname NOT IN (SELECT schema_name FROM meta.excluded_schema) AND n.nspname<>'audit'
    AND c.relname NOT LIKE '\_%'
    AND NOT EXISTS(SELECT 1 FROM platform.entity_types et WHERE et.schema_name=n.nspname AND et.table_name=c.relname)
    AND NOT EXISTS (SELECT 1 FROM meta.audit_exemption ex
                    WHERE ex.check_name='unregistered_candidate' AND ex.schema_name=n.nspname AND ex.table_name=c.relname);

  FOR r IN SELECT p.oid, n.nspname AS s, p.proname AS fn, p.oid::regprocedure::text AS sig, p.prorettype AS rettype
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
             AND n.nspname NOT IN (SELECT schema_name FROM meta.excluded_schema) AND n.nspname<>'audit'
  LOOP
    IF r.rettype='pg_catalog.trigger'::regtype THEN
      SELECT tg.tgrelid INTO v_relid FROM pg_trigger tg WHERE tg.tgfoid=r.oid AND NOT tg.tgisinternal LIMIT 1;
      IF v_relid IS NULL THEN
        INSERT INTO audit.broken_functions(schema_name,function_name,signature,level,message)
        VALUES (r.s,r.fn,r.sig,'check_skipped','trigger fn not attached; not checkable'); CONTINUE;
      END IF;
    ELSE v_relid:=0; END IF;

    v_sql := format('SELECT lineno,level,sqlstate,message,statement,context FROM %I.plpgsql_check_function_tb($1,$2,false)',v_ext);
    BEGIN
      FOR w IN EXECUTE v_sql USING r.oid::regprocedure, v_relid LOOP
        IF w.level IN ('error','warning') THEN
          INSERT INTO audit.broken_functions(schema_name,function_name,signature,lineno,level,sqlstate,message,context)
          VALUES (r.s,r.fn,r.sig,w.lineno,w.level,w.sqlstate,w.message,w.context);
        END IF;
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO audit.broken_functions(schema_name,function_name,signature,level,sqlstate,message)
      VALUES (r.s,r.fn,r.sig,'check_skipped',SQLSTATE,SQLERRM);
    END;

    v_dep := format('SELECT type,schema,name FROM %I.plpgsql_show_dependency_tb($1,$2)',v_ext);
    BEGIN
      FOR d IN EXECUTE v_dep USING r.oid::regprocedure, v_relid LOOP
        INSERT INTO audit.function_deps(function_schema,function_name,signature,dep_type,dep_schema,dep_name)
        VALUES (r.s,r.fn,r.sig,d.type,d.schema,d.name);
      END LOOP;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  INSERT INTO audit.refresh_log(gate_fail,gate_warn,ext_fail,ext_warn,m2m,unregistered,stale,broken_fn,note)
  SELECT
    (SELECT count(*) FROM audit.canonical_findings WHERE status='FAIL'),
    (SELECT count(*) FROM audit.canonical_findings WHERE status='WARN'),
    0,0,
    (SELECT count(*) FROM audit.m2m_candidates),
    (SELECT count(*) FROM audit.unregistered_candidates),
    (SELECT count(*) FROM audit.stale_registry),
    (SELECT count(DISTINCT signature) FROM audit.broken_functions WHERE level='error'),
    'complete gate; deps='||(SELECT count(*) FROM audit.function_deps)::text||'; exemptions='||(SELECT count(*) FROM meta.audit_exemption)::text
      ||'; machinery='||(SELECT count(*) FROM platform.entity_types WHERE is_active AND audit_class='machinery')::text;
  RETURN 'audit.refresh complete';
END; $function$;

-- ── 5. audit.summary: expose the class; machinery is neither certified nor failing ──
CREATE OR REPLACE VIEW audit.summary AS
SELECT et.schema_name,
    et.table_name,
    et.token,
    count(*) FILTER (WHERE f.status = 'FAIL'::text) AS fails,
    count(*) FILTER (WHERE f.status = 'WARN'::text) AS warns,
    (count(*) FILTER (WHERE f.status = ANY (ARRAY['FAIL'::text, 'WARN'::text])) = 0
       AND et.audit_class = 'entity') AS certified,
    et.audit_class,
    et.audit_class_reason
   FROM platform.entity_types et
     LEFT JOIN audit.canonical_findings f ON f.schema_name = et.schema_name AND f.table_name = et.table_name AND f.token = et.token
  WHERE et.is_active AND to_regclass(format('%I.%I'::text, et.schema_name, et.table_name)) IS NOT NULL
  GROUP BY et.schema_name, et.table_name, et.token, et.audit_class, et.audit_class_reason
  ORDER BY (count(*) FILTER (WHERE f.status = 'FAIL'::text)) DESC, (count(*) FILTER (WHERE f.status = 'WARN'::text)) DESC;
