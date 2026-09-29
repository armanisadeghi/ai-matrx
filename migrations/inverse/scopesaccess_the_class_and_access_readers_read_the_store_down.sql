-- INVERSE of migrations/campaign/scopesaccess_the_class_and_access_readers_read_the_store.sql (lane SCOPES-READS-ACCESS).
-- chair-step: puts back the 25 class / access readers and the two kernel expectations exactly as production held them (reading context.scopes), then drops the helpers and the composite type the up made.
@BASEDON@

CREATE OR REPLACE FUNCTION public.edu_class_approve(p_class uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope context.scopes; v_id uuid;
begin
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can approve members' using errcode = '42501';
  end if;
  update iam.memberships
    set status = 'active', role = 'member', updated_at = now(), updated_by = (select auth.uid())
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = p_user and status = 'pending' and deleted_at is null
  returning id into v_id;
  if v_id is null then return jsonb_build_object('status', 'not_pending'); end if;
  return jsonb_build_object('status', 'approved', 'user_id', p_user);
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_assign(p_class uuid, p_token text, p_resource uuid, p_due date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope context.scopes;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can assign content' using errcode = '42501';
  end if;
  if not public._edu_is_assignable_token(p_token) then
    raise exception 'token % is not assignable (expected fc_set or assessment)', p_token using errcode = '22023';
  end if;

  -- 0749 (A18): the RESOURCE was a caller-supplied id nobody checked — owning a
  -- class let a stranger assign someone else's deck into it. Assigning does not
  -- modify the resource, so `viewer` is the level: you must be able to SEE what
  -- you hand your students. Forbidden and nonexistent read identically.
  if p_resource is null
     or coalesce(iam.has_access_for(v_uid, p_token, p_resource, 'viewer'::public.permission_level), false) is not true then
    raise exception 'edu_class_assign: no viewer access to the % you are assigning', p_token
      using errcode = '42501';
  end if;

  insert into platform.associations
    (source_type, source_id, target_type, target_id, role, organization_id, created_by, metadata)
  values
    (p_token, p_resource, 'scope', v_scope.id, 'assignment', v_scope.organization_id, v_uid,
     jsonb_build_object('due_date', to_char(p_due, 'YYYY-MM-DD'), 'assigned_at', now(), 'assigned_by', v_uid))
  on conflict (source_type, source_id, target_type, target_id, role) do update
    set metadata = jsonb_build_object(
          'due_date', to_char(p_due, 'YYYY-MM-DD'),
          'assigned_at', coalesce(platform.associations.metadata->>'assigned_at', now()::text),
          'assigned_by', coalesce(platform.associations.metadata->>'assigned_by', v_uid::text)
        );

  return jsonb_build_object(
    'status', 'assigned', 'token', p_token, 'resource_id', p_resource,
    'due_date', to_char(p_due, 'YYYY-MM-DD')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_assignments(p_class uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope context.scopes;
  v_uid uuid := (select auth.uid());
  v_rows jsonb;
begin
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) and not public._edu_is_active_member(v_scope.id, v_uid) then
    raise exception 'not authorized to view this class''s assignments' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'token', a.source_type,
           'resource_id', a.source_id,
           'due_date', a.metadata->>'due_date',
           'assigned_at', a.metadata->>'assigned_at',
           'assigned_by', a.metadata->>'assigned_by'
         ) order by (a.metadata->>'due_date') nulls last, a.created_at), '[]'::jsonb)
    into v_rows
  from platform.associations_live a
  where a.target_type = 'scope' and a.target_id = v_scope.id and a.role = 'assignment';

  return v_rows;
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_confer_purchase(p_class uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope context.scopes; v_row iam.memberships;
begin
  if p_user is null then raise exception 'p_user is required' using errcode = '22023'; end if;
  v_scope := public._edu_class(p_class);
  select * into v_row from iam.memberships
   where container_type = 'scope' and container_id = v_scope.id
     and user_id = p_user and deleted_at is null
   order by (status = 'active') desc limit 1;
  if v_row.id is not null then
    update iam.memberships
       set status = 'active',
           role = case when role = 'owner' then 'owner' else 'member' end,
           updated_at = now(), updated_by = p_user,
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('grant_source', 'stripe_purchase')
     where id = v_row.id;
  else
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by, metadata)
    values (v_scope.organization_id, 'scope', v_scope.id, p_user, 'member', 'active', p_user,
            jsonb_build_object('grant_source', 'stripe_purchase'));
  end if;
  return jsonb_build_object('status', 'enrolled', 'user_id', p_user, 'class_id', v_scope.id);
