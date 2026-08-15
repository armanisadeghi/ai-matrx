-- D146 — hoist every per-row `iam.has_org_access(...)` out of the RLS scan path.
--
-- THE DEFECT
-- `iam.has_org_access(uuid)` is STABLE SECURITY DEFINER with `SET search_path`,
-- so the planner can neither inline nor hoist it: inside a policy's USING
-- clause it is CALLED ONCE PER CANDIDATE ROW. Past a few tens of thousands of
-- rows that exceeds the `authenticated` role's 8s statement_timeout and the
-- user gets a 57014 -> HTTP 500 that reads like an outage, not an empty result.
-- Proven live on seo.search_performance_daily: 16,497 ms -> ~200 ms after the
-- set-wise rewrite (migrations/seo_search_performance_daily_rls_set_based_org_lane.sql).
--
-- THE REWRITE, AND WHY IT IS EXACTLY EQUIVALENT
--   iam.has_org_access(o)          = EXISTS (SELECT 1 FROM iam.organization_member
--                                            WHERE organization_id = o
--                                              AND user_id = (SELECT auth.uid()))
--   iam.has_org_access_for(u, o)   = EXISTS (SELECT 1 FROM iam.organization_member
--                                            WHERE organization_id = o AND user_id = u)
--   iam.my_orgs()                  = SELECT organization_id FROM iam.organization_member
--                                            WHERE user_id = (SELECT auth.uid())
-- All three read the SAME relation — `iam.organization_member`, itself a view
-- over `iam.memberships` filtered to container_type='organization',
-- status='active', deleted_at IS NULL. So for every non-null o:
--       iam.has_org_access(o)  <->  o IN (SELECT iam.my_orgs())
-- `has_org_access_for((select auth.uid()), o)` is the 1-arg form spelled out and
-- collapses to the same IN.
--
-- THE ONE ASYMMETRY, AND WHY EVERY REWRITE BELOW CARRIES AN `IS NOT NULL` GUARD.
-- For o IS NULL the function returns FALSE, while `NULL IN (<non-empty set>)`
-- returns NULL. A WHERE/RLS predicate rejects the row either way, and every
-- occurrence here sits in a plain positive filter position (no NOT, no
-- IS NOT TRUE), so the ADMITTED ROW SET is identical regardless — measured live:
-- on iam.permissions (100 of 109 rows carry a NULL granted_to_organization_id)
-- the unguarded rewrite differed from the original on all 100 under a strict
-- three-valued comparison and on ZERO under the admits-this-row comparison.
-- Relying on that is still relying on NULL and FALSE staying interchangeable in
-- every future context this predicate is read in, which is not a promise worth
-- making about a security predicate. So each top-level org lane is written
--       o IS NOT NULL AND o IN (SELECT iam.my_orgs())
-- which returns FALSE exactly where the original did. The two predicates are
-- then identical in all THREE truth values, not merely in which rows they admit
-- (re-measured: strict differences drop to 0). A NULL test costs nothing and it
-- removes the question. Inside an EXISTS the guard is unnecessary — EXISTS
-- already counts only TRUE rows — and those lanes measured strictly identical
-- unguarded, so they are left alone.
--
-- Being UNCORRELATED, `o IN (SELECT iam.my_orgs())` plans as a hashed SubPlan
-- evaluated ONCE per query rather than once per row.
--
-- SCOPE — 34 policies, every non-INSERT policy in the database that named
-- `iam.has_org_access` / `iam.has_org_access_for` (live census 2026-08-15).
-- The other 150 occurrences are `std_insert` WITH CHECK clauses; a WITH CHECK
-- runs once per INSERTED row, never over a scan, so they cannot produce this
-- timeout and are deliberately untouched (rewriting them would mean
-- regenerating 150 tables for no read-path gain).
--
-- GENERATOR OWNERSHIP
-- Only ONE of these 34 shapes is emitted by `iam.apply_rls`: the `ledger`
-- variant's std_select. That line is fixed in the generator below (v4) and
-- platform.activity_log is then regenerated through it, so the generator and
-- the live policy stay in agreement. Every other policy here is BESPOKE — a
-- deliberate org-member read lane that the entity/component/system/ledger
-- variants do not express. Running `iam.apply_rls` over those tables would
-- REPLACE the org lane with the owner-or-`has_access` lane and lock out org
-- members who can read their org's rows today, which is the over-tightening
-- §6 THE SECURITY PHILOSOPHY calls a defect. They are therefore hoisted in
-- place, predicate-for-predicate, with nothing else changed: same policy name,
-- same command, same roles, same PERMISSIVE-ness, same surrounding clauses.
--
-- Idempotent: every statement is DROP POLICY IF EXISTS + CREATE POLICY, and the
-- generator is CREATE OR REPLACE.

