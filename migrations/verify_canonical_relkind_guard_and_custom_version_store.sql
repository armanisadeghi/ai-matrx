-- Applied via Supabase MCP 2026-08-12 (verify_canonical_relkind_guard_and_custom_version_store).
-- Gate upgrade (Arman-ratified, Fork 2 claim): (1) RELKIND GUARD — a registered VIEW/matview
-- gets one SKIP row, not 15 fake base-contract FAILs (the agent.card class). (2) CUSTOM VERSION
-- STORE certification — entity_types.version_store='custom' passes trg_version_capture ONLY when
-- the declared store is a real table, a registered composition child of this token, written by an
-- automatic capture trigger on the entity table, with UNIQUE(parent_fk, version column) — and NO
-- _version_capture trigger alongside (duplicate versioning = FAIL). This file is the live body.
CREATE OR REPLACE FUNCTION iam.verify_canonical(p_schema text, p_table text, p_token text, p_variant text DEFAULT NULL::text)
 RETURNS TABLE(check_name text, status text, detail text)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_tbl regclass;
  v_relkind "char";
  v_is_component boolean; v_variant text; v_reg_variant text;
  v_soft_delete boolean; v_is_versioned boolean; v_is_listed boolean; v_shareable boolean;
  v_vstore text; v_vstore_ref regclass;
  v_store_token text; v_store_fk text; v_store_trig boolean; v_store_uq boolean; v_store_kind "char";
  f_id_uuid boolean; f_id boolean; f_org boolean; f_org_nn boolean;
  f_cb boolean; f_ub boolean; f_ca_nn boolean; f_ua_nn boolean; f_del boolean;
  f_ver boolean; f_meta boolean;
  f_vis boolean; f_vis_enum boolean; f_vis_nn boolean;
  l_owner boolean; l_orgid boolean; l_isdel boolean; l_ispub boolean;
  fk_org boolean; fk_cb boolean; fk_ub boolean;
  t_stamp boolean; t_touch boolean; t_hist boolean;
  v_rls boolean; v_polnames text[]; v_sel text;
  v_reg_rt text; v_expected text[]; v_unexpected text[]; v_missing text[];
  v_parent_type text; v_parent_col text;
  v_owner_pat text := '%created_by = ( SELECT auth.uid()%';
