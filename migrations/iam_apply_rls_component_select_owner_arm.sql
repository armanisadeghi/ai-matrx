-- D181: component-table INSERT…RETURNING fails 42501 platform-wide.
--
-- The component branch of iam.apply_rls emitted std_select as ONLY the id-list
-- form: id IN (SELECT unnest(iam.accessible_entity_ids('<token>','viewer'))).
-- iam.accessible_entity_ids is STABLE — it runs on the statement snapshot and
-- can never contain the row being inserted by the current statement. Postgres
-- checks the SELECT policy against the new row for INSERT…RETURNING (the
-- default supabase-js .insert().select() pattern), so every authenticated
-- insert-with-returning on a component table failed 42501.
--
-- Fix (db-rules §6d — "std_select LEADS with created_by = (select auth.uid())"):
-- give the component std_select the same row-local owner short-circuit the
-- entity variant has always had. _stamp_actor (BEFORE INSERT) sets created_by
-- to auth.uid(), and RLS checks run on the post-trigger tuple, so the new row
-- passes. This restores openness the generator's component branch dropped; it
-- grants nothing beyond what the entity template already grants everywhere.
--
-- Part 1: fix the generator (so every future apply is correct).
-- Part 2: surgically ALTER the ~130 existing broken std_select policies in
--         place (prepending the owner arm to the current qual) instead of
--         re-running apply_rls per table — apply_rls DROPS ALL policies, and
--         several is_component tables carry deliberate bespoke extra lanes
--         (public_read, curator, grant_read) that a re-apply would destroy
--         (see FOUND_DEFECTS D-entry from 2026-08-12 sweep notes).
-- Part 3: notify PostgREST.

-- ---------------------------------------------------------------------------
-- Part 1 — generator fix
-- ---------------------------------------------------------------------------
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
  v_all_parent_null text := '';
  v_parent_count integer := 0;
  rec record;
  pol record;