-- =====================================================================
-- 1. THE GENERATOR — iam.apply_rls v4: ledger std_select goes set-wise.
--    Identical to v3 in every other line (component ownership law, D182/D183
--    structural-parent component SELECT, variant-keyed grants, the D119
--    governance-column tier) — only the `ledger` branch changes.
-- =====================================================================

CREATE OR REPLACE FUNCTION iam.apply_rls(p_schema text, p_table text, p_token text, p_variant text DEFAULT 'entity'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_tbl text := format('%I.%I', p_schema, p_table);
  v_is_component boolean;
  v_has_created boolean;
  v_has_org boolean;
  v_has_del boolean;
  v_has_vis boolean;
  v_delpfx text := '';
  v_parent_expr_edit text := '';
  v_parent_expr_view text := '';
  v_parent_count integer := 0;
  rec record;
  pol record;
begin
  select coalesce(is_component, false) into v_is_component
  from platform.entity_types where token = p_token;

  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='created_by') into v_has_created;
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='organization_id') into v_has_org;
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='deleted_at') into v_has_del;
  select exists (select 1 from information_schema.columns
    where table_schema=p_schema and table_name=p_table and column_name='visibility') into v_has_vis;
  v_delpfx := case when v_has_del then 'deleted_at is null and ' else '' end;

  execute format('alter table %s enable row level security', v_tbl);
  for pol in select polname from pg_policy where polrelid = v_tbl::regclass loop
    execute format('drop policy %I on %s', pol.polname, v_tbl);
  end loop;
  execute format(
    'create policy svc_all on %s for all to service_role using (true) with check (true)', v_tbl);

  if p_variant = 'ledger' then
    -- SET-WISE ORG LANE (D146). `organization_id in (select iam.my_orgs())` is
    -- the identical predicate to `iam.has_org_access(organization_id)` (both
    -- read iam.organization_member for auth.uid()), but it is uncorrelated, so
    -- it is evaluated ONCE per query instead of once per candidate row. A
    -- ledger is by definition the biggest table in its feature — this is the
    -- variant where the per-row definer call is guaranteed to bite.
    execute format(
      'create policy std_select on %s for select to authenticated using (organization_id is not null and organization_id in (select iam.my_orgs()))',
      v_tbl);
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    perform iam.drop_governance_guard(p_schema, p_table);
    return;
  end if;

  -- ======================= COMPONENT =======================
  -- Access IS the parent's. No created_by clause is emitted here, ever.
  if v_is_component or p_variant = 'component' then
    for rec in
      select er.parent_type, er.fk_column
      from platform.entity_relationships er
      where er.child_type = p_token and er.kind = 'composition'
      order by er.parent_type, er.fk_column
    loop
      v_parent_count := v_parent_count + 1;
      v_parent_expr_edit := v_parent_expr_edit
        || case when v_parent_expr_edit = '' then '' else ' or ' end
        || format('%I in (select unnest(iam.accessible_entity_ids(%L, ''editor''::public.permission_level)))',
                  rec.fk_column, rec.parent_type);
      v_parent_expr_view := v_parent_expr_view
        || case when v_parent_expr_view = '' then '' else ' or ' end
        || format('%I in (select unnest(iam.accessible_entity_ids(%L, ''viewer''::public.permission_level)))',
                  rec.fk_column, rec.parent_type);
    end loop;

    if v_parent_count = 0 then
      raise exception
        'apply_rls: component % has no composition parent in platform.entity_relationships', p_token;
    end if;

    -- Reads resolve the SMALL parent id sets, then the caller's row predicate
    -- uses the child's indexed foreign keys. Never resolve the CHILD token as a
    -- set — that materializes every accessible child id (D183).
    execute format(
      'create policy std_select on %s for select to authenticated using ((%s) or iam.has_access(%L, id, ''viewer''))',
      v_tbl, v_parent_expr_view, p_token);

    -- A new row cannot have a direct grant yet, so INSERT must be authorized
    -- through a structural parent. No orphan/created_by lane: a component with
    -- no parent is not a component.
    execute format(
      'create policy std_insert on %s for insert to authenticated with check (%s)',
      v_tbl, v_parent_expr_edit);

    execute format(
      'create policy std_update on %s for update to authenticated using ((%s) or iam.has_access(%L, id, ''editor'')) '
      || 'with check ((%s) or iam.has_access(%L, id, ''editor''))',
      v_tbl, v_parent_expr_edit, p_token, v_parent_expr_edit, p_token);

    execute format(
      'create policy std_delete on %s for delete to authenticated using ((%s) or iam.has_access(%L, id, ''editor''))',
      v_tbl, v_parent_expr_edit, p_token);

    perform iam.apply_table_grants(p_schema, p_table, 'component');
    -- A component has no owner column and no visibility of its own: its access
    -- IS its parent's (THE COMPONENT OWNERSHIP LAW). There is nothing to govern
    -- here, so the governance-column tier deliberately does not apply.
    perform iam.drop_governance_guard(p_schema, p_table);
    return;
  end if;

  -- ======================= ENTITY FAMILY =======================
  -- Here `created_by` IS the owner, and that is exactly why it is an access key.
  if not v_has_created then
    raise exception
      'apply_rls: standard entity %.% lacks created_by — base-retrofit it before applying canonical RLS',
      p_schema, p_table;
  end if;
  if not v_has_org then
    raise exception
      'apply_rls: standard entity %.% lacks organization_id — base-retrofit it before applying canonical RLS',
      p_schema, p_table;
  end if;

  if p_variant = 'restricted' then
    execute format(
      'create policy std_select on %s for select to authenticated using (%s(created_by = (select auth.uid()) or public.is_super_admin()))',
      v_tbl, v_delpfx);
    if v_has_vis then
      execute format('create policy pub_read on %s for select to anon using (%s visibility = ''public'')',
        v_tbl, v_delpfx);
    end if;
    execute format(
      'create policy std_insert on %s for insert to authenticated with check (created_by = (select auth.uid()) and (public.is_super_admin() or organization_id is null or iam.has_org_access(organization_id)))',
      v_tbl);
    execute format(
      'create policy std_update on %s for update to authenticated using (created_by = (select auth.uid()) or public.is_super_admin()) with check (created_by = (select auth.uid()) or public.is_super_admin())',
      v_tbl);
    execute format(
      'create policy std_delete on %s for delete to authenticated using (created_by = (select auth.uid()) or public.is_super_admin())',
      v_tbl);
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
    -- `restricted` is already owner-or-super-admin on UPDATE — the whole row is
    -- governed, so a per-column tier would be redundant.
    perform iam.drop_governance_guard(p_schema, p_table);
    return;
  end if;

  if p_variant = 'system' then
    if not v_has_vis then
      raise exception 'apply_rls: system variant on %.% requires a visibility column', p_schema, p_table;
    end if;
    execute format(
      'create policy std_select on %s for select to authenticated using ((visibility = ''public'' or created_by = (select auth.uid()) or iam.has_access(%L, id, ''viewer'')))',
      v_tbl, p_token);
  else
    execute format(
      'create policy std_select on %s for select to authenticated using ((created_by = (select auth.uid()) or iam.has_access(%L, id, ''viewer'')))',
      v_tbl, p_token);
  end if;

  if v_has_vis then
    execute format('create policy pub_read on %s for select to anon using (%s visibility = ''public'')',
      v_tbl, v_delpfx);
  end if;
  -- NOTE (D146): the INSERT lanes below keep `iam.has_org_access(...)`. A WITH
  -- CHECK is evaluated once per INSERTED row, never across a scan, so the
  -- per-row-definer timeout class does not reach them.
  execute format(
    'create policy std_insert on %s for insert to authenticated with check (created_by = (select auth.uid()) and (organization_id is null or iam.has_org_access(organization_id) or (organization_id in (select organization_id from iam.system_orgs where global_readable) and public.is_super_admin())))',
    v_tbl);
  execute format(
    'create policy std_update on %s for update to authenticated using ((created_by = (select auth.uid()) or iam.has_access(%L, id, ''editor''))) with check (created_by = (select auth.uid()) or iam.has_access(%L, id, ''editor''))',
    v_tbl, p_token, p_token);
  execute format(
    'create policy std_delete on %s for delete to authenticated using (created_by = (select auth.uid()) or iam.has_access(%L, id, ''admin''))',
    v_tbl, p_token);

  perform iam.apply_table_grants(p_schema, p_table, p_variant);

  -- THE GOVERNANCE-COLUMN TIER. RLS is row-level and cannot say "this column
  -- needs a higher level", so the column axis of the tiered model is a
  -- generated BEFORE UPDATE trigger, emitted here beside the policies.
  perform iam.apply_governance_guard(p_schema, p_table, p_token);
