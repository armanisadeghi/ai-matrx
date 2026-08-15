-- ============================================================================
-- THE GOVERNANCE-COLUMN TIER — restoring the missing axis of the access model
-- ============================================================================
-- FOUND_DEFECTS D119. Arman's ruling 2026-08-14: do NOT bolt a one-off guard
-- onto `visibility`. The tiered model (viewer / editor / admin) is the thing to
-- restore, in the canonical pipeline, never per table.
--
-- WHAT WAS ALREADY BUILT (live, verified): `iam.apply_rls` emits a real ladder
-- on the STATEMENT axis for the entity family —
--     std_select viewer · std_insert owner · std_update editor · std_delete ADMIN
-- That `admin` on delete is the EDITOR-CAP RULING made concrete
-- (common-docs/systems/access-architecture/SHARING_MODEL.md §5):
-- "members work, owners/admins govern."
--
-- WHAT WAS NEVER BUILT: the COLUMN axis. `std_update` is column-blind, so the
-- columns that DECIDE ACCESS sit inside the editor-writable set. Measured live
-- on workbench.working_documents with a real editor grant, real `authenticated`
-- role, real JWT claims — an editor-sharee could:
--     flip visibility -> 'public'                 SUCCEEDED
--     set created_by := self (steal ownership)    SUCCEEDED
--     set organization_id := their own org        SUCCEEDED
--     hard DELETE                                 refused  <- the tier that IS built
-- and those CHAIN: stealing ownership makes std_delete's owner arm true, which
-- defeats the one tier that existed.
--
-- Two places already asserted the rule nobody enforced:
--   * access-architecture/FEATURE.md §2  "visibility <- owner-only direct UPDATE (RLS)"
--   * utils/permissions/service.ts       "Owner-only writes are enforced by RLS"
-- Both were false for every std-variant table. This migration makes them true.
--
-- MECHANISM. Postgres RLS is row-level; it cannot express "this column needs a
-- higher level". Column GRANTs cannot either — they are role-wide, and the owner
-- is the same `authenticated` role as the sharee. So the column tier is a
-- generated BEFORE UPDATE trigger, emitted by the same generator that emits the
-- policies, alongside the base contract's existing per-row triggers
-- (`platform._touch_row`, `platform._stamp_actor`).
--
-- SCOPE: the ENTITY family only (`entity` / `system` variants). Components are
-- deliberately excluded — under THE COMPONENT OWNERSHIP LAW a component's owner
-- IS its parent, `created_by` is not an access key there, and its governance
-- lives on the entity above it. `ledger` and `restricted` variants are untouched
-- (`restricted` is already owner-or-super-admin on UPDATE).
--
-- NOT OVER-TIGHTENING (db-rules §6: a blocked legitimate user is as serious a
-- bug as an intruder). Measured against 120 days of history.row_versions,
-- 1,650 visibility changes on entity rows:
--     1,594  actor_id NULL  -> privileged server writes; this guard skips them
--        56  actor = owner  -> still allowed
--         0  actor = a real non-owner user
-- Zero historical legitimate actions are refused by this change. The two live
-- `organization_id` writers in the frontend (notesService.assignHomelessNotes*,
-- scopesService org adoption) only ever write when the column IS NULL, which is
-- explicitly permitted below as ADOPTION.
--
-- Idempotent. Source: matrx-frontend.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Per-entity-type room, with a platform default.
--    The ruling allows the split to differ per entity type. NULL = the default
--    set; a token may widen or narrow it without touching code.
-- ---------------------------------------------------------------------------
alter table platform.entity_types
  add column if not exists governed_columns text[];

comment on column platform.entity_types.governed_columns is
  'THE GOVERNANCE-COLUMN TIER: columns on this entity that only the owner (created_by) or an admin-level holder may change. NULL = the platform default {visibility, created_by, organization_id}. Enforced by the generated _guard_governance trigger (iam.apply_governance_guard), not by RLS — RLS is row-level and cannot express a column tier.';