end; $function$;

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

CREATE OR REPLACE FUNCTION public.edu_class_leave(p_class uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope context.scopes; v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  v_scope := public._edu_class(p_class);
  if public._edu_is_owner(v_scope) then
    raise exception 'the class owner cannot leave their own class' using errcode = '42501';
  end if;
  update iam.memberships set deleted_at = now(), updated_at = now(), updated_by = v_uid
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = v_uid and deleted_at is null;
  return jsonb_build_object('status', 'left');
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_progress_overview(p_class uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope context.scopes;
  v_uid uuid := (select auth.uid());
  v_assignments jsonb;
  v_students jsonb;
begin
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can view class progress' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'token', a.source_type,
           'resource_id', a.source_id,
           'due_date', a.metadata->>'due_date',
           'assigned_at', a.metadata->>'assigned_at'
         ) order by (a.metadata->>'due_date') nulls last, a.created_at), '[]'::jsonb)
    into v_assignments
  from platform.associations_live a
  where a.target_type = 'scope' and a.target_id = v_scope.id and a.role = 'assignment';

  select coalesce(jsonb_agg(student order by student->>'email'), '[]'::jsonb)
    into v_students
  from (
    select jsonb_build_object(
             'user_id', m.user_id,
             'email', u.email,
             'name', coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
             'cells', (
               select coalesce(jsonb_agg(
                 jsonb_build_object(
                   'token', a.source_type,
                   'resource_id', a.source_id,
                   'due_date', a.metadata->>'due_date'
                 ) || public._edu_resource_progress(a.source_type, a.source_id, m.user_id)
                 order by (a.metadata->>'due_date') nulls last, a.created_at
               ), '[]'::jsonb)
               from platform.associations_live a
               where a.target_type = 'scope' and a.target_id = v_scope.id and a.role = 'assignment'
             )
           ) as student
    from iam.memberships m
    join auth.users u on u.id = m.user_id
    where m.container_type = 'scope' and m.container_id = v_scope.id
      and m.status = 'active' and m.role = 'member' and m.deleted_at is null
  ) t;

  return jsonb_build_object('assignments', v_assignments, 'students', v_students);
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_remove(p_class uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope context.scopes;
begin
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can remove members' using errcode = '42501';
  end if;
  if p_user = v_scope.created_by then
    raise exception 'cannot remove the class owner' using errcode = '42501';
  end if;
  update iam.memberships set deleted_at = now(), updated_at = now(), updated_by = (select auth.uid())
  where container_type = 'scope' and container_id = v_scope.id
    and user_id = p_user and deleted_at is null;
  return jsonb_build_object('status', 'removed', 'user_id', p_user);
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.edu_class_revoke_purchase(p_class uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope context.scopes; v_row iam.memberships;
begin
  v_scope := public._edu_class(p_class);
  select * into v_row from iam.memberships
   where container_type = 'scope' and container_id = v_scope.id
     and user_id = p_user and deleted_at is null and role <> 'owner'
   limit 1;
  if v_row.id is null then return jsonb_build_object('status', 'not_member', 'user_id', p_user); end if;
  update iam.memberships
     set deleted_at = now(), updated_at = now(), updated_by = p_user,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('revoke_source', 'stripe_refund')
   where id = v_row.id;
  return jsonb_build_object('status', 'revoked', 'user_id', p_user);
end; $function$;

CREATE OR REPLACE FUNCTION public.edu_class_roster(p_class uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope context.scopes; v_uid uuid := (select auth.uid());
  v_is_owner boolean; v_is_member boolean; v_rows jsonb;
begin
  v_scope := public._edu_class(p_class);
  perform public._edu_ensure_owner_membership(v_scope);
  v_is_owner := public._edu_is_owner(v_scope);
  v_is_member := exists (
    select 1 from iam.memberships m
    where m.container_type = 'scope' and m.container_id = v_scope.id
      and m.user_id = v_uid and m.status = 'active' and m.deleted_at is null
  );
  if not v_is_owner and not v_is_member then
    raise exception 'not authorized to view this roster' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(row order by rank, created_at), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
             'user_id', m.user_id,
             'email', case when v_is_owner then u.email else null end,
             'display_name', p.display_name,
             'role', m.role,
             'status', m.status, 'created_at', m.created_at) as row,
           case m.status when 'active' then 0 when 'pending' then 1 else 2 end as rank,
           m.created_at
    from iam.memberships m
    join auth.users u on u.id = m.user_id
    left join users.profiles p on p.id = m.user_id
    where m.container_type = 'scope' and m.container_id = v_scope.id and m.deleted_at is null
      and (v_is_owner or m.status = 'active')
  ) t;
  return v_rows;
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_state(p_class uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    perform platform.refuse_not_found(format('class %s not found', p_class));
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
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_student_progress(p_class uuid, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope context.scopes;
  v_uid uuid := (select auth.uid());
  v_is_owner boolean;
  v_rows jsonb;
begin
  v_scope := public._edu_class(p_class);
  v_is_owner := public._edu_is_owner(v_scope);

  if not v_is_owner and v_uid <> p_user then
    raise exception 'not authorized to view this student''s class progress' using errcode = '42501';
  end if;
  if not public._edu_is_active_member(v_scope.id, p_user) then
    raise exception 'user is not an active member of this class' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'token', a.source_type,
             'resource_id', a.source_id,
             'due_date', a.metadata->>'due_date'
           ) || public._edu_resource_progress(a.source_type, a.source_id, p_user)
           order by (a.metadata->>'due_date') nulls last, a.created_at
         ), '[]'::jsonb)
    into v_rows
  from platform.associations_live a
  where a.target_type = 'scope' and a.target_id = v_scope.id and a.role = 'assignment';

  return v_rows;
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_unassign(p_class uuid, p_token text, p_resource uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope context.scopes;
begin
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can remove assignments' using errcode = '42501';
  end if;
  -- TAILS-5: ARCHIVED, NOT DESTROYED. Un-assigning and re-assigning the same resource keeps
  -- ONE assignment with ONE history, which is what a teacher would expect of a class register.
  perform platform.assoc_unset(p_token, p_resource, 'scope', v_scope.id, 'assignment',
                               'scope', v_scope.id);
  return jsonb_build_object('status', 'unassigned', 'token', p_token, 'resource_id', p_resource);
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_join_code(p_class uuid, p_action text DEFAULT 'get'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope context.scopes;
  v_uid uuid := (select auth.uid());
  v_code text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_action not in ('get', 'rotate', 'disable') then
    raise exception 'invalid action %', p_action using errcode = '22023';
  end if;
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'class owner required' using errcode = '42501';
  end if;

  v_code := v_scope.settings->>'join_code';

  if p_action = 'disable' then
    update context.scopes
       set settings = coalesce(settings, '{}'::jsonb) - 'join_code',
           updated_at = now(), updated_by = v_uid
     where id = v_scope.id;
    return jsonb_build_object('code', null);
  end if;

  if p_action = 'rotate' or v_code is null then
    v_code := public._edu_generate_join_code();
    update context.scopes
       set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{join_code}', to_jsonb(v_code)),
           updated_at = now(), updated_by = v_uid
     where id = v_scope.id;
  end if;

  return jsonb_build_object('code', v_code);
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_set_access(p_class uuid, p_access_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope context.scopes; v_settings jsonb;
begin
  if p_access_mode not in ('open', 'closed', 'paid') then
    raise exception 'invalid access_mode %', p_access_mode using errcode = '22023';
  end if;
  v_scope := public._edu_class(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can change access mode' using errcode = '42501';
  end if;
  v_settings := coalesce(v_scope.settings, '{}'::jsonb) || jsonb_build_object('access_mode', p_access_mode);
  update context.scopes set settings = v_settings, updated_at = now() where id = v_scope.id;
  perform public._edu_ensure_owner_membership(v_scope);
  return jsonb_build_object('status', 'ok', 'access_mode', p_access_mode);
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_class_by_code(p_code text)
 RETURNS TABLE(class_id uuid, name text, description text, access_mode text, member_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_code, ''))) < 4 then
    return; -- an impossible code matches nothing
  end if;
  return query
  select s.id,
         s.name,
         s.description,
         public._edu_access_mode(s),
         (select count(*) from iam.memberships m
           where m.container_type = 'scope' and m.container_id = s.id
             and m.status = 'active' and m.deleted_at is null)
  from context.scopes s
  join context.scope_types st on st.id = s.scope_type_id
  where st.slug = 'class'
    and s.deleted_at is null
    and s.settings->>'join_code' is not null
    and upper(s.settings->>'join_code') = upper(btrim(p_code))
  limit 1;
end;
$function$;

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
  if length(btrim(coalesce(p_code, ''))) < 4 then
    perform platform.refuse_not_found('invalid join code');
  end if;

  select s.* into v_scope
  from context.scopes s
  join context.scope_types st on st.id = s.scope_type_id
  where st.slug = 'class'
    and s.deleted_at is null
    and s.settings->>'join_code' is not null
    and upper(s.settings->>'join_code') = upper(btrim(p_code))
  limit 1;
  if v_scope.id is null then
    perform platform.refuse_not_found('invalid join code');
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

CREATE OR REPLACE FUNCTION public._edu_generate_join_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_attempt int := 0;
begin
  loop
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception 'could not generate a unique join code';
    end if;
    select string_agg(substr(v_alphabet, 1 + floor(random() * 32)::int, 1), '')
      into v_code
      from generate_series(1, 6);
    exit when not exists (
      select 1
      from context.scopes s
      join context.scope_types st on st.id = s.scope_type_id
      where st.slug = 'class'
        and s.deleted_at is null
        and s.settings->>'join_code' is not null
        and upper(s.settings->>'join_code') = v_code
    );
  end loop;
  return v_code;
end;
$function$;

CREATE OR REPLACE FUNCTION public.edu_my_classes()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_uid uuid := (select auth.uid()); v_rows jsonb;
begin
  if v_uid is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'class_id', s.id, 'name', s.name, 'description', s.description, 'slug', s.slug,
           'organization_id', s.organization_id, 'access_mode', public._edu_access_mode(s),
           'settings', s.settings, 'my_role', m.role, 'my_status', m.status, 'owner_id', s.created_by
         ) order by s.name), '[]'::jsonb) into v_rows
  from iam.memberships m
  join context.scope_types st on st.slug = 'class'
  join context.scopes s on s.id = m.container_id and s.scope_type_id = st.id
  where m.container_type = 'scope' and m.user_id = v_uid and m.deleted_at is null;
  return v_rows;