end;
$function$;

-- =====================================================================
-- 2. GENERATOR-OWNED — regenerate the one live `ledger` table through v4.
--    platform.activity_log is the largest table in this sweep (~94k rows the
--    owner identity can see) and the one that measurably blew the budget.
-- =====================================================================

SELECT iam.apply_rls('platform', 'activity_log', 'activity', 'ledger');

-- =====================================================================
-- 3. BESPOKE — hoisted in place. Grouped by shape.
-- =====================================================================

-- ---- 3a. Plain org lane on the table's own column ----

DROP POLICY IF EXISTS scope_types_select ON context.scope_types;
CREATE POLICY scope_types_select ON context.scope_types
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs()));

DROP POLICY IF EXISTS page_extraction_jobs_org_read ON docproc.page_extraction_jobs;
CREATE POLICY page_extraction_jobs_org_read ON docproc.page_extraction_jobs
  FOR SELECT
  USING (organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs()));

DROP POLICY IF EXISTS org_read ON iam.organization_preferences;
CREATE POLICY org_read ON iam.organization_preferences
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs()));

DROP POLICY IF EXISTS omc_read ON platform.org_module_config;
CREATE POLICY omc_read ON platform.org_module_config
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs()));

DROP POLICY IF EXISTS std_select ON rag.kg_sweep_state;
CREATE POLICY std_select ON rag.kg_sweep_state
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs()));

