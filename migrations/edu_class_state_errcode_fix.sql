-- edu_class_state_errcode_fix.sql
--
-- Adversarial-review fix: `NO_DATA_FOUND` is not a valid PostgreSQL exception
-- condition name/SQLSTATE (`RAISE ... USING ERRCODE = 'NO_DATA_FOUND'` raises a
-- hard 42704 "unrecognized exception condition" instead of the intended clean
-- not-found error). This hit EVERY caller of `_edu_class()` (the shared resolver
-- used by every `edu_class_*` RPC) for a nonexistent class id, and the identical
-- bug in `edu_class_state`'s own inline guard for a non-member viewing a
-- closed/paid class. Not a leak (still fails closed — no data returned either
-- way), but it broke the intended "clean not-found, no oracle" contract with a
-- raw internal-error 500 instead of a catchable not-found response.
--
-- Fix: use the same `P0002` (no_data_found) SQLSTATE already used elsewhere in
-- this codebase (creator_update_profile, guardian_respond, edu_restore_study_data)
-- for "not found" conditions. Idempotent: CREATE OR REPLACE.

create or replace function public._edu_class(p_class uuid)
returns context.scopes
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_scope context.scopes;
begin
  select s.* into v_scope
  from context.scopes s
  join context.scope_types st on st.id = s.scope_type_id
  where s.id = p_class and st.slug = 'class';
  if v_scope.id is null then
    raise exception 'class % not found', p_class using errcode = 'P0002';
  end if;
  return v_scope;
end;
$$;

create or replace function public.edu_class_state(p_class uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_scope context.scopes; v_mode text; v_uid uuid := (select auth.uid());
  v_is_owner boolean; v_my_role text; v_my_status text;
  v_member_count int; v_pending_count int;
begin
  v_scope := public._edu_class(p_class);
  v_mode := public._edu_access_mode(v_scope);
  v_is_owner := public._edu_is_owner(v_scope);
  select role, status into v_my_role, v_my_status
  from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = v_uid and deleted_at is null
  order by (status = 'active') desc limit 1;
  if not v_is_owner and v_my_role is null and v_mode <> 'open'
     and not iam.has_org_access(v_scope.organization_id) then
    raise exception 'class % not found', p_class using errcode = 'P0002';
  end if;
  select count(*) filter (where status = 'active' and role = 'member'),
         count(*) filter (where status = 'pending')
    into v_member_count, v_pending_count
  from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id and deleted_at is null;
  return jsonb_build_object(
    'class_id', v_scope.id, 'name', v_scope.name, 'description', v_scope.description,
    'slug', v_scope.slug, 'organization_id', v_scope.organization_id,
    'access_mode', v_mode, 'settings', v_scope.settings, 'is_owner', v_is_owner,
    'my_role', case when v_is_owner then 'owner' else v_my_role end,
    'my_status', case when v_is_owner then 'active' else v_my_status end,
    'member_count', coalesce(v_member_count, 0),
    'pending_count', case when v_is_owner then coalesce(v_pending_count, 0) else null end
  );
end;
$$;
