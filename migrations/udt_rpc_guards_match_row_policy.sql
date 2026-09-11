-- THE COMPLETE-TABLE READ REFUSED A PRINCIPAL WHO COULD READ EVERY ROW.
--
-- Reported 2026-09-11 (feedback 5c31eaea-8115-4322-b1fd-297df4554a8a): on
-- /data/59038c18-552c-427b-b855-6268b853fd89 ("Vegas Events", shared read-only)
-- the page rendered all 400 rows for admin@admin.com while every copy action —
-- which reads the COMPLETE table through public.get_user_table_complete —
-- failed with "viewer access required for dataset ...".
--
-- Measured live, as that user, before this migration:
--     select count(*) from workbench.udt_dataset_rows where table_id = '59038c18-…'
--       -> 400            (row policy admits every row, one by one)
--     select public.get_user_table_complete('59038c18-…')
--       -> ERROR 42501    (the read-them-all-at-once RPC refuses)
--
-- THE WRONG RULE. Every user-data-table RPC carries a HAND-ROLLED guard that
-- re-implements the read/write grant instead of applying the one the row policy
-- applies. The guards admit only: service_role, the row's own `user_id`, and an
-- explicit iam.permissions grant. The `std_select` policy on
-- workbench.udt_datasets admits, additionally, platform admins, `created_by`,
-- public visibility, org admins, org members at >= internal, and every
-- conveyed lane (memberships, reachability, entity grants) through
-- iam.has_access. So the guards are STRICTLY narrower than the RLS that governs
-- the same rows — db-rules §6: a *_denied on a row a platform admin can reach is
-- a defect in the guard, and over-tightening is a defect.
--
-- Two siblings of the same class, found in the census and fixed here:
--   * udt_bulk_write / udt_change_field_type / udt_upsert_cell / udt_upsert_row
--     still call has_permission('workbench.udt_datasets', …). A bare table name
--     is not a permission key — has_permission_for RAISES P0001 on it — so a
--     non-owner EDITOR got a raw exception, not a decision. The 2026 fix in
--     migrations/udt_permission_token_fix.sql repointed the 'udt_datasets'
--     spelling and never saw the 'workbench.'-prefixed one.
--   * the editor guards rejected platform admins and org admins for exactly the
--     same reason the viewer guard did.
--
-- THE RULE THIS INSTALLS. One helper, workbench.udt_dataset_access(table, level),
-- expresses the grant the row policies express — platform admin, owner, then
-- iam.has_access at the required level (which subsumes public / org / conveyed
-- lanes) — and every RPC guard asks IT. A principal who may read every row may
-- read them all at once; a principal who may edit the rows may edit them through
-- the RPC. Nothing here grants access the row policy does not already grant:
-- viewer mirrors `std_select`, editor mirrors `std_update`.