-- history.row_versions is the platform-wide version ledger — by far the biggest
-- table carrying this shape. `authenticated` currently has no USAGE on schema
-- `history`, so no client reaches it today; the policy is hoisted anyway so the
-- day that grant lands it does not arrive with a built-in timeout.
DROP POLICY IF EXISTS std_select ON history.row_versions;
CREATE POLICY std_select ON history.row_versions
  FOR SELECT
  USING (organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs()));

DROP POLICY IF EXISTS udt_dataset_templates_select ON workbench.udt_dataset_templates;
CREATE POLICY udt_dataset_templates_select ON workbench.udt_dataset_templates
  FOR SELECT TO authenticated
  USING (
    COALESCE((((SELECT auth.jwt() AS jwt) ->> 'is_anonymous'::text))::boolean, false) IS FALSE
    AND organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs())
  );

-- ---- 3b. Owner-or-org lanes ----

DROP POLICY IF EXISTS subscription_self ON billing.subscription;
CREATE POLICY subscription_self ON billing.subscription
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR ((org_id IS NOT NULL) AND org_id IN (SELECT iam.my_orgs()))
  );

DROP POLICY IF EXISTS read ON education.study_structured_section;
CREATE POLICY read ON education.study_structured_section
  FOR SELECT TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR ((organization_id IS NOT NULL) AND organization_id IN (SELECT iam.my_orgs()))
  );