end;
$function$;

CREATE OR REPLACE FUNCTION public.creator_public_page(p_handle text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'users'
AS $function$
declare
  v_handle text := lower(btrim(coalesce(p_handle, '')));
  p record;
  v_item jsonb;
  v_kind text;
  v_out jsonb;
  v_featured jsonb := '[]'::jsonb;
  v_enriched jsonb;
  v_scope context.scopes;
  v_mode text;
  v_cents int;
  v_price jsonb;
begin
  if v_handle = '' then return null; end if;

  -- DD-152 / T-13 2.2: the publication flag AND (public, or an active Anyone link on the profile).
  -- A handle that is not published, or whose Anyone link was revoked, returns NULL — never an error that would confirm the
  -- handle exists (access DECISIONS 2026-08-11).
  select id, creator_handle, display_name, avatar_url, creator_tagline,
         creator_bio, creator_links, creator_featured, creator_published_at, updated_at
    into p
  from users.profiles
  where lower(creator_handle) = v_handle
    and creator_public = true
    and deleted_at is null
    and (visibility = 'public'::platform.visibility
         or platform.anyone_link_active('user_profile', id))
  limit 1;

  if p.id is null then return null; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p.creator_featured, '[]'::jsonb))
  loop
    v_kind := v_item->>'kind';
    if v_kind = 'youtube' then
      if coalesce(v_item->>'videoId', '') <> '' then
        v_featured := v_featured || jsonb_build_array(jsonb_build_object(
          'kind', 'youtube', 'videoId', v_item->>'videoId', 'title', v_item->>'title'
        ));
      end if;
    elsif v_kind = 'class' then
      if coalesce(v_item->>'classId', '') <> '' then
        v_mode := coalesce(v_item->>'accessMode', 'open');
        v_price := v_item->'price';
        begin
          select s.* into v_scope
          from context.scopes s
          join context.scope_types st on st.id = s.scope_type_id
          where s.id = (v_item->>'classId')::uuid and st.slug = 'class' and s.deleted_at is null;
          if v_scope.id is not null then
            v_mode := coalesce(nullif(v_scope.settings->>'access_mode', ''), 'open');
            v_cents := nullif(v_scope.settings->>'price_cents', '')::int;
            if v_cents is not null then
              v_price := to_jsonb(round(v_cents / 100.0, 2));
            else
              v_price := null;
            end if;
          end if;
        exception when others then null;
        end;
        v_featured := v_featured || jsonb_build_array(jsonb_build_object(
          'kind', 'class', 'classId', v_item->>'classId',
          'title', coalesce(v_item->>'title', 'Class'),
          'description', v_item->>'description',
          'accessMode', v_mode, 'price', v_price
        ));
      end if;
    elsif v_kind = 'resource' then
      v_enriched := public.creator_resolve_featured_resource(v_item->>'resourceType', (v_item->>'id')::uuid);
      if v_enriched is not null then
        v_featured := v_featured || jsonb_build_array(v_enriched);
      end if;
    end if;
  end loop;

  v_out := jsonb_build_object(
    'handle', p.creator_handle, 'displayName', p.display_name, 'avatarUrl', p.avatar_url,
    'tagline', p.creator_tagline, 'bio', p.creator_bio,
    'links', coalesce(p.creator_links, '[]'::jsonb), 'featured', v_featured,
    'publishedAt', p.creator_published_at, 'updatedAt', p.updated_at
  );
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION public.inv_get_by_token(p_token text)
 RETURNS TABLE(id uuid, organization_id uuid, target_type text, target_id uuid, email text, invited_user_id uuid, role text, status text, expires_at timestamp with time zone, accepted_at timestamp with time zone, created_at timestamp with time zone, created_by uuid, target_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    i.id,
    i.organization_id,
    i.target_type,
    i.target_id,
    i.email,
    i.invited_user_id,
    i.role,
    i.status,
    i.expires_at,
    i.accepted_at,
    i.created_at,
    i.created_by,
    CASE
      WHEN i.target_type = 'organization' THEN (
        SELECT o.name FROM iam.organizations o WHERE o.id = i.target_id
      )
      WHEN i.target_type = 'project' THEN (
        SELECT p.name FROM workspace.projects p WHERE p.id = i.target_id
      )
      WHEN i.target_type = 'scope' THEN (
        SELECT s.name FROM context.scopes s WHERE s.id = i.target_id
      )
      ELSE NULL
    END AS target_name
  FROM iam.invitations i
  WHERE i.token = p_token
    AND i.deleted_at IS NULL
    AND (
      i.invited_user_id = (select auth.uid())
      OR lower(i.email) = lower((
        SELECT u.email FROM auth.users u WHERE u.id = (select auth.uid())
      ))
    );
$function$;

CREATE OR REPLACE FUNCTION iam._container_authz(p_container_type text, p_container_id uuid, p_actor uuid, p_require_role boolean DEFAULT true)
 RETURNS TABLE(resource_org_id uuid, resource_creator uuid, actor_role text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_service boolean := coalesce(auth.role() = 'service_role', false);
begin
  for resource_org_id, resource_creator, actor_role in
    select
      organization.id,
      organization.created_by,
      (
        select membership.role
        from iam.memberships as membership
        where membership.container_type = 'organization'
          and membership.container_id = organization.id
          and membership.organization_id = organization.id
          and membership.user_id = p_actor
          and membership.status = 'active'
          and membership.deleted_at is null
        limit 1
      )
    from iam.organizations as organization
    where p_container_type = 'organization'
      and organization.id = p_container_id

    union all

    select
      project.organization_id,
      project.created_by,
      (
        select membership.role
        from iam.memberships as membership
        where membership.container_type = 'project'
          and membership.container_id = project.id
          and membership.organization_id = project.organization_id
          and membership.user_id = p_actor
          and membership.status = 'active'
          and membership.deleted_at is null
        limit 1
      )
    from workspace.projects as project
    where p_container_type = 'project'
      and project.id = p_container_id
      and project.deleted_at is null

    union all

    select
      scope.organization_id,
      scope.created_by,
      (
        case
          when scope.created_by = p_actor then 'owner'
          when exists (
            select 1
            from iam.memberships as org_membership
            where org_membership.container_type = 'organization'
              and org_membership.container_id = scope.organization_id
              and org_membership.user_id = p_actor
              and org_membership.role in ('owner', 'admin')
              and org_membership.status = 'active'
              and org_membership.deleted_at is null
          ) then 'admin'
          else (
            select scope_membership.role
            from iam.memberships as scope_membership
            where scope_membership.container_type = 'scope'
              and scope_membership.container_id = scope.id
              and scope_membership.user_id = p_actor
              and scope_membership.status = 'active'
              and scope_membership.deleted_at is null
            limit 1
          )
        end
      )
    from context.scopes as scope
    where p_container_type = 'scope'
      and scope.id = p_container_id
      and scope.deleted_at is null
  loop
    -- THE REFUSAL, before any caller compares anything. A container that does not exist still
    -- returns no rows and no error, so a caller's own "not found" sentence is unchanged.
    if p_require_role and not v_service and actor_role is null then
      raise exception
        'You are not a member of this %, so you can''t manage it. Ask one of its owners or admins.',
        p_container_type
        using errcode = '42501';
    end if;
    return next;
  end loop;
  return;
end;
$function$;

CREATE OR REPLACE FUNCTION platform.entity_row_access_attrs(p_schema text, p_table text, p_id uuid, OUT o_vis platform.visibility, OUT o_owner uuid, OUT o_org uuid, OUT o_found boolean)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform'
AS $function$
DECLARE
  v_registry_vis platform.visibility;
  v_probe record;
BEGIN
  o_found := false;
  o_vis := 'personal'::platform.visibility;
  o_owner := NULL;
  o_org := NULL;

  IF p_schema IS NULL OR p_table IS NULL OR p_id IS NULL THEN
    RETURN;
  END IF;

  -- 🚨 LADDER-PERF (2026-09-20) — A PARTITIONED ROW IS PROBED BY A CACHED PLAN.
  -- Everything below this line is unchanged and is still the general case. What changed is
  -- that a table PostgreSQL has to plan a sixteen-way Append for is no longer planned from
  -- scratch on every call: plpgsql's EXECUTE never caches a plan, and this function is called
  -- once per node of every containment walk in iam.has_access_for_base. Measured on the main
  -- database: 0.881 ms a call for custom.record, of which 0.814 ms was planning — against
  -- 0.139 ms for the identical probe as static, plan-cached SQL. The static arms are GENERATED
  -- from platform.entity_types by platform.rebuild_static_row_probes(), they use the shape the
  -- fallbacks below would have reached, and any surprise at all hands the question straight
  -- back to them (o_handled = false).
  v_probe := platform.partitioned_row_attrs(p_schema, p_table, p_id);
  IF v_probe.o_handled THEN
    o_vis := v_probe.o_vis; o_owner := v_probe.o_owner;
    o_org := v_probe.o_org; o_found := v_probe.o_found;
    RETURN;
  END IF;

  BEGIN
    EXECUTE format(
      'SELECT visibility, created_by, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  BEGIN
    EXECUTE format(
      'SELECT visibility, owner_id, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  BEGIN
    EXECUTE format(
      'SELECT ''personal''::platform.visibility, owner_id, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  BEGIN
    EXECUTE format(
      'SELECT ''personal''::platform.visibility, created_by, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  -- Registry-declared intent for tables with no ownership columns; 'personal'
  -- remains the default when the registry declares nothing.
  SELECT et.default_visibility
    INTO v_registry_vis
  FROM platform.entity_types et
  WHERE et.schema_name = p_schema
    AND et.table_name = p_table
  LIMIT 1;

  -- No ownership columns, but the table IS org-scoped (context.scope_types,
  -- runtime plumbing, ...): surface organization_id so membership-based access
  -- can apply, with the registry's declared visibility.
  BEGIN
    EXECUTE format(
      'SELECT $2::platform.visibility, NULL::uuid, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found
    USING p_id, coalesce(v_registry_vis, 'personal'::platform.visibility);
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  -- Row exists but the table carries NO ownership columns at all — a platform
  -- catalog (ui.ui_surface, ...). There is no owner and no org to key access
  -- on, so 'personal' is meaningless here and denies everyone. Honor the
  -- registry's declared intent; 'personal' remains the default when the
  -- registry declares nothing.
  BEGIN
    EXECUTE format(
      'SELECT $2::platform.visibility, NULL::uuid, NULL::uuid, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found
    USING p_id, coalesce(v_registry_vis, 'personal'::platform.visibility);
  EXCEPTION WHEN others THEN
    o_found := false;
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION iam.entity_read_kernel_expected()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT 'b4faece590847dcca4ab549d8938dceb'::text
$function$;

CREATE OR REPLACE FUNCTION iam.entity_read_kernel_members_expected()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT '{"members": {"files.is_crawl_artifact(p_file_id uuid)": "7eb586213cedff72ee4abb4dd60a0433", "iam.candidate_admits(p_type text, p_id uuid)": "aaafd2a1d1fb3e3579c326fe11d70cac", "iam.accessible_entity_candidates(p_type text)": "ff4a1d407ed7e37438cb773f0d5ce80e", "iam.accessible_child_parents(p_child_type text)": "97be40a64243f6225d0eadfb82e33827", "iam.has_org_access_for(p_user_id uuid, p_org uuid)": "05abb4362cb28aa7d775eedf975889f9", "public.is_pack_curator(p_user uuid, p_pack_id uuid)": "5e6f2b3c9c4f0f9011655974ef1532b7", "public.is_org_admin_for(p_user_id uuid, p_org_id uuid)": "ac5072f5e23eb0dfffb7ef05e9899ad4", "files.crawl_site_conveys(p_user_id uuid, p_file_id uuid)": "5fadac4e0d1ad31e788cdb446422d8fc", "public._edu_can_read_via_assignment(p_type text, p_id uuid)": "d97bbb3323238c5b8afb88e3e6337434", "public.is_rulebook_curator(p_user uuid, p_rulebook_id uuid)": "b781c4c0210974d680f53a603cb723aa", "public.library_is_open(p_entity_type text, p_entity_id uuid)": "36c934bb956df459e334c15085aacd30", "public.user_can_read_data_store_via_grant(p_user uuid, p_store uuid)": "63b3fd7f798351c9c8e7517fcfedc3fc", "public._edu_can_read_via_assignment(p_user_id uuid, p_type text, p_id uuid)": "a0d7ac13ea23ec81b8eb15bbb87e3cbb", "public.user_can_read_via_library_grant(p_user uuid, p_type text, p_id uuid)": "a49b44fa2f0de5d3aecace9d950f49e4", "files.has_access_for(p_user_id uuid, p_file_id uuid, p_required permission_level)": "d324b5143d4172b0a6b8b8188930ff7b", "iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer)": "9fe155aa00093efd6fc9c89ab94b8479", "iam.has_access_for(p_user_id uuid, p_type text, p_id uuid, p_required permission_level)": "c7e2eec401c991f06be4bf28453548e5", "iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level)": "e37fdacb359b9a528d7aef6b2bfb5270", "iam.accessible_entity_ids(p_type text, p_required permission_level, p_depth integer, p_include_public boolean)": "661718136aea523e98df23cd561d5308", "iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean)": "e6b147f6962003e0dc2c8b826ef4ee06", "public.has_permission_for(p_user_id uuid, p_resource_type text, p_resource_id uuid, p_required_permission permission_level)": "9dc1eecf01de31f4db0b0e07b1665a2b", "iam.has_access_for_base(p_user_id uuid, p_type text, p_id uuid, p_required permission_level, p_include_public boolean, p_path text[])": "746f0149143475d84be45497155a7b27", "platform.entity_row_access_attrs(p_schema text, p_table text, p_id uuid, OUT o_vis platform.visibility, OUT o_owner uuid, OUT o_org uuid, OUT o_found boolean)": "4cab0999cad6cee27fa4c6804d2f0955"}, "fingerprint": "b4faece590847dcca4ab549d8938dceb"}'::jsonb
$function$;

-- The helpers this file made (nothing else calls them once the bodies above are back).
drop function public._edu_ensure_owner_membership(public._edu_class_row);
drop function public._edu_is_owner(public._edu_class_row);
drop function public._edu_access_mode(public._edu_class_row);
drop function public._edu_live_class_by_code(text);
drop function public._edu_class_of(uuid);
drop function public._edu_class_find(uuid);
drop type public._edu_class_row;
drop function custom._ctx_scope_settings(uuid, uuid, jsonb);
drop function custom._ctx_setting_back(jsonb, text);

-- The kernel went back to the fingerprint recorded before the file.
do $post$
begin
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'scopesaccess inverse: the live fingerprint % is not the restored expectation %', iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  end if;
  insert into platform.kernel_fingerprint_record
    (fingerprint_from, fingerprint_to, members_changed, ruling, fixture_version, evidence, via, target)
  values ('58b3102910ead236f3590d52ccb71d87', iam.entity_read_kernel_fingerprint(),
          array['platform.entity_row_access_attrs(p_schema text, p_table text, p_id uuid, OUT o_vis platform.visibility, OUT o_owner uuid, OUT o_org uuid, OUT o_found boolean)'],
          'SCOPES-READS-ACCESS inverse: entity_row_access_attrs back on its dynamic probe for context.scopes and context.context_items.',
          'v2', jsonb_build_object('inverse_of', 'scopesaccess_the_class_and_access_readers_read_the_store.sql'),
          'inverse scopesaccess_the_class_and_access_readers_read_the_store_down.sql / lane SCOPES-READS-ACCESS', 'platform.entity_row_access_attrs');
end $post$;
