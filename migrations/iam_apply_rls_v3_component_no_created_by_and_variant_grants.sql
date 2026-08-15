-- iam.apply_rls v3 — THE COMPONENT OWNERSHIP LAW + variant-keyed table GRANTs.
-- Arman's ruling, 2026-08-14. Two changes, one generator.
--
-- ============================================================================
-- WHY (1): `created_by` is doing two different jobs and they only safely
-- coincide on an ENTITY.
--
--   * On an ENTITY the creator IS the owner, so one column legitimately serves
--     as both audit stamp and access key.
--   * On a COMPONENT the actor and the owner come apart — the actor is whoever
--     acted, the owner is the PARENT — so the same column cannot serve both.
--     Wire it into RLS and you get exactly the D182(3) bug: the component
--     std_insert parent-editor arm never constrained `created_by`, while
--     std_select led with `created_by = auth.uid()`, so a parent-editor could
--     stamp ANOTHER user as creator and thereby hand that user owner-read.
--     56 active component tables carried both halves of that shape.
--
-- Provenance is NOT lost: `history.row_versions` (via _stamp_actor /
-- _version_capture) already records who did what to every row. A component
-- does not need `created_by` to answer "who made this".
--
-- THE LAW: a component has no owner column, no own visibility, and its access
-- IS its parent's. `apply_rls(..., 'component')` therefore NEVER emits a
-- `created_by` clause. If a sub-row genuinely needs its own owner with
-- independent access, it is not a component — it is an entity in a containment
-- relationship, and the variant was chosen wrong.
--
-- Where "who acted" carries real domain meaning (a message's sender), that
-- belongs in a NAMED domain column (`sender_id`, `author_role`) that never
-- appears in a policy.
--
-- Also removed here: the materializing self-referential arm
-- `id in (select unnest(iam.accessible_entity_ids(<own token>)))` on component
-- update/delete. It aggregates every accessible child id (13.2M UUIDs on
-- seo.search_performance_daily — see D183) to answer one row. The per-row
-- `iam.has_access(token, id, level)` preserves the only 3 direct component
-- grants that exist live (agent_card x2, web_page x1) at no such cost, so this
-- takes access away from nobody.
--
-- ============================================================================
-- WHY (2): table GRANTs were issued by NEITHER iam.apply_rls NOR
-- platform.create_entity_table, so privileges drifted ad-hoc across 162 active
-- component tables: 101 SIUD, 40 SELECT-only, 9 with none, 1 DELETE-only
-- (files.file_versions — unreadable by the very role its std_select targets).
-- GRANTs are the FIRST gate: where they are missing, RLS is never reached and
-- the policy above cannot run.
--
-- GRANTs are NOT where openness is decided — RLS is. So they are uniform by
-- variant, from one place:
--     entity / component / system / restricted -> SELECT, INSERT, UPDATE, DELETE
--     ledger                                   -> SELECT only (writes via SECURITY DEFINER)
-- RLS does the real gating; DELETE is safe because the delete policy governs it.
--
-- SAFETY RAIL (the one real risk): a table protected ONLY by a missing GRANT —
-- RLS off, or no policies — must never be widened. It is not "closed", it is
-- one migration away from wide open. iam.apply_table_grants REFUSES to grant on
-- such a table. Live audit at time of writing found 6 (tracked in FOUND_DEFECTS
-- D184): ui.ui_surface and agent.card have RLS DISABLED (ui.ui_surface with full
-- SIUD already granted = live hole); batch.cost_event, public.system_error,
-- public.system_write_failure, runtime.global_origin have RLS on and zero
-- policies.
--
-- `anon` grants are deliberately NOT touched here. pub_read policies exist on
-- many tables without a matching anon grant, and widening anon is a separate,
-- explicit decision.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Variant-keyed table privileges. Callable on its own; called by apply_rls and
-- (going forward) by platform.create_entity_table, so both paths agree.
-- ---------------------------------------------------------------------------
create or replace function iam.apply_table_grants(
  p_schema text,
  p_table text,
  p_variant text default 'entity'
) returns void
language plpgsql
as $fn$
declare
  v_tbl text := format('%I.%I', p_schema, p_table);
  v_rel regclass := v_tbl::regclass;
  v_rls_on boolean;
  v_n_pol integer;
begin
  select c.relrowsecurity,
         (select count(*) from pg_policy p where p.polrelid = c.oid)
    into v_rls_on, v_n_pol
  from pg_class c where c.oid = v_rel;

  -- THE SAFETY RAIL. Never widen a table whose only protection is the absence
  -- of a grant.
  if not v_rls_on then
    raise exception
      'apply_table_grants: %.% has RLS DISABLED — refusing to grant. Enable RLS and apply policies first (this table is a hole, not a closed door).',
      p_schema, p_table;
  end if;
  if v_n_pol = 0 then
    raise exception
      'apply_table_grants: %.% has RLS enabled but ZERO policies — refusing to grant. Apply canonical policies first.',
      p_schema, p_table;
  end if;

  execute format('revoke all on %s from authenticated', v_tbl);

  if p_variant = 'ledger' then
    -- Append-only org log: reads only; writes belong to a SECURITY DEFINER writer.
    execute format('grant select on %s to authenticated', v_tbl);
  else
    execute format('grant select, insert, update, delete on %s to authenticated', v_tbl);
  end if;

  -- service_role is the server's bypass lane and always needs full reach.
  execute format('grant all on %s to service_role', v_tbl);
end;
$fn$;

comment on function iam.apply_table_grants(text, text, text) is
  'Variant-keyed table privileges for `authenticated`/`service_role`. GRANTs are uniform by variant — openness is decided by RLS, not by grants. Refuses to run on a table with RLS off or zero policies (that table is a hole, not a closed door). Does not touch `anon`.';


-- ---------------------------------------------------------------------------
-- iam.apply_rls v3
-- ---------------------------------------------------------------------------
create or replace function iam.apply_rls(
  p_schema text,
  p_table text,
  p_token text,
  p_variant text default 'entity'
) returns void
language plpgsql
as $fn$
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
    execute format(
      'create policy std_select on %s for select to authenticated using (iam.has_org_access(organization_id))',
      v_tbl);
    perform iam.apply_table_grants(p_schema, p_table, p_variant);
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
end;
$fn$;

comment on function iam.apply_rls(text, text, text, text) is
  'v3 (2026-08-14). Canonical RLS generator. THE COMPONENT OWNERSHIP LAW: a component has no owner column and no own visibility — its access IS its parent''s — so the component arm NEVER emits a created_by clause (created_by is an access key only on an entity, where creator = owner). Also issues variant-keyed table GRANTs via iam.apply_table_grants, so policies and privileges live in one place. Never hand-write a policy.';

commit;

notify pgrst, 'reload schema';