DROP POLICY IF EXISTS org_select_policy ON iam.organizations;
CREATE POLICY org_select_policy ON iam.organizations
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR id IN (SELECT iam.my_orgs())
  );

DROP POLICY IF EXISTS "Users can view relevant permissions" ON iam.permissions;
CREATE POLICY "Users can view relevant permissions" ON iam.permissions
  FOR SELECT
  USING (
    granted_to_user_id = auth.uid()
    OR is_public = true
    OR created_by = auth.uid()
    OR (granted_to_organization_id IS NOT NULL AND granted_to_organization_id IN (SELECT iam.my_orgs()))
  );

DROP POLICY IF EXISTS integration_connections_read_owner_or_org ON users.integration_connections;
CREATE POLICY integration_connections_read_owner_or_org ON users.integration_connections
  FOR SELECT TO authenticated
  USING (
    COALESCE(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false) = false
    AND deleted_at IS NULL
    AND (
      owner_user_id = (SELECT auth.uid())
      OR ((organization_id IS NOT NULL) AND organization_id IN (SELECT iam.my_orgs()))
    )
  );

DROP POLICY IF EXISTS scopes_select ON context.scopes;
CREATE POLICY scopes_select ON context.scopes
  FOR SELECT
  USING (
    (organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs()))
    OR ((settings ->> 'access_mode'::text) = 'open'::text)
    OR _edu_is_scope_member(id)
  );

-- ---- 3c. Parent-org lookups, lifted from a per-row scalar subquery to a
--          hoistable set. `X IN (SELECT parent.id FROM parent WHERE parent.org
--          IN (SELECT iam.my_orgs()))` admits exactly the rows whose parent's
--          org was in my_orgs before: a row whose FK is NULL, or whose parent is
--          invisible/absent, produced has_org_access(NULL) = false then and
--          fails the IN now. The parent tables carry their own RLS in both
--          forms, so the clipping is unchanged.

DROP POLICY IF EXISTS context_item_values_select ON context.context_item_values;
CREATE POLICY context_item_values_select ON context.context_item_values
  FOR SELECT TO authenticated
  USING (
    scope_id IS NOT NULL
    AND scope_id IN (SELECT s.id FROM context.scopes s WHERE s.organization_id IN (SELECT iam.my_orgs()))
  );

DROP POLICY IF EXISTS context_item_values_update ON context.context_item_values;
CREATE POLICY context_item_values_update ON context.context_item_values
  FOR UPDATE TO authenticated
  USING (
    scope_id IS NOT NULL
    AND scope_id IN (SELECT s.id FROM context.scopes s WHERE s.organization_id IN (SELECT iam.my_orgs()))
  );

DROP POLICY IF EXISTS context_item_values_delete ON context.context_item_values;
CREATE POLICY context_item_values_delete ON context.context_item_values
  FOR DELETE TO authenticated
  USING (
    scope_id IS NOT NULL
    AND scope_id IN (SELECT s.id FROM context.scopes s WHERE s.organization_id IN (SELECT iam.my_orgs()))
  );

DROP POLICY IF EXISTS context_items_select ON context.context_items;
CREATE POLICY context_items_select ON context.context_items
  FOR SELECT TO authenticated
  USING (
    scope_type_id IS NOT NULL
    AND scope_type_id IN (SELECT st.id FROM context.scope_types st WHERE st.organization_id IN (SELECT iam.my_orgs()))
  );

