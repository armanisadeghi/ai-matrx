-- Rejoin-after-leave fix for the class membership RPC family.
--
-- THE BUG (found live during WP6 verification, 2026-08-18): edu_class_leave /
-- edu_class_remove SOFT-delete the membership row (deleted_at = now()), but the
-- unique index on (container_type, container_id, user_id) still covers it. Every
-- joiner RPC looked up the caller's row with `deleted_at is null` (finds nothing)
-- and then blind-INSERTed → 23505 → HTTP 409. So "They can re-join or re-request
-- later" (the remove dialog's own copy) was FALSE for edu_class_join,
-- edu_class_request, edu_class_grant, and edu_class_join_by_code. inv_accept was
-- already correct (ON CONFLICT DO UPDATE ... deleted_at = null) and is the model.
--
-- THE FIX: look the row up WITHOUT the deleted_at filter (the unique index
-- guarantees at most one), treat a soft-deleted row as "not currently a member",
-- and make every reactivating UPDATE clear deleted_at. Guards/behaviour otherwise
-- byte-identical to the live originals.

-- ── edu_class_join ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.edu_class_join(p_class uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope context.scopes; v_mode text; v_uid uuid := (select auth.uid()); v_row iam.memberships; v_live boolean;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  v_scope := public._edu_class(p_class);
  v_mode := public._edu_access_mode(v_scope);
  if public._edu_is_owner(v_scope) then
    perform public._edu_ensure_owner_membership(v_scope);
    return jsonb_build_object('status', 'already_member', 'role', 'owner', 'access_mode', v_mode);
  end if;
  select * into v_row from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = v_uid limit 1;
  v_live := v_row.id is not null and v_row.deleted_at is null;
  if v_live and v_row.status = 'active' then
    return jsonb_build_object('status', 'already_member', 'role', v_row.role, 'access_mode', v_mode);
  end if;
  if v_mode = 'open' then
    if v_row.id is not null then
      update iam.memberships set status = 'active', role = 'member', deleted_at = null, updated_at = now(), updated_by = v_uid where id = v_row.id;
    else
      insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
      values (v_scope.organization_id, 'scope', v_scope.id, v_uid, 'member', 'active', v_uid);
    end if;
    return jsonb_build_object('status', 'joined', 'role', 'member', 'access_mode', v_mode);
  end if;
  if v_mode = 'closed' then
    if v_live and v_row.status = 'pending' then
      return jsonb_build_object('status', 'pending', 'access_mode', v_mode);
    end if;
    return jsonb_build_object('status', 'needs_request', 'access_mode', v_mode);
  end if;
  if v_mode = 'paid' then
    if v_live and v_row.status = 'entitled' then
      update iam.memberships set status = 'active', role = 'member', deleted_at = null, updated_at = now(), updated_by = v_uid where id = v_row.id;
      return jsonb_build_object('status', 'joined', 'role', 'member', 'access_mode', v_mode);
    end if;
    return jsonb_build_object('status', 'needs_purchase', 'access_mode', v_mode);
  end if;
  raise exception 'unknown access_mode %', v_mode;
end;
$function$;

-- ── edu_class_request ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.edu_class_request(p_class uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope context.scopes; v_mode text; v_uid uuid := (select auth.uid()); v_row iam.memberships; v_live boolean;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  v_scope := public._edu_class(p_class);
  v_mode := public._edu_access_mode(v_scope);
  if public._edu_is_owner(v_scope) then
    return jsonb_build_object('status', 'already_member', 'role', 'owner', 'access_mode', v_mode);
  end if;
  if v_mode = 'open' or v_mode = 'paid' then
    return public.edu_class_join(p_class);
  end if;
  select * into v_row from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = v_uid limit 1;
  v_live := v_row.id is not null and v_row.deleted_at is null;
  if v_live and v_row.status = 'active' then
    return jsonb_build_object('status', 'already_member', 'role', v_row.role, 'access_mode', v_mode);
  end if;
  if v_live and v_row.status = 'pending' then
    return jsonb_build_object('status', 'pending', 'access_mode', v_mode);
  end if;
  if v_row.id is not null then
    update iam.memberships set status = 'pending', role = 'member', deleted_at = null, updated_at = now(), updated_by = v_uid where id = v_row.id;
  else
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
    values (v_scope.organization_id, 'scope', v_scope.id, v_uid, 'member', 'pending', v_uid);
  end if;
  return jsonb_build_object('status', 'pending', 'access_mode', v_mode);
end;
$function$;

-- ── edu_class_grant ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.edu_class_grant(p_class uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope context.scopes; v_row iam.memberships;
begin
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can grant access' using errcode = '42501';
  end if;
  select * into v_row from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = p_user limit 1;
  if v_row.id is not null then
    if v_row.status = 'active' and v_row.deleted_at is null then
      return jsonb_build_object('status', 'already_member');
    end if;
    update iam.memberships set status = 'entitled', role = 'member', deleted_at = null, updated_at = now(), updated_by = (select auth.uid()) where id = v_row.id;
  else
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
    values (v_scope.organization_id, 'scope', v_scope.id, p_user, 'member', 'entitled', (select auth.uid()));
  end if;
  return jsonb_build_object('status', 'entitled', 'user_id', p_user);
end;
$function$;

-- ── edu_class_join_by_code ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.edu_class_join_by_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_scope context.scopes;
  v_mode text;
  v_row iam.memberships;
  v_live boolean;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;

  select s.* into v_scope
  from context.scopes s
  join context.scope_types st on st.id = s.scope_type_id
  where st.slug = 'class'
    and s.deleted_at is null
    and upper(coalesce(s.settings->>'join_code', '')) = upper(btrim(p_code))
  limit 1;
  if v_scope.id is null then
    raise exception 'invalid join code' using errcode = 'P0002';
  end if;

  v_mode := public._edu_access_mode(v_scope);

  if public._edu_is_owner(v_scope) then
    perform public._edu_ensure_owner_membership(v_scope);
    return jsonb_build_object('status', 'already_member', 'role', 'owner', 'access_mode', v_mode, 'class_id', v_scope.id);
  end if;

  select * into v_row from iam.memberships
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = v_uid limit 1;
  v_live := v_row.id is not null and v_row.deleted_at is null;

  if v_live and v_row.status = 'active' then
    return jsonb_build_object('status', 'already_member', 'role', v_row.role, 'access_mode', v_mode, 'class_id', v_scope.id);
  end if;

  if v_mode = 'paid' and not (v_live and v_row.status = 'entitled') then
    return jsonb_build_object('status', 'needs_purchase', 'access_mode', v_mode, 'class_id', v_scope.id);
  end if;

  if v_row.id is not null then
    update iam.memberships
       set status = 'active', role = 'member', deleted_at = null, updated_at = now(), updated_by = v_uid
     where id = v_row.id;
  else
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by)
    values (v_scope.organization_id, 'scope', v_scope.id, v_uid, 'member', 'active', v_uid);
  end if;

  return jsonb_build_object('status', 'joined', 'role', 'member', 'access_mode', v_mode, 'class_id', v_scope.id);
end;
$function$;