-- ── the one grant every udt RPC asks ─────────────────────────────────────────
create or replace function workbench.udt_dataset_access(
  p_table_id uuid,
  p_required public.permission_level default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'workbench', 'iam', 'pg_temp'
as $function$
  -- Each arm mirrors an arm of the row policies on workbench.udt_datasets.
  select coalesce(
       auth.role() = 'service_role'
    -- `platform_admin_all` (ALL) + the platform-admin prefix on `std_select`.
    or public.is_platform_admin()
    -- the owner arm. `created_by` is the canonical column; `user_id` is the
    -- pre-canonical twin the RPCs were written against and is still populated.
    or exists (
         select 1 from workbench.udt_datasets d
         where d.id = p_table_id
           and d.deleted_at is null
           and (d.created_by = (select auth.uid())
                or d.user_id = (select auth.uid()))
       )
    -- everything else `std_select` / `std_update` decide: public visibility,
    -- org admins, org members at >= internal, memberships, reachability,
    -- entity grants, explicit permissions — all of it, at the level asked for.
    or iam.has_access('dataset', p_table_id, p_required),
    false
  );
$function$;

comment on function workbench.udt_dataset_access(uuid, public.permission_level) is
  'The grant the RLS policies on workbench.udt_datasets express, asked for one dataset at one level. Every user-data-table RPC guard calls this instead of re-implementing the grant; a guard stricter than the row policy is the defect this exists to prevent (feedback 5c31eaea, 2026-09-11).';

-- Internal only: the callers are SECURITY DEFINER functions owned by postgres,
-- so no client role needs EXECUTE and none gets it (no client_callable_door row
-- is required precisely because there is no client GRANT).
revoke all on function workbench.udt_dataset_access(uuid, public.permission_level) from public;
revoke all on function workbench.udt_dataset_access(uuid, public.permission_level) from anon, authenticated;

-- ── the reported defect: the complete-table read ─────────────────────────────
create or replace function public.get_user_table_complete(
  p_table_id uuid,
  p_sort_field text default null::text,
  p_sort_direction text default 'asc'::text
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if workbench.udt_dataset_access(p_table_id, 'viewer') is not true then
    raise exception 'viewer access required for dataset %', p_table_id using errcode = '42501';
  end if;
  return public._d31_impl_get_user_table_complete(p_table_id, p_sort_field, p_sort_direction);
end;
$function$;

-- ── the siblings: the write guards, same wrong rule ──────────────────────────
create or replace function public.add_data_row_to_user_table(p_table_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;
  return public._d31_impl_add_data_row_to_user_table(p_table_id, p_data);
end;
$function$;

create or replace function public.update_user_table_config(
  p_table_id uuid,
  p_table_updates jsonb default null::jsonb,
  p_field_updates jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;
  return public._d31_impl_update_user_table_config(p_table_id, p_table_updates, p_field_updates);
end;
$function$;

create or replace function public.update_user_table_metadata(
  p_table_id uuid,
  p_table_name text default null::text,
  p_description text default null::text,
  p_is_public boolean default null::boolean,
  p_authenticated_read boolean default null::boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if workbench.udt_dataset_access(p_table_id, 'editor') is not true then
    raise exception 'editor access required for dataset %', p_table_id using errcode = '42501';
  end if;
  return public._d31_impl_update_user_table_metadata(
    p_table_id, p_table_name, p_description, p_is_public, p_authenticated_read
  );
end;
$function$;

-- ── the remaining guards, rewritten in place ─────────────────────────────────
-- These four functions carry long bodies that this change has no business
-- retyping; the guard is a single expression inside each. Every replacement is
-- verified: a pattern that matches nothing RAISES and the whole migration rolls
-- back, and a function already converted is left alone so this file is
-- re-runnable.
do $$
declare
  r record;
  v_def text;
  v_new text;
  v_hits int;
  v_patterns text[][] := array[
    -- udt_delete_field, udt_set_field_format (one-line exists, editor)
    array[
      E'    auth.role() = ''service_role''\n' ||
      E'    or exists (select 1 from workbench.udt_datasets d where d.id = p_table_id and d.user_id = (select auth.uid()))\n' ||
      E'    or coalesce(public.has_permission(''dataset'', p_table_id, ''editor''), false)\n',
      E'    workbench.udt_dataset_access(p_table_id, ''editor'')\n'
    ],
    -- update_user_table_row_ordering (uppercase spelling)
    array[
      E'      auth.role() = ''service_role''\n' ||
      E'      OR EXISTS (SELECT 1 FROM workbench.udt_datasets d WHERE d.id = p_table_id AND d.user_id = (select auth.uid()))\n' ||
      E'      OR COALESCE(public.has_permission(''dataset'', p_table_id, ''editor''), false)\n',
      E'      workbench.udt_dataset_access(p_table_id, ''editor'')\n'
    ],
    -- udt_bulk_write, udt_change_field_type, udt_upsert_cell (one-line, wrong token)
    array[
      E'  IF v_dataset.user_id <> v_caller AND NOT has_permission(''workbench.udt_datasets'', p_table_id, ''editor''::permission_level) THEN',
      E'  IF NOT workbench.udt_dataset_access(p_table_id, ''editor'') THEN'
    ],
    -- udt_upsert_row (wrapped over two lines, wrong token)
    array[
      E'  IF v_dataset.user_id <> v_caller\n' ||
      E'     AND NOT has_permission(''workbench.udt_datasets'', p_table_id, ''editor''::permission_level) THEN',
      E'  IF NOT workbench.udt_dataset_access(p_table_id, ''editor'') THEN'
    ]
  ];
  v_i int;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in ('udt_delete_field', 'udt_set_field_format',
                        'update_user_table_row_ordering', 'udt_bulk_write',
                        'udt_change_field_type', 'udt_upsert_cell', 'udt_upsert_row')
  loop
    v_def := pg_get_functiondef(r.oid);

    if position('workbench.udt_dataset_access' in v_def) > 0 then
      raise notice 'udt guard: % already asks the row-policy grant — left alone', r.proname;
      continue;
    end if;

    v_new := v_def;
    v_hits := 0;
    for v_i in 1 .. array_length(v_patterns, 1) loop
      if position(v_patterns[v_i][1] in v_new) > 0 then
        v_new := replace(v_new, v_patterns[v_i][1], v_patterns[v_i][2]);
        v_hits := v_hits + 1;
      end if;
    end loop;

    if v_hits = 0 then
      raise exception
        'udt guard rewrite: no known guard shape found in public.% — its guard has changed shape, so this migration would have silently left it stricter than the row policy. Re-read the body and update the patterns.',
        r.proname;
    end if;

    execute v_new;
    raise notice 'udt guard: repointed public.% at workbench.udt_dataset_access', r.proname;
  end loop;
end $$;

-- ── prove it live, in this same transaction ──────────────────────────────────
-- The DB-side assertion the db-change skill prescribes: the guard must admit
-- whoever the row policy admits. Asserted as the reporting principal
-- (admin@admin.com, a super_admin with NO explicit grant on this dataset) and as
-- an anonymous principal, against the dataset the defect was filed on.
--
-- The applier runs inside a SECURITY DEFINER function, so `set role` is not
-- available here and real RLS cannot be exercised in this transaction. The
-- `std_select` qual is therefore read from pg_policies and EVALUATED as an
-- expression for that principal — the same technique iam.entity_read_equivalence
-- uses — and the RPC is called for real with that principal's JWT claims, which
-- is the code path the defect lives on.
do $$
declare
  v_admin uuid;
  v_dataset uuid := '59038c18-552c-427b-b855-6268b853fd89';
  v_qual text;
  v_policy_admits boolean;
  v_rows_in_table bigint;
  v_rows_via_rpc bigint;
begin
  select id into v_admin from auth.users where email = 'admin@admin.com';
  if v_admin is null then
    raise notice 'udt guard assertion skipped: no admin@admin.com in this database';
    return;
  end if;
  if not exists (select 1 from workbench.udt_datasets where id = v_dataset and deleted_at is null) then
    raise notice 'udt guard assertion skipped: dataset % is not in this database', v_dataset;
    return;
  end if;

  select p.qual into v_qual from pg_policies p
  where p.schemaname = 'workbench' and p.tablename = 'udt_datasets' and p.policyname = 'std_select';

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- does the ROW POLICY admit this dataset row to this principal?
  execute format('select (%s) from workbench.udt_datasets where id = %L', v_qual, v_dataset)
    into v_policy_admits;

  select count(*) into v_rows_in_table
  from workbench.udt_dataset_rows where table_id = v_dataset;

  -- does the complete-table RPC hand the same principal the whole table?
  select jsonb_array_length(public.get_user_table_complete(v_dataset) -> 'data')
    into v_rows_via_rpc;

  perform set_config('request.jwt.claims', '', true);

  if coalesce(v_policy_admits, false) is not true then
    raise exception
      'udt guard assertion INCONCLUSIVE: the std_select policy no longer admits dataset % to admin@admin.com, so this assertion proves nothing. Re-pick a shared table.',
      v_dataset;
  end if;
  if v_rows_via_rpc is distinct from v_rows_in_table then
    raise exception
      'udt guard assertion FAILED: the row policy admits dataset % to admin@admin.com and the table holds % rows, but the complete-table RPC returned % — the RPC is still applying a different rule than the RLS on the same rows.',
      v_dataset, v_rows_in_table, v_rows_via_rpc;
  end if;
  raise notice 'udt guard assertion: row policy admits the dataset and the complete-table RPC returned all % rows', v_rows_in_table;
end $$;

do $$
declare
  v_dataset uuid := '59038c18-552c-427b-b855-6268b853fd89';
  v_admitted boolean;
begin
  if not exists (select 1 from workbench.udt_datasets where id = v_dataset and deleted_at is null) then
    return;
  end if;
  -- The guard is a grant, not an open door: with no principal at all it refuses.
  -- Asked from the migration's own role, not `authenticated` — EXECUTE on the
  -- helper was just revoked from every client role, which is the point.
  perform set_config('request.jwt.claims', '', true);
  v_admitted := workbench.udt_dataset_access(v_dataset, 'viewer');
  if v_admitted is not false then
    raise exception
      'udt guard assertion FAILED: workbench.udt_dataset_access admitted an unauthenticated principal to dataset % (returned %).',
      v_dataset, v_admitted;
  end if;
  raise notice 'udt guard assertion: an unauthenticated principal is refused';
end $$;

notify pgrst, 'reload schema';