DROP POLICY IF EXISTS dict_entries_read ON public.dict_entries;
CREATE POLICY dict_entries_read ON public.dict_entries
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs()))
    OR (scope_type_id IS NOT NULL AND scope_type_id IN (SELECT st.id FROM context.scope_types st WHERE st.organization_id IN (SELECT iam.my_orgs())))
    OR (scope_id IS NOT NULL AND scope_id IN (SELECT s.id FROM context.scopes s WHERE s.organization_id IN (SELECT iam.my_orgs())))
  );

DROP POLICY IF EXISTS dict_settings_read ON public.dict_settings;
CREATE POLICY dict_settings_read ON public.dict_settings
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs()))
    OR (scope_type_id IS NOT NULL AND scope_type_id IN (SELECT st.id FROM context.scope_types st WHERE st.organization_id IN (SELECT iam.my_orgs())))
    OR (scope_id IS NOT NULL AND scope_id IN (SELECT s.id FROM context.scopes s WHERE s.organization_id IN (SELECT iam.my_orgs())))
  );

-- ---- 3d. EXISTS-over-parent lanes. The EXISTS stays (it is an indexed FK
--          probe); only the definer call inside it becomes the hoistable set.

DROP POLICY IF EXISTS page_extraction_page_runs_read ON docproc.page_extraction_page_runs;
CREATE POLICY page_extraction_page_runs_read ON docproc.page_extraction_page_runs
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM docproc.page_extraction_jobs j
    WHERE j.id = page_extraction_page_runs.job_id
      AND (j.owner_id = auth.uid() OR j.organization_id IN (SELECT iam.my_orgs()))
  ));

DROP POLICY IF EXISTS page_extraction_results_read ON docproc.page_extraction_results;
CREATE POLICY page_extraction_results_read ON docproc.page_extraction_results
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM docproc.page_extraction_jobs j
    WHERE j.id = page_extraction_results.job_id
      AND (j.owner_id = auth.uid() OR j.organization_id IN (SELECT iam.my_orgs()))
  ));

DROP POLICY IF EXISTS page_extraction_runs_read ON docproc.page_extraction_runs;
CREATE POLICY page_extraction_runs_read ON docproc.page_extraction_runs
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM docproc.page_extraction_jobs j
    WHERE j.id = page_extraction_runs.job_id
      AND (j.owner_id = auth.uid() OR j.organization_id IN (SELECT iam.my_orgs()))
  ));

DROP POLICY IF EXISTS cfg_select_via_definition ON tool.binding;
CREATE POLICY cfg_select_via_definition ON tool.binding
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM tool.definition d
    WHERE d.id = binding.tool_id
      AND (
        d.visibility = 'public'::platform.visibility
        OR d.created_by = (SELECT auth.uid())
        OR (d.organization_id IS NOT NULL
            AND d.visibility >= 'internal'::platform.visibility
            AND d.organization_id IN (SELECT iam.my_orgs()))
      )
  ));

DROP POLICY IF EXISTS integration_connection_resources_read_owner_or_org ON users.integration_connection_resources;
CREATE POLICY integration_connection_resources_read_owner_or_org ON users.integration_connection_resources
  FOR SELECT TO authenticated
  USING (
    COALESCE(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false) = false
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM users.integration_connections connection
      WHERE connection.id = integration_connection_resources.connection_id
        AND connection.deleted_at IS NULL
        AND (
          connection.owner_user_id = (SELECT auth.uid())
          OR (connection.organization_id IS NOT NULL
              AND connection.organization_id IN (SELECT iam.my_orgs()))
        )
    )
  );

