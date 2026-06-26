-- iam_verify_canonical.sql
-- ---------------------------------------------------------------------------
-- The objective "is this table canonical?" gate — the keystone for parallelizing
-- the sweep. Maps the canonical checklist to catalog queries (no data mutation,
-- safe to run anywhere, doubles as the drift cron). Each check returns
-- PASS / WARN / FAIL / SKIP. Encodes the real bugs we hit:
--   • missing owner short-circuit in std_select  -> INSERT...RETURNING 42501
--   • std_select not calling has_access(<token>)  -> dead policy
--   • registry resource_type != entity token      -> grants silently ignored
--   • is_public/is_deleted/user_id legacy access drivers
--
-- Usage:
--   select * from iam.verify_canonical('public','notes','note');   -- detail rows
--   select iam.verify_canonical_ok('public','notes','note');       -- boolean gate
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION iam.verify_canonical(
  p_schema text, p_table text, p_token text, p_variant text DEFAULT NULL)
RETURNS TABLE(check_name text, status text, detail text)
LANGUAGE plpgsql STABLE
AS $function$
DECLARE
  v_is_component boolean;
  v_variant text;
  v_has_created boolean; v_has_org boolean; v_has_vis boolean; v_has_del boolean;
  v_has_created_at boolean; v_has_updated_at boolean; v_has_version boolean;
  v_has_userid boolean; v_has_ispublic boolean; v_has_isdeleted boolean;
  v_tbl regclass;
  v_rls boolean;
  v_polnames text[];
  v_sel text; v_upd text;
  v_reg_rt text;
  v_parent_type text; v_parent_col text;
  v_expected text[]; v_unexpected text[]; v_missing text[];
  v_owner_pat text := '%created_by = ( SELECT auth.uid()%';