-- SECURITY DEFINER: `authenticated` holds no table grant on platform.entity_types
-- (registry reads go through definer functions everywhere else too). Without this
-- the guard raises "permission denied for table entity_types" on EVERY update,
-- which reads as a refusal and would have broken all editing. Caught in dry-run.
create or replace function iam.governance_columns(p_token text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select et.governed_columns from platform.entity_types et where et.token = p_token),
    array['visibility', 'created_by', 'organization_id']
  );
$$;

comment on function iam.governance_columns(text) is
  'Resolves the governance-column set for an entity token: the per-type override on platform.entity_types.governed_columns, else the platform default {visibility, created_by, organization_id}.';

-- ---------------------------------------------------------------------------
-- 2. The guard itself. ONE function, every entity table, token passed as TG_ARGV[0].
--
--    SECURITY INVOKER on purpose: it must see the REAL current role, because
--    the whole point is to guard the `authenticated` (RLS-enforced) lane and to
--    leave the privileged server lane alone — exactly like the svc_all policy.
--    `iam.has_access` is itself SECURITY DEFINER and executable by authenticated.
--
--    Shape-tolerant via to_jsonb: entity tables differ (not all carry
--    `visibility`), and a column named in the set but absent from the table is
--    simply not present in the row json, so it can never change.
-- ---------------------------------------------------------------------------
create or replace function iam._guard_governance_columns()
returns trigger
language plpgsql
as $$
declare
  v_token   text := TG_ARGV[0];
  v_uid     uuid;
  v_old     jsonb := to_jsonb(OLD);
  v_new     jsonb := to_jsonb(NEW);
  v_cols    text[];
  v_col     text;
  v_is_owner boolean;
  v_is_admin boolean;
  v_row_id  uuid;
begin
  -- The privileged lane governs by design (aidream's pool, migrations, service
  -- role). Only the RLS-enforced lane is tiered — and aidream's acting_as_user
  -- posture lands HERE, which is correct: an agent is exactly its user.
  if current_user <> 'authenticated' then
    return NEW;
  end if;

  v_uid := coalesce(
    nullif(current_setting('app.user_id', true), '')::uuid,
    (select auth.uid())
  );
  -- No identity under `authenticated` cannot pass std_update anyway (both arms
  -- are false), so there is nothing to guard and nothing to block.
  if v_uid is null then
    return NEW;
  end if;

  v_cols := iam.governance_columns(v_token);
  if v_cols is null or cardinality(v_cols) = 0 then
    return NEW;
  end if;

  v_is_owner := (v_old ->> 'created_by') is not null
                and (v_old ->> 'created_by')::uuid = v_uid;
  v_row_id   := nullif(v_old ->> 'id', '')::uuid;

  foreach v_col in array v_cols loop
    -- absent column => never changes
    if not (v_old ? v_col) then
      continue;
    end if;
    if (v_new -> v_col) is not distinct from (v_old -> v_col) then
      continue;
    end if;

    -- created_by is the access key itself. Rewriting it through a row UPDATE is
    -- ownership TRANSFER, and it escalates: the new value satisfies std_delete's
    -- owner arm. No level buys it in this lane — not editor, not admin, not the
    -- owner. If we ever want transfers, they are an owner-gated RPC with an
    -- audit trail, never a column write.
    if v_col = 'created_by' then
      raise exception using
        errcode = '42501',
        message = format('Ownership of this %s cannot be transferred by editing created_by.', v_token),
        detail  = format('created_by is the access key for %s rows; changing it through an UPDATE would silently hand over every owner privilege, including delete.', v_token),
        hint    = 'Ownership transfer is a deliberate, audited operation — it is not a column write.';
    end if;

    -- ADOPTION is not re-homing. A row that has no organization yet may be
    -- adopted into one by anyone who can edit it (this is what the frontend's
    -- homeless-note and scope-adoption paths do, both `IS NULL`-guarded).
    -- Moving a row that ALREADY belongs to a tenant is governance.
    if v_col = 'organization_id' and (v_old ->> 'organization_id') is null then
      continue;
    end if;

    if v_is_owner then
      continue;
    end if;

    if v_is_admin is null then
      v_is_admin := coalesce(iam.has_access(v_token, v_row_id, 'admin'::public.permission_level), false);
    end if;
    if v_is_admin then
      continue;
    end if;

    raise exception using
      errcode = '42501',
      message = format('Changing "%s" on this %s requires owner or admin access — edit access is not enough.', v_col, v_token),
      detail  = format('"%s" decides who can reach this row. Editors change the content; the owner and admin-level holders govern the access.', v_col),
      hint    = 'Ask the owner to make this change, or request admin access to the record.';
  end loop;

  return NEW;
