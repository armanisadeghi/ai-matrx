-- Component reads must filter through their structural parents. Building an
-- array of every accessible child id makes telemetry/fact tables unreadable:
-- seo.search_performance_daily alone has ~13M rows.
--
-- Keep iam.apply_rls as the single policy generator. This migration performs
-- an exact, fail-loud source rewrite against the currently deployed D181
-- definition, then repairs the four proven high-volume policies in place so
-- bespoke policies on those tables remain untouched.

DO $migration$
DECLARE
  v_oid oid := 'iam.apply_rls(text,text,text,text)'::regprocedure::oid;
  v_def text := pg_get_functiondef(v_oid);
  v_old text;
  v_new text;
BEGIN
  v_old := '  v_parent_expr_edit text := '''';';
  v_new := v_old || E'\n  v_parent_expr_view text := '''';';
  IF strpos(v_def, v_old) = 0 THEN
    RAISE EXCEPTION 'iam.apply_rls declaration drifted; structural-parent RLS migration cannot apply safely';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  v_old := $old$      v_parent_expr_edit := v_parent_expr_edit
        || case when v_parent_expr_edit = '' then '' else ' or ' end
        || format(
          '%I in (select unnest(iam.accessible_entity_ids(%L, ''editor''::public.permission_level)))',
          rec.fk_column, rec.parent_type
        );$old$;
  v_new := v_old || $new$
      v_parent_expr_view := v_parent_expr_view
        || case when v_parent_expr_view = '' then '' else ' or ' end
        || format(
          '%I in (select unnest(iam.accessible_entity_ids(%L, ''viewer''::public.permission_level)))',
          rec.fk_column, rec.parent_type
        );$new$;
  IF strpos(v_def, v_old) = 0 THEN
    RAISE EXCEPTION 'iam.apply_rls parent loop drifted; structural-parent RLS migration cannot apply safely';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  v_old := $old$    -- SELECT/UPDATE/DELETE resolve the CHILD token once per statement. That
    -- includes direct grants on shareable components plus every parent lane.
    -- The owner arm MUST lead: accessible_entity_ids is STABLE (statement
    -- snapshot) and can never contain the row being inserted, so without a
    -- row-local arm every INSERT…RETURNING fails 42501 (D181, db-rules §6d).
    if v_has_created then
      execute format(
        'create policy std_select on %s for select to authenticated using ('
        || 'created_by = (select auth.uid()) or '
        || 'id in (select unnest(iam.accessible_entity_ids(%L, ''viewer''::public.permission_level))))',
        v_tbl, p_token
      );
    else
      execute format(
        'create policy std_select on %s for select to authenticated using ('
        || 'id in (select unnest(iam.accessible_entity_ids(%L, ''viewer''::public.permission_level))))',
        v_tbl, p_token
      );
    end if;$old$;
  v_new := $new$    -- Component reads resolve the small PARENT id sets, then let the
    -- caller's row predicate use the child's indexed foreign keys. Resolving
    -- the CHILD token here materializes every accessible child id and is
    -- catastrophic for fact tables. Components are structural, non-listed
    -- records; direct sharing belongs on their parent entity.
    if v_has_created then
      execute format(
        'create policy std_select on %s for select to authenticated using ('
        || 'created_by = (select auth.uid()) or (%s))',
        v_tbl, v_parent_expr_view
      );
    else
      execute format(
        'create policy std_select on %s for select to authenticated using ((%s))',
        v_tbl, v_parent_expr_view
      );
    end if;$new$;
  IF strpos(v_def, v_old) = 0 THEN
    RAISE EXCEPTION 'iam.apply_rls component SELECT branch drifted; structural-parent RLS migration cannot apply safely';
  END IF;
  v_def := replace(v_def, v_old, v_new);
  EXECUTE v_def;
END
$migration$;

-- Repair only the proven class members. ALTER POLICY preserves svc_all and
-- any bespoke policies; the generator above prevents future regression.
ALTER POLICY std_select ON seo.search_performance_daily TO authenticated USING (
  created_by = (SELECT auth.uid())
  OR site_id IN (SELECT unnest(iam.accessible_entity_ids('web_site', 'viewer')))
  OR page_id IN (SELECT unnest(iam.accessible_entity_ids('web_page', 'viewer')))
  OR run_id IN (SELECT unnest(iam.accessible_entity_ids('seo_collection_run', 'viewer')))
);

ALTER POLICY std_select ON web.link_edge TO authenticated USING (
  created_by = (SELECT auth.uid())
  OR site_id IN (SELECT unnest(iam.accessible_entity_ids('web_site', 'viewer')))
  OR source_page_id IN (SELECT unnest(iam.accessible_entity_ids('web_page', 'viewer')))
  OR target_page_id IN (SELECT unnest(iam.accessible_entity_ids('web_page', 'viewer')))
  OR snapshot_id IN (SELECT unnest(iam.accessible_entity_ids('web_snapshot', 'viewer')))
);

ALTER POLICY std_select ON web.gsc_page_stat TO authenticated USING (
  created_by = (SELECT auth.uid())
  OR site_id IN (SELECT unnest(iam.accessible_entity_ids('web_site', 'viewer')))
  OR page_id IN (SELECT unnest(iam.accessible_entity_ids('web_page', 'viewer')))
);

ALTER POLICY std_select ON web.crawl_url TO authenticated USING (
  created_by = (SELECT auth.uid())
  OR site_id IN (SELECT unnest(iam.accessible_entity_ids('web_site', 'viewer')))
  OR page_id IN (SELECT unnest(iam.accessible_entity_ids('web_page', 'viewer')))
  OR discovered_from_page_id IN (SELECT unnest(iam.accessible_entity_ids('web_page', 'viewer')))
  OR session_id IN (SELECT unnest(iam.accessible_entity_ids('web_crawl_session', 'viewer')))
  OR snapshot_id IN (SELECT unnest(iam.accessible_entity_ids('web_snapshot', 'viewer')))
);

NOTIFY pgrst, 'reload schema';
