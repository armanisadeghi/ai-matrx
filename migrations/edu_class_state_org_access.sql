-- edu_class_state_org_access.sql
--
-- Follow-up to edu_class_membership_access_model.sql. The edu_class_state read
-- guard blocked any non-owner/non-member from a non-open class — but context.scopes
-- RLS ALSO grants read to org members (has_org_access). An org co-member (e.g. a
-- co-teacher) could read the scope yet get a not-found from edu_class_state. Align
-- the state guard with RLS: also permit org members. Read-only visibility change;
-- join/approve/etc. are unaffected (still gated on membership role).
--
-- Idempotent: CREATE OR REPLACE.

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
    raise exception 'class % not found', p_class using errcode = 'NO_DATA_FOUND';
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