begin
  select coalesce(is_component, false) into v_is_component
  from platform.entity_types
  where token = p_token;

  select exists (
    select 1 from information_schema.columns
    where table_schema = p_schema and table_name = p_table
      and column_name = 'created_by'
  ) into v_has_created;
  select exists (
    select 1 from information_schema.columns
    where table_schema = p_schema and table_name = p_table
      and column_name = 'organization_id'
  ) into v_has_org;
  select exists (
    select 1 from information_schema.columns
    where table_schema = p_schema and table_name = p_table
      and column_name = 'deleted_at'
  ) into v_has_del;
  select exists (
    select 1 from information_schema.columns
    where table_schema = p_schema and table_name = p_table
      and column_name = 'visibility'
  ) into v_has_vis;
  v_delpfx := case when v_has_del then 'deleted_at is null and ' else '' end;

  execute format('alter table %s enable row level security', v_tbl);
  for pol in select polname from pg_policy where polrelid = v_tbl::regclass loop
    execute format('drop policy %I on %s', pol.polname, v_tbl);
  end loop;
  execute format(
    'create policy svc_all on %s for all to service_role using (true) with check (true)',
    v_tbl
  );

  if p_variant = 'ledger' then
    execute format(
      'create policy std_select on %s for select to authenticated using (iam.has_org_access(organization_id))',
      v_tbl
    );
    return;
  end if;

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
        || format(
          '%I in (select unnest(iam.accessible_entity_ids(%L, ''editor''::public.permission_level)))',
          rec.fk_column, rec.parent_type
        );
      v_all_parent_null := v_all_parent_null
        || case when v_all_parent_null = '' then '' else ' and ' end
        || format('%I is null', rec.fk_column);
    end loop;
    if v_parent_count = 0 then
      raise exception
        'apply_rls: component % has no composition parent in platform.entity_relationships',
        p_token;
    end if;
    if v_has_created then
      v_parent_expr_edit := '(' || v_parent_expr_edit || ') or ('
        || v_all_parent_null || ' and created_by = (select auth.uid()))';
    end if;

    -- SELECT/UPDATE/DELETE resolve the CHILD token once per statement. That
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
    end if;
    -- A new row cannot have a direct grant yet, so INSERT must be authorized
    -- through at least one structural parent (or be an owned orphan).
    execute format(
      'create policy std_insert on %s for insert to authenticated with check (%s)',
      v_tbl, v_parent_expr_edit
    );
    execute format(
      'create policy std_update on %s for update to authenticated using ('
      || 'id in (select unnest(iam.accessible_entity_ids(%L, ''editor''::public.permission_level)))) '
      || 'with check ((%s) or public.has_permission(%L, id, ''editor''::public.permission_level))',
      v_tbl, p_token, v_parent_expr_edit, p_token
    );
    execute format(
      'create policy std_delete on %s for delete to authenticated using ('
      || 'id in (select unnest(iam.accessible_entity_ids(%L, ''editor''::public.permission_level))))',
      v_tbl, p_token
    );
    return;
  end if;

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
      v_tbl, v_delpfx
    );
    if v_has_vis then
      execute format(
        'create policy pub_read on %s for select to anon using (%s visibility = ''public'')',
        v_tbl, v_delpfx
      );
    end if;
    execute format(
      'create policy std_insert on %s for insert to authenticated with check (created_by = (select auth.uid()) and (public.is_super_admin() or organization_id is null or iam.has_org_access(organization_id)))',
      v_tbl
    );
    execute format(
      'create policy std_update on %s for update to authenticated using (created_by = (select auth.uid()) or public.is_super_admin()) with check (created_by = (select auth.uid()) or public.is_super_admin())',
      v_tbl
    );
    execute format(
      'create policy std_delete on %s for delete to authenticated using (created_by = (select auth.uid()) or public.is_super_admin())',
      v_tbl
    );
    return;
  end if;

  if p_variant = 'system' then
    if not v_has_vis then
      raise exception
        'apply_rls: system variant on %.% requires a visibility column',
        p_schema, p_table;
    end if;
    execute format(
      'create policy std_select on %s for select to authenticated using ((visibility = ''public'' or created_by = (select auth.uid()) or iam.has_access(%L, id, ''viewer'')))',
      v_tbl, p_token
    );
  else
    execute format(
      'create policy std_select on %s for select to authenticated using ((created_by = (select auth.uid()) or iam.has_access(%L, id, ''viewer'')))',
      v_tbl, p_token
    );
  end if;
  if v_has_vis then
    execute format(
      'create policy pub_read on %s for select to anon using (%s visibility = ''public'')',
      v_tbl, v_delpfx
    );
  end if;
  execute format(
    'create policy std_insert on %s for insert to authenticated with check (created_by = (select auth.uid()) and (organization_id is null or iam.has_org_access(organization_id) or (organization_id in (select organization_id from iam.system_orgs where global_readable) and public.is_super_admin())))',
    v_tbl
  );
  execute format(
    'create policy std_update on %s for update to authenticated using ((created_by = (select auth.uid()) or iam.has_access(%L, id, ''editor''))) with check (created_by = (select auth.uid()) or iam.has_access(%L, id, ''editor''))',
    v_tbl, p_token, p_token
  );
  execute format(
    'create policy std_delete on %s for delete to authenticated using (created_by = (select auth.uid()) or iam.has_access(%L, id, ''admin''))',
    v_tbl, p_token
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Part 2 — repair the existing broken policies in place (idempotent).
-- ALTER POLICY keeps every OTHER policy on the table untouched, so bespoke
-- extra lanes on is_component tables survive. Only tables that actually have
-- a created_by column get the arm.
-- ---------------------------------------------------------------------------
DO $$
declare
  r record;
  v_fixed integer := 0;
begin
  for r in
    select n.nspname as schema_name, c.relname as table_name,
           pg_get_expr(p.polqual, p.polrelid) as using_expr
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.polcmd = 'r'
      and p.polname = 'std_select'
      and pg_get_expr(p.polqual, p.polrelid) like '%accessible_entity_ids%'
      and pg_get_expr(p.polqual, p.polrelid) not like '%created_by%'
      and exists (
        select 1 from information_schema.columns col
        where col.table_schema = n.nspname
          and col.table_name = c.relname
          and col.column_name = 'created_by'
      )
  loop
    execute format(
      'alter policy std_select on %I.%I to authenticated using (created_by = (select auth.uid()) or (%s))',
      r.schema_name, r.table_name, r.using_expr
    );
    v_fixed := v_fixed + 1;
  end loop;
  raise notice 'D181 repair: added owner arm to % std_select policies', v_fixed;
end $$;

-- ---------------------------------------------------------------------------
-- Part 3 — PostgREST picks up the new policies
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