DROP POLICY IF EXISTS udt_dataset_template_fields_select ON workbench.udt_dataset_template_fields;
CREATE POLICY udt_dataset_template_fields_select ON workbench.udt_dataset_template_fields
  FOR SELECT TO authenticated
  USING (
    COALESCE(((( SELECT auth.jwt() AS jwt) ->> 'is_anonymous'::text))::boolean, false) IS FALSE
    AND EXISTS (
      SELECT 1 FROM workbench.udt_dataset_templates t
      WHERE t.id = udt_dataset_template_fields.template_id
        AND t.organization_id IN (SELECT iam.my_orgs())
    )
  );

-- ---- 3e. has_org_access_for((select auth.uid()), org) — the 1-arg form spelled
--          out, so it collapses to the same set. Everything else on these two
--          secret-bearing policies (access_mode, org-admin, per-user grants) is
--          preserved verbatim.

DROP POLICY IF EXISTS credential_items_org_member_read ON users.credential_items;
CREATE POLICY credential_items_org_member_read ON users.credential_items
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT iam.my_orgs())
    AND (
      access_mode = 'all_members'::text
      OR is_org_admin_for((SELECT auth.uid()), organization_id)
      OR EXISTS (
        SELECT 1 FROM users.user_secret_grants g
        WHERE g.credential_item_id = credential_items.id
          AND g.user_id = (SELECT auth.uid())
          AND g.can_use
      )
    )
  );

DROP POLICY IF EXISTS user_secrets_org_member_read ON users.user_secrets;
CREATE POLICY user_secrets_org_member_read ON users.user_secrets
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id IN (SELECT iam.my_orgs())
    AND (
      access_mode = 'all_members'::text
      OR is_org_admin_for((SELECT auth.uid()), organization_id)
      OR EXISTS (
        SELECT 1 FROM users.user_secret_grants g
        WHERE (g.user_secret_id = user_secrets.id
               OR (g.credential_item_id IS NOT NULL
                   AND g.credential_item_id = user_secrets.credential_item_id))
          AND g.user_id = (SELECT auth.uid())
          AND g.can_use
      )
    )
  );

-- ---- 3f. graveyard.* — retired tables. `authenticated` has no USAGE on schema
--          `graveyard`, so no client reaches these and they cannot fire the
--          defect today. Hoisted anyway so the class is swept whole and a
--          future un-retirement does not resurrect the per-row call.

DROP POLICY IF EXISTS cfg_select ON graveyard.endpoint_legacy;
CREATE POLICY cfg_select ON graveyard.endpoint_legacy
  FOR SELECT TO anon, authenticated
  USING (
    visibility = 'public'::platform.visibility
    OR created_by = (SELECT auth.uid())
    OR (organization_id IS NOT NULL
        AND visibility >= 'internal'::platform.visibility
        AND organization_id IN (SELECT iam.my_orgs()))
  );

DROP POLICY IF EXISTS org_module_settings_select ON graveyard.org_module_settings;
CREATE POLICY org_module_settings_select ON graveyard.org_module_settings
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs()));

DROP POLICY IF EXISTS org_invitations_select_policy ON graveyard.organization_invitations;
CREATE POLICY org_invitations_select_policy ON graveyard.organization_invitations
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs()));

DROP POLICY IF EXISTS read ON graveyard.prompt_templates;
CREATE POLICY read ON graveyard.prompt_templates
  FOR SELECT TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR ((organization_id IS NOT NULL) AND organization_id IN (SELECT iam.my_orgs()))
  );

DROP POLICY IF EXISTS prompts_select_scope ON graveyard.prompts;
CREATE POLICY prompts_select_scope ON graveyard.prompts
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (organization_id IS NOT NULL AND organization_id IN (SELECT iam.my_orgs()))
    OR has_permission('prompts'::text, id, 'viewer'::permission_level)
  );

DROP POLICY IF EXISTS prompt_ver_select_scope ON graveyard.prompt_versions;
CREATE POLICY prompt_ver_select_scope ON graveyard.prompt_versions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM graveyard.prompts p
    WHERE p.id = prompt_versions.prompt_id
      AND (p.user_id = auth.uid() OR p.organization_id IN (SELECT iam.my_orgs()))
  ));