BEGIN
  v_tbl := to_regclass(format('%I.%I', p_schema, p_table));
  IF v_tbl IS NULL THEN
    check_name:='table_exists'; status:='FAIL'; detail:='table not found'; RETURN NEXT; RETURN;
  END IF;

  SELECT COALESCE(is_component,false) INTO v_is_component FROM platform.entity_types WHERE token=p_token;
  v_variant := COALESCE(p_variant, CASE WHEN v_is_component THEN 'component' ELSE 'entity' END);

  SELECT
    bool_or(column_name='created_by'), bool_or(column_name='organization_id'),
    bool_or(column_name='visibility'), bool_or(column_name='deleted_at'),
    bool_or(column_name='created_at'), bool_or(column_name='updated_at'),
    bool_or(column_name='version'),
    bool_or(column_name in ('user_id','owner_id','author_id','creator_id')),
    bool_or(column_name='is_public'), bool_or(column_name='is_deleted')
  INTO v_has_created,v_has_org,v_has_vis,v_has_del,v_has_created_at,v_has_updated_at,
       v_has_version,v_has_userid,v_has_ispublic,v_has_isdeleted
  FROM information_schema.columns WHERE table_schema=p_schema AND table_name=p_table;

  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid=v_tbl;
  SELECT array_agg(polname) INTO v_polnames FROM pg_policy WHERE polrelid=v_tbl;
  SELECT pg_get_expr(polqual,polrelid) INTO v_sel FROM pg_policy WHERE polrelid=v_tbl AND polname='std_select';
  SELECT pg_get_expr(polqual,polrelid) INTO v_upd FROM pg_policy WHERE polrelid=v_tbl AND polname='std_update';

  -- registry
  check_name:='entity_registered';
  IF EXISTS(SELECT 1 FROM platform.entity_types WHERE token=p_token AND schema_name=p_schema AND table_name=p_table)
    THEN status:='PASS'; detail:=v_variant;
    ELSE status:='FAIL'; detail:=format('no entity_types row for token=%s at %s.%s',p_token,p_schema,p_table); END IF;
  RETURN NEXT;

  check_name:='rls_enabled'; status:=CASE WHEN v_rls THEN 'PASS' ELSE 'FAIL' END; detail:=NULL; RETURN NEXT;

  -- canonical policy set (no legacy leftovers, nothing missing)
  IF v_variant='ledger' THEN v_expected := ARRAY['svc_all','std_select'];
  ELSE v_expected := ARRAY['svc_all','std_select','std_insert','std_update','std_delete'];
       IF v_variant='entity' AND v_has_vis THEN v_expected := array_append(v_expected,'pub_read'); END IF;
  END IF;
  v_unexpected := ARRAY(SELECT unnest(COALESCE(v_polnames,'{}')) EXCEPT SELECT unnest(v_expected));
  v_missing    := ARRAY(SELECT unnest(v_expected) EXCEPT SELECT unnest(COALESCE(v_polnames,'{}')));
  check_name:='policies_canonical';
  IF v_missing='{}' AND v_unexpected='{}' THEN status:='PASS'; detail:=NULL;
  ELSE status:='FAIL'; detail:=format('missing=%s legacy/unexpected=%s', v_missing, v_unexpected); END IF;
  RETURN NEXT;

  IF v_variant='entity' THEN
    check_name:='col_created_by'; status:=CASE WHEN v_has_created THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_has_created THEN NULL ELSE 'missing created_by' END; RETURN NEXT;
    check_name:='col_organization_id'; status:=CASE WHEN v_has_org THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_has_org THEN NULL ELSE 'missing organization_id' END; RETURN NEXT;
    check_name:='col_visibility'; status:=CASE WHEN v_has_vis THEN 'PASS' ELSE 'WARN' END;
      detail:=CASE WHEN v_has_vis THEN NULL ELSE 'no visibility enum (add + migrate is_public)' END; RETURN NEXT;
    check_name:='soft_delete'; status:=CASE WHEN v_has_del THEN 'PASS' WHEN v_has_isdeleted THEN 'WARN' ELSE 'WARN' END;
      detail:=CASE WHEN v_has_del THEN NULL WHEN v_has_isdeleted THEN 'is_deleted present; migrate to deleted_at' ELSE 'no deleted_at' END; RETURN NEXT;
    check_name:='timestamps'; status:=CASE WHEN v_has_created_at AND v_has_updated_at THEN 'PASS' ELSE 'FAIL' END; detail:=NULL; RETURN NEXT;
    check_name:='legacy_owner_col'; status:=CASE WHEN v_has_userid THEN 'WARN' ELSE 'PASS' END;
      detail:=CASE WHEN v_has_userid THEN 'user_id/owner_id present; created_by is canonical owner' ELSE NULL END; RETURN NEXT;
    check_name:='legacy_is_public'; status:=CASE WHEN v_has_ispublic THEN 'WARN' ELSE 'PASS' END;
      detail:=CASE WHEN v_has_ispublic THEN 'is_public present; visibility is the access driver' ELSE NULL END; RETURN NEXT;

    check_name:='policy_owner_shortcircuit';
      status:=CASE WHEN v_sel LIKE v_owner_pat THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_sel LIKE v_owner_pat THEN NULL ELSE 'std_select missing created_by short-circuit (INSERT...RETURNING 42501)' END; RETURN NEXT;
    check_name:='policy_uses_has_access';
      status:=CASE WHEN v_sel LIKE '%has_access(''' || p_token || '''%' THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_sel LIKE '%has_access(''' || p_token || '''%' THEN NULL ELSE format('std_select does not call has_access(%L)',p_token) END; RETURN NEXT;
    check_name:='pub_read_anon';
      IF v_has_vis THEN status:=CASE WHEN 'pub_read'=ANY(v_polnames) THEN 'PASS' ELSE 'FAIL' END;
        detail:=CASE WHEN 'pub_read'=ANY(v_polnames) THEN NULL ELSE 'missing anon visibility=public policy' END;
      ELSE status:='SKIP'; detail:='no visibility column'; END IF; RETURN NEXT;

  ELSIF v_variant='component' THEN
    SELECT parent_type, fk_column INTO v_parent_type, v_parent_col
      FROM platform.entity_relationships WHERE child_type=p_token AND kind='composition' LIMIT 1;
    check_name:='composition_parent'; status:=CASE WHEN v_parent_type IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;
      detail:=COALESCE(v_parent_type,'no composition edge in entity_relationships'); RETURN NEXT;
    check_name:='policy_defers_parent';
      status:=CASE WHEN v_parent_type IS NOT NULL AND v_sel LIKE '%has_access(''' || v_parent_type || '''%' THEN 'PASS' ELSE 'FAIL' END;
      detail:=CASE WHEN v_parent_type IS NOT NULL AND v_sel LIKE '%has_access(''' || v_parent_type || '''%' THEN NULL ELSE 'std_select must defer to composition parent' END; RETURN NEXT;
  END IF;

  -- sharing token consistency (only if the table is shareable)
  SELECT resource_type INTO v_reg_rt FROM public.shareable_resource_registry
    WHERE table_name=p_table AND is_active LIMIT 1;
  check_name:='sharing_token';
  IF v_reg_rt IS NULL THEN status:='SKIP'; detail:='not in shareable_resource_registry';
  ELSIF v_reg_rt=p_token THEN status:='PASS'; detail:=NULL;
  ELSE status:='FAIL'; detail:=format('registry resource_type=%s != entity token=%s', v_reg_rt, p_token); END IF;
  RETURN NEXT;
END;
$function$;

-- boolean gate for agents / orchestrator: true iff no FAIL rows
CREATE OR REPLACE FUNCTION iam.verify_canonical_ok(
  p_schema text, p_table text, p_token text, p_variant text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM iam.verify_canonical(p_schema, p_table, p_token, p_variant) WHERE status='FAIL'
  );
$function$;