end
$$;

comment on function iam._guard_governance_columns() is
  'THE GOVERNANCE-COLUMN TIER (D119). BEFORE UPDATE guard for entity-family tables: the columns in iam.governance_columns(token) may only be changed by the owner (created_by) or an admin-level holder, never by an editor. created_by is refused at every level (ownership transfer is not a column write); organization_id is freely ADOPTABLE while NULL. Skips the privileged lane (current_user <> authenticated). Attached by iam.apply_governance_guard.';

-- ---------------------------------------------------------------------------
-- 3. The attacher — the canonical pipeline's hook.
-- ---------------------------------------------------------------------------
create or replace function iam.apply_governance_guard(p_schema text, p_table text, p_token text)
returns void
language plpgsql
as $$
declare
  v_tbl text := format('%I.%I', p_schema, p_table);
begin
  execute format('drop trigger if exists _guard_governance on %s', v_tbl);
  execute format(
    'create trigger _guard_governance before update on %s for each row execute function iam._guard_governance_columns(%L)',
    v_tbl, p_token);
end
$$;

comment on function iam.apply_governance_guard(text, text, text) is
  'Attaches (or refreshes) the _guard_governance BEFORE UPDATE trigger that enforces the governance-column tier. Called by iam.apply_rls for the entity family; the component/ledger/restricted paths drop it instead.';

create or replace function iam.drop_governance_guard(p_schema text, p_table text)
returns void
language plpgsql
as $$
begin
  execute format('drop trigger if exists _guard_governance on %I.%I', p_schema, p_table);
end
$$;

comment on function iam.drop_governance_guard(text, text) is
  'Removes the governance-column guard. Used by iam.apply_rls on the variants that do not own governance: components (their owner IS the parent), ledgers, and restricted tables (already owner-only on UPDATE).';


-- ---------------------------------------------------------------------------
-- 4. Wire the guard INTO the canonical generator, so every table born or
--    regenerated from here inherits the column tier without anyone remembering.
--    Body below is the live v3 function verbatim plus four `perform` lines.
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

-- ---------------------------------------------------------------------------
-- 5. Fleet sweep — attach the guard to every live entity-family table, and make
--    sure no component/ledger/restricted table carries one.
--
--    A PROCEDURE, not a DO block, and it COMMITs per table on purpose. CREATE
--    TRIGGER takes ACCESS EXCLUSIVE; taking 137 of those in one transaction on a
--    live database deadlocks against ordinary traffic (observed in dry-run:
--    "deadlock detected — waits for AccessExclusiveLock ... blocked by ... waits
--    for RowShareLock"). One short transaction per table, with a lock_timeout so
--    a busy table fails fast and is retried rather than blocking the fleet.
--    Re-runnable: it is a no-op on tables already in the right state.
--
--    CALL iam.sweep_governance_guards();   -- must run OUTSIDE a transaction
-- ---------------------------------------------------------------------------
create or replace procedure iam.sweep_governance_guards(p_lock_timeout text default '3s')
language plpgsql
as $sweep$
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
$sweep$;

comment on procedure iam.sweep_governance_guards(text) is
  'Fleet sweep for THE GOVERNANCE-COLUMN TIER. Attaches _guard_governance to every live entity/system-variant table and clears it from the others, ONE SHORT TRANSACTION PER TABLE (CREATE TRIGGER takes ACCESS EXCLUSIVE; doing 137 in one transaction deadlocks a live database). Idempotent and resumable. Must be CALLed outside a transaction block.';