BEGIN
  v_tbl := to_regclass(format('%I.%I',p_schema,p_table));
  IF v_tbl IS NULL THEN
    check_name:='table_exists'; status:='FAIL'; detail:='table not found'; RETURN NEXT; RETURN;
  END IF;

  SELECT relkind INTO v_relkind FROM pg_class WHERE oid=v_tbl;
  IF v_relkind NOT IN ('r','p') THEN
    check_name:='relation_kind'; status:='SKIP';
    detail:=format('%s — base contract not applicable; access follows the underlying query',
                   CASE v_relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE 'relkind '||v_relkind::text END);
    RETURN NEXT; RETURN;
  END IF;

  SELECT COALESCE(is_component,false),COALESCE(has_soft_delete,false),COALESCE(is_versioned,false),COALESCE(is_listed,false),rls_variant,
         COALESCE(version_store,'history'),version_store_ref
    INTO v_is_component,v_soft_delete,v_is_versioned,v_is_listed,v_reg_variant,v_vstore,v_vstore_ref
    FROM platform.entity_types WHERE token=p_token;
  v_variant := COALESCE(p_variant, v_reg_variant, CASE WHEN v_is_component THEN 'component' ELSE 'entity' END);
  v_shareable := EXISTS(SELECT 1 FROM platform.shareable_resource_registry WHERE resource_type=p_token AND is_active);

  SELECT
    bool_or(column_name='id' AND data_type='uuid'), bool_or(column_name='id'),
    bool_or(column_name='organization_id'), bool_or(column_name='organization_id' AND is_nullable='NO'),
    bool_or(column_name='created_by'), bool_or(column_name='updated_by'),
    bool_or(column_name='created_at' AND is_nullable='NO'), bool_or(column_name='updated_at' AND is_nullable='NO'),
    bool_or(column_name='deleted_at'),
    bool_or(column_name='version' AND data_type='integer' AND is_nullable='NO'),
    bool_or(column_name='metadata' AND data_type='jsonb' AND is_nullable='NO'),
    bool_or(column_name='visibility'),
    bool_or(column_name='visibility' AND udt_schema='platform' AND udt_name='visibility'),
    bool_or(column_name='visibility' AND udt_schema='platform' AND udt_name='visibility' AND is_nullable='NO'),
    bool_or(column_name IN ('user_id','owner_id','author_id','creator_id')),
    bool_or(column_name='org_id'), bool_or(column_name='is_deleted'), bool_or(column_name='is_public')
  INTO f_id_uuid,f_id,f_org,f_org_nn,f_cb,f_ub,f_ca_nn,f_ua_nn,f_del,f_ver,f_meta,
       f_vis,f_vis_enum,f_vis_nn,l_owner,l_orgid,l_isdel,l_ispub
  FROM information_schema.columns WHERE table_schema=p_schema AND table_name=p_table;

  SELECT
    EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE c.conrelid=v_tbl AND c.contype='f' AND a.attname='organization_id' AND c.confrelid='iam.organizations'::regclass),
    EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE c.conrelid=v_tbl AND c.contype='f' AND a.attname='created_by' AND c.confrelid='auth.users'::regclass),
    EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
            WHERE c.conrelid=v_tbl AND c.contype='f' AND a.attname='updated_by' AND c.confrelid='auth.users'::regclass)
  INTO fk_org,fk_cb,fk_ub;

  SELECT COALESCE(bool_or(pr.proname='_stamp_actor'),false),COALESCE(bool_or(pr.proname='_touch_row'),false),
         COALESCE(bool_or(pr.proname='_version_capture'),false)
    INTO t_stamp,t_touch,t_hist
  FROM pg_trigger tg JOIN pg_proc pr ON pr.oid=tg.tgfoid WHERE tg.tgrelid=v_tbl AND NOT tg.tgisinternal;

  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid=v_tbl;
  SELECT array_agg(polname) INTO v_polnames FROM pg_policy WHERE polrelid=v_tbl;
  SELECT pg_get_expr(polqual,polrelid) INTO v_sel FROM pg_policy WHERE polrelid=v_tbl AND polname='std_select';

  check_name:='entity_registered';
  IF EXISTS(SELECT 1 FROM platform.entity_types WHERE token=p_token AND schema_name=p_schema AND table_name=p_table)
    THEN status:='PASS'; detail:=v_variant; ELSE status:='FAIL'; detail:=format('no entity_types row for token=%s at %s.%s',p_token,p_schema,p_table); END IF; RETURN NEXT;

  check_name:='base_id_uuid'; status:=CASE WHEN f_id_uuid THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN f_id_uuid THEN NULL WHEN f_id THEN 'id not uuid' ELSE 'missing id' END; RETURN NEXT;
  check_name:='base_organization_id'; status:=CASE WHEN f_org THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_org THEN NULL ELSE 'missing organization_id' END; RETURN NEXT;
  check_name:='base_org_not_null'; status:=CASE WHEN NOT f_org THEN 'SKIP' WHEN f_org_nn THEN 'PASS' ELSE 'FAIL' END;
    detail:=CASE WHEN f_org AND NOT f_org_nn THEN 'organization_id must be NOT NULL' END; RETURN NEXT;
  check_name:='base_org_fk'; status:=CASE WHEN fk_org THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN fk_org THEN NULL ELSE 'organization_id missing FK -> iam.organizations' END; RETURN NEXT;
  check_name:='base_created_by'; status:=CASE WHEN f_cb THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_cb THEN NULL ELSE 'missing created_by' END; RETURN NEXT;
  check_name:='base_created_by_fk'; status:=CASE WHEN NOT f_cb THEN 'SKIP' WHEN fk_cb THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_cb AND NOT fk_cb THEN 'created_by missing FK -> auth.users' END; RETURN NEXT;
  check_name:='base_updated_by'; status:=CASE WHEN f_ub THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_ub THEN NULL ELSE 'missing updated_by' END; RETURN NEXT;
  check_name:='base_updated_by_fk'; status:=CASE WHEN NOT f_ub THEN 'SKIP' WHEN fk_ub THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_ub AND NOT fk_ub THEN 'updated_by missing FK -> auth.users' END; RETURN NEXT;
  check_name:='base_created_at'; status:=CASE WHEN f_ca_nn THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_ca_nn THEN NULL ELSE 'missing/nullable created_at' END; RETURN NEXT;
  check_name:='base_updated_at'; status:=CASE WHEN f_ua_nn THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_ua_nn THEN NULL ELSE 'missing/nullable updated_at' END; RETURN NEXT;
  check_name:='base_version'; status:=CASE WHEN f_ver THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_ver THEN NULL ELSE 'missing version int NOT NULL' END; RETURN NEXT;
  check_name:='base_metadata'; status:=CASE WHEN f_meta THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_meta THEN NULL ELSE 'missing metadata jsonb NOT NULL' END; RETURN NEXT;

  check_name:='soft_delete';
  IF v_soft_delete THEN status:=CASE WHEN f_del THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_del THEN NULL ELSE 'has_soft_delete=true but no deleted_at' END;
  ELSE status:=CASE WHEN f_del THEN 'PASS' ELSE 'WARN' END; detail:=CASE WHEN f_del THEN NULL ELSE 'no deleted_at (has_soft_delete=false)' END; END IF; RETURN NEXT;

  check_name:='trg_stamp_actor'; status:=CASE WHEN t_stamp THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN t_stamp THEN NULL ELSE 'missing _stamp_actor trigger' END; RETURN NEXT;
  check_name:='trg_touch_row'; status:=CASE WHEN t_touch THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN t_touch THEN NULL ELSE 'missing _touch_row trigger' END; RETURN NEXT;

  check_name:='trg_version_capture';
  IF v_is_versioned AND v_vstore='custom' THEN
    -- CERTIFIED CUSTOM VERSION STORE (Arman-ratified 2026-08-12): the entity's versioning IS
    -- its declared store (e.g. a publication table product rows FK-pin). Requirements:
    IF t_hist THEN
      status:='FAIL'; detail:='DUPLICATE VERSIONING: version_store=custom but _version_capture also attached — an entity has exactly one versioning system';
    ELSIF v_vstore_ref IS NULL THEN
      status:='FAIL'; detail:='version_store=custom but version_store_ref is NULL';
    ELSE
      SELECT c.relkind INTO v_store_kind FROM pg_class c WHERE c.oid=v_vstore_ref;
      SELECT et.token INTO v_store_token FROM platform.entity_types et WHERE et.table_ref=v_vstore_ref AND et.is_active LIMIT 1;
      SELECT er.fk_column INTO v_store_fk FROM platform.entity_relationships er
        WHERE er.child_type=v_store_token AND er.parent_type=p_token AND er.kind='composition' LIMIT 1;
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger tg JOIN pg_proc pr ON pr.oid=tg.tgfoid
        WHERE tg.tgrelid=v_tbl AND NOT tg.tgisinternal
          AND pr.prosrc ILIKE '%'||v_vstore_ref::text||'%'
      ) INTO v_store_trig;
      SELECT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid=v_vstore_ref AND i.indisunique
          AND v_store_fk = ANY (SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=v_vstore_ref AND a.attnum = ANY(i.indkey))
          AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=v_vstore_ref AND a.attnum = ANY(i.indkey) AND a.attname ILIKE '%version%')
      ) INTO v_store_uq;
      IF v_store_kind IS DISTINCT FROM 'r' THEN status:='FAIL'; detail:=format('custom store %s is not a plain table',v_vstore_ref::text);
      ELSIF v_store_token IS NULL THEN status:='FAIL'; detail:=format('custom store %s is not an active registered entity',v_vstore_ref::text);
      ELSIF v_store_fk IS NULL THEN status:='FAIL'; detail:=format('custom store token %s has no composition edge to %s',v_store_token,p_token);
      ELSIF NOT v_store_trig THEN status:='FAIL'; detail:=format('no automatic capture trigger on %s.%s writing %s',p_schema,p_table,v_vstore_ref::text);
      ELSIF NOT v_store_uq THEN status:='FAIL'; detail:=format('custom store %s lacks UNIQUE(%s, <version column>)',v_vstore_ref::text,v_store_fk);
      ELSE status:='PASS'; detail:=format('certified custom version store: %s',v_vstore_ref::text);
      END IF;
    END IF;
  ELSIF v_is_versioned THEN
    status:=CASE WHEN t_hist THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN t_hist THEN NULL ELSE 'is_versioned=true but no _version_capture trigger' END;
  ELSE
    status:=CASE WHEN t_hist THEN 'WARN' ELSE 'SKIP' END; detail:=CASE WHEN t_hist THEN '_version_capture present but is_versioned=false' ELSE 'not versioned' END;
  END IF; RETURN NEXT;

  check_name:='visibility';
  IF f_vis AND NOT f_vis_enum THEN status:='FAIL'; detail:='visibility not platform.visibility enum (free-text kill)';
  ELSIF f_vis_enum THEN status:=CASE WHEN f_vis_nn THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN f_vis_nn THEN NULL ELSE 'visibility must be NOT NULL' END;
  ELSIF v_variant='component' THEN status:='SKIP'; detail:='component inherits parent access';
  ELSIF v_is_listed OR v_shareable THEN status:='FAIL'; detail:='listed/shareable entity requires visibility enum';
  ELSE status:='WARN'; detail:='no visibility enum (add + migrate is_public)'; END IF; RETURN NEXT;

  check_name:='legacy_org_id'; status:=CASE WHEN l_orgid THEN 'FAIL' ELSE 'PASS' END; detail:=CASE WHEN l_orgid THEN 'legacy org_id present; drop it' END; RETURN NEXT;
  check_name:='legacy_owner_col'; status:=CASE WHEN l_owner THEN 'WARN' ELSE 'PASS' END; detail:=CASE WHEN l_owner THEN 'user_id/owner_id/author_id/creator_id present; created_by is canonical owner' END; RETURN NEXT;
  check_name:='legacy_is_public'; status:=CASE WHEN l_ispub THEN 'WARN' ELSE 'PASS' END; detail:=CASE WHEN l_ispub THEN 'is_public present; visibility is the access driver' END; RETURN NEXT;
  check_name:='legacy_is_deleted'; status:=CASE WHEN l_isdel THEN 'WARN' ELSE 'PASS' END; detail:=CASE WHEN l_isdel THEN 'is_deleted present; deleted_at is canonical' END; RETURN NEXT;

  check_name:='rls_enabled'; status:=CASE WHEN v_rls THEN 'PASS' ELSE 'FAIL' END; detail:=NULL; RETURN NEXT;

  IF v_variant='ledger' THEN v_expected:=ARRAY['svc_all','std_select'];
  ELSE v_expected:=ARRAY['svc_all','std_select','std_insert','std_update','std_delete'];
       IF v_variant IN ('entity','system') AND f_vis_enum THEN v_expected:=array_append(v_expected,'pub_read'); END IF; END IF;
  v_unexpected:=ARRAY(SELECT unnest(COALESCE(v_polnames,'{}')) EXCEPT SELECT unnest(v_expected));
  v_missing:=ARRAY(SELECT unnest(v_expected) EXCEPT SELECT unnest(COALESCE(v_polnames,'{}')));
  check_name:='policies_canonical';
  IF v_missing='{}' AND v_unexpected='{}' THEN status:='PASS'; detail:=NULL; ELSE status:='FAIL'; detail:=format('missing=%s legacy/unexpected=%s',v_missing,v_unexpected); END IF; RETURN NEXT;

  IF v_variant IN ('entity','system') THEN
    check_name:='policy_owner_shortcircuit'; status:=CASE WHEN v_sel LIKE v_owner_pat THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_sel LIKE v_owner_pat THEN NULL ELSE 'std_select missing created_by short-circuit (42501 risk)' END; RETURN NEXT;
    check_name:='policy_uses_has_access'; status:=CASE WHEN v_sel LIKE '%has_access('''||p_token||'''%' THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_sel LIKE '%has_access('''||p_token||'''%' THEN NULL ELSE format('std_select does not call has_access(%L)',p_token) END; RETURN NEXT;
    check_name:='pub_read_anon';
      IF f_vis_enum THEN status:=CASE WHEN 'pub_read'=ANY(v_polnames) THEN 'PASS' ELSE 'FAIL' END; detail:=CASE WHEN 'pub_read'=ANY(v_polnames) THEN NULL ELSE 'missing anon visibility=public policy' END;
      ELSE status:='SKIP'; detail:='no visibility column'; END IF; RETURN NEXT;
    IF v_variant='system' THEN
      check_name:='policy_system_public_read'; status:=CASE WHEN v_sel LIKE '%visibility = ''public''%' THEN 'PASS' ELSE 'FAIL' END;
        detail:=CASE WHEN v_sel LIKE '%visibility = ''public''%' THEN NULL ELSE 'system variant std_select must pass visibility=public (authenticated catalog reads)' END; RETURN NEXT;
    END IF;
  ELSIF v_variant='component' THEN
    SELECT parent_type,fk_column INTO v_parent_type,v_parent_col FROM platform.entity_relationships WHERE child_type=p_token AND kind='composition' LIMIT 1;
    check_name:='composition_parent'; status:=CASE WHEN v_parent_type IS NOT NULL THEN 'PASS' ELSE 'FAIL' END; detail:=COALESCE(v_parent_type,'no composition edge'); RETURN NEXT;
    check_name:='policy_defers_parent'; status:=CASE WHEN v_parent_type IS NOT NULL AND (v_sel LIKE '%has_access('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||p_token||'''%') THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_parent_type IS NOT NULL AND (v_sel LIKE '%has_access('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||v_parent_type||'''%' OR v_sel LIKE '%accessible_entity_ids('''||p_token||'''%') THEN NULL ELSE 'std_select must defer to composition parent' END; RETURN NEXT;
  END IF;

  SELECT resource_type INTO v_reg_rt FROM platform.shareable_resource_registry WHERE table_name=p_table AND schema_name=p_schema AND is_active LIMIT 1;
  check_name:='sharing_token';
  IF v_reg_rt IS NULL THEN status:='SKIP'; detail:='not in shareable_resource_registry';
  ELSIF v_reg_rt=p_token THEN status:='PASS'; detail:=NULL;
  ELSE status:='FAIL'; detail:=format('registry resource_type=%s != token=%s',v_reg_rt,p_token); END IF; RETURN NEXT;
END;
$function$
;
