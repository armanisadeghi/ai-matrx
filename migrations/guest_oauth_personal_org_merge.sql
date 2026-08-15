-- Guest OAuth transfer: merge guest work into the permanent user's personal
-- organization without transferring the guest organization itself.
--
-- The original transfer walked every FK to auth.users(id). That included
-- iam.organizations.created_by and iam.memberships.user_id, so signing into an
-- existing OAuth account converted the guest's personal workspace into a
-- second personal workspace on that account. Organization-scoped data also
-- stayed attached to the guest workspace.

do $$
declare
  v_source_org constant uuid := '75e4e2fa-9fe3-4564-be04-056c887f8a9b';
  v_target_org constant uuid := '3e790542-fdaf-40b2-8bf3-658bf94fe67f';
  v_anon_user constant uuid := '2be72dda-98df-4073-8ea7-1aefdf517f34';
  v_target_user constant uuid := '4cf62e4e-2679-484f-b652-034e697418df';
  v_col record;
  v_count bigint;
  v_moved bigint := 0;
begin
  if not exists (
    select 1 from iam.organizations
    where id = v_source_org and is_personal is true and created_by = v_target_user
  ) then
    raise exception 'guest personal-org repair refused: source organization is not in the expected transferred state';
  end if;
  if not exists (
    select 1 from iam.organizations
    where id = v_target_org and is_personal is true and created_by = v_target_user
  ) then
    raise exception 'guest personal-org repair refused: target personal organization is missing';
  end if;
  if not exists (
    select 1 from iam.memberships
    where organization_id = v_source_org
      and container_type = 'organization' and container_id = v_source_org
      and user_id = v_target_user and deleted_at is null
  ) then
    raise exception 'guest personal-org repair refused: transferred owner membership is missing';
  end if;

  -- Re-home every real FK except the guest workspace's own membership. No
  -- organization or user-authored row is deleted.
  for v_col in
    select n.nspname as sch, cl.relname as tbl, a.attname as col
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace refn on refn.oid = ref.relnamespace
    join unnest(con.conkey) as ck(attnum) on true
    join pg_attribute a on a.attrelid = cl.oid and a.attnum = ck.attnum
    where con.contype = 'f'
      and refn.nspname = 'iam' and ref.relname = 'organizations'
      and not (n.nspname = 'iam' and cl.relname = 'memberships')
      and n.nspname not in (
        'auth', 'storage', 'graveyard', 'realtime', 'vault', 'extensions',
        'pgsodium', 'supabase_functions'
      )
    order by n.nspname, cl.relname, a.attname
  loop
    execute format(
      'update %I.%I set %I = $1 where %I = $2',
      v_col.sch, v_col.tbl, v_col.col, v_col.col
    ) using v_target_org, v_source_org;
    get diagnostics v_count = row_count;
    v_moved := v_moved + v_count;
  end loop;

  -- Polymorphic organization edges do not carry physical FKs.
  update platform.associations set source_id = v_target_org
  where source_type = 'organization' and source_id = v_source_org;
  get diagnostics v_count = row_count;
  v_moved := v_moved + v_count;

  update platform.associations set target_id = v_target_org
  where target_type = 'organization' and target_id = v_source_org;
  get diagnostics v_count = row_count;
  v_moved := v_moved + v_count;

  -- Undo only the two machinery rewrites that made the guest workspace appear
  -- on the permanent account. The guest auth row is retained and banned.
  update iam.organizations set created_by = v_anon_user where id = v_source_org;
  update iam.memberships set user_id = v_anon_user
  where organization_id = v_source_org
    and container_type = 'organization' and container_id = v_source_org
    and user_id = v_target_user;

  update public.guest_conversion_audit
  set transferred = transferred || jsonb_build_object(
    'personal_org_rows_rehomed', v_moved,
    'personal_org_source_restored', 1
  )
  where anon_user_id = v_anon_user and new_user_id = v_target_user;
end;
$$;

create unique index if not exists organizations_one_personal_per_creator
  on iam.organizations (created_by)
  where is_personal is true and created_by is not null;

create or replace function public._d31_impl_ensure_personal_organization(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_email text;
  v_existing_id uuid;
  v_org_id uuid;
  v_username text;
  v_base_slug text;
  v_slug text;
  v_attempt int := 0;
  v_uuid_hex text;
begin
  if p_user_id is null then
    raise exception 'ensure_personal_organization: p_user_id cannot be NULL';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'ensure_personal_organization: user % does not exist', p_user_id;
  end if;

  select id into v_existing_id from iam.organizations
  where created_by = p_user_id and is_personal is true
  order by created_at limit 1;
  if v_existing_id is not null then
    insert into iam.memberships
      (organization_id, container_type, container_id, user_id, role, status)
    values
      (v_existing_id, 'organization', v_existing_id, p_user_id, 'owner', 'active')
    on conflict (container_type, container_id, user_id) do nothing;
    return v_existing_id;
  end if;

  select email into v_email from auth.users where id = p_user_id;
  v_uuid_hex := substring(replace(p_user_id::text, '-', ''), 1, 8);
  v_username := nullif(split_part(coalesce(v_email, ''), '@', 1), '');
  if v_username is null or length(v_username) < 3 then
    v_username := 'user-' || v_uuid_hex;
  end if;
  v_base_slug := lower(regexp_replace(v_username, '[^a-zA-Z0-9]', '-', 'g'));
  v_base_slug := regexp_replace(v_base_slug, '-+', '-', 'g');
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug is null or v_base_slug = '' then
    v_base_slug := 'user-' || v_uuid_hex;
  end if;

  loop
    v_attempt := v_attempt + 1;
    if v_attempt = 1 then v_slug := v_base_slug;
    elsif v_attempt <= 10 then v_slug := v_base_slug || '-' || v_attempt::text;
    else v_slug := v_base_slug || '-' || replace(p_user_id::text, '-', '');
    end if;
    begin
      insert into iam.organizations
        (name, slug, created_by, is_personal, description)
      values
        (v_username || '''s Workspace', v_slug, p_user_id, true,
         'Personal workspace for ' || v_username)
      returning id into v_org_id;
      exit;
    exception when unique_violation then
      -- The creator invariant can win a concurrent race independently of the
      -- slug. Re-read it before treating the error as a slug collision.
      select id into v_existing_id from iam.organizations
      where created_by = p_user_id and is_personal is true
      order by created_at limit 1;
      if v_existing_id is not null then
        insert into iam.memberships
          (organization_id, container_type, container_id, user_id, role, status)
        values
          (v_existing_id, 'organization', v_existing_id, p_user_id, 'owner', 'active')
        on conflict (container_type, container_id, user_id) do nothing;
        return v_existing_id;
      end if;
      if v_attempt > 11 then raise; end if;
    end;
  end loop;

  insert into iam.memberships
    (organization_id, container_type, container_id, user_id, role, status)
  values
    (v_org_id, 'organization', v_org_id, p_user_id, 'owner', 'active')
  on conflict (container_type, container_id, user_id) do nothing;
  return v_org_id;
end;
$$;

create or replace function public.transfer_guest_data_to_user(
  p_anon_user_id uuid,
  p_new_user_id uuid,
  p_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anon_is_anonymous boolean;
  v_new_is_anonymous boolean;
  v_target_personal_org uuid;
  v_source_personal_org record;
  v_col record;
  v_count bigint;
  v_total bigint := 0;
  v_transferred jsonb := '{}'::jsonb;
  v_skipped jsonb := '{}'::jsonb;
  v_key text;
  v_guest_row_id uuid;
begin
  if p_anon_user_id is null or p_new_user_id is null then
    return jsonb_build_object('status', 'error', 'message', 'both user ids are required');
  end if;
  if p_anon_user_id = p_new_user_id then
    return jsonb_build_object('status', 'noop', 'message', 'source and target are the same user');
  end if;

  select is_anonymous into v_anon_is_anonymous from auth.users where id = p_anon_user_id;
  if v_anon_is_anonymous is null then
    return jsonb_build_object('status', 'error', 'message', 'anon user not found');
  end if;
  if v_anon_is_anonymous is not true then
    return jsonb_build_object('status', 'error', 'message', 'source user is not anonymous');
  end if;
  select is_anonymous into v_new_is_anonymous from auth.users where id = p_new_user_id;
  if v_new_is_anonymous is null then
    return jsonb_build_object('status', 'error', 'message', 'target user not found');
  end if;
  if v_new_is_anonymous is true then
    return jsonb_build_object('status', 'error', 'message', 'target user is anonymous');
  end if;

  select id into v_guest_row_id from public.guest_executions
  where auth_user_id = p_anon_user_id for update;

  -- A permanent user owns exactly one personal organization. Guest-created
  -- rows move there; the guest organization and membership stay with guest.
  v_target_personal_org := public.ensure_personal_organization(p_new_user_id);
  for v_source_personal_org in
    select id from iam.organizations
    where created_by = p_anon_user_id and is_personal is true
    order by created_at
  loop
    for v_col in
      select n.nspname as sch, cl.relname as tbl, a.attname as col
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_class ref on ref.oid = con.confrelid
      join pg_namespace refn on refn.oid = ref.relnamespace
      join unnest(con.conkey) as ck(attnum) on true
      join pg_attribute a on a.attrelid = cl.oid and a.attnum = ck.attnum
      where con.contype = 'f'
        and refn.nspname = 'iam' and ref.relname = 'organizations'
        and not (n.nspname = 'iam' and cl.relname = 'memberships')
        and n.nspname not in (
          'auth', 'storage', 'graveyard', 'realtime', 'vault', 'extensions',
          'pgsodium', 'supabase_functions'
        )
      order by n.nspname, cl.relname, a.attname
    loop
      v_key := format('personal_org.%s.%s.%s', v_col.sch, v_col.tbl, v_col.col);
      begin
        execute format(
          'update %I.%I set %I = $1 where %I = $2',
          v_col.sch, v_col.tbl, v_col.col, v_col.col
        ) using v_target_personal_org, v_source_personal_org.id;
        get diagnostics v_count = row_count;
        if v_count > 0 then
          v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
          v_total := v_total + v_count;
        end if;
      exception when others then
        v_skipped := v_skipped || jsonb_build_object(v_key, sqlerrm);
      end;
    end loop;

    begin
      update platform.associations set source_id = v_target_personal_org
      where source_type = 'organization' and source_id = v_source_personal_org.id;
      get diagnostics v_count = row_count;
      if v_count > 0 then
        v_key := 'personal_org.platform.associations.source_id';
        v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
        v_total := v_total + v_count;
      end if;
      update platform.associations set target_id = v_target_personal_org
      where target_type = 'organization' and target_id = v_source_personal_org.id;
      get diagnostics v_count = row_count;
      if v_count > 0 then
        v_key := 'personal_org.platform.associations.target_id';
        v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
        v_total := v_total + v_count;
      end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object(
        'personal_org.platform.associations', sqlerrm
      );
    end;
  end loop;

  -- Transfer every ordinary auth-user FK, but never transfer personal-org
  -- ownership or the guest's personal-org owner membership.
  for v_col in
    select n.nspname as sch, cl.relname as tbl, a.attname as col
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace refn on refn.oid = ref.relnamespace
    join unnest(con.conkey) as ck(attnum) on true
    join pg_attribute a on a.attrelid = cl.oid and a.attnum = ck.attnum
    where con.contype = 'f'
      and refn.nspname = 'auth' and ref.relname = 'users'
      and n.nspname not in (
        'auth', 'storage', 'graveyard', 'realtime', 'vault', 'extensions',
        'pgsodium', 'supabase_functions'
      )
      and not (n.nspname = 'public' and cl.relname = 'guest_executions')
      and not (n.nspname = 'public' and cl.relname = 'guest_conversion_audit')
      and not (n.nspname = 'users' and cl.relname = 'profiles' and a.attname = 'id')
      and not (n.nspname = 'iam' and cl.relname = 'organizations' and a.attname = 'created_by')
      and not (n.nspname = 'iam' and cl.relname = 'memberships' and a.attname = 'user_id')
    order by n.nspname, cl.relname, a.attname
  loop
    v_key := format('%s.%s.%s', v_col.sch, v_col.tbl, v_col.col);
    begin
      execute format(
        'update %I.%I set %I = $1 where %I = $2',
        v_col.sch, v_col.tbl, v_col.col, v_col.col
      ) using p_new_user_id, p_anon_user_id;
      get diagnostics v_count = row_count;
      if v_count > 0 then
        v_transferred := v_transferred || jsonb_build_object(v_key, v_count);
        v_total := v_total + v_count;
      end if;
    exception when others then
      v_skipped := v_skipped || jsonb_build_object(v_key, sqlerrm);
    end;
  end loop;

  -- Non-personal organizations and memberships still belong to the converted
  -- account. Only the guest's personal-org machinery is excluded.
  update iam.organizations set created_by = p_new_user_id
  where created_by = p_anon_user_id and is_personal is not true;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    v_transferred := v_transferred || jsonb_build_object(
      'iam.organizations.created_by.non_personal', v_count
    );
    v_total := v_total + v_count;
  end if;

  update iam.memberships as membership set user_id = p_new_user_id
  where membership.user_id = p_anon_user_id
    and not exists (
      select 1 from iam.organizations as organization
      where organization.id = membership.organization_id
        and organization.is_personal is true
        and organization.created_by = p_anon_user_id
    );
  get diagnostics v_count = row_count;
  if v_count > 0 then
    v_transferred := v_transferred || jsonb_build_object(
      'iam.memberships.user_id.non_personal', v_count
    );
    v_total := v_total + v_count;
  end if;

  if v_guest_row_id is not null then
    update public.guest_executions
    set converted_to_user_id = p_new_user_id, converted_at = now(), auth_user_id = null
    where id = v_guest_row_id;
  end if;
  insert into public.guest_conversion_audit
    (anon_user_id, new_user_id, fingerprint, transferred, skipped, total_rows)
  values
    (p_anon_user_id, p_new_user_id, p_fingerprint,
     v_transferred, v_skipped, v_total::integer);
  return jsonb_build_object(
    'status', 'transferred', 'total_rows', v_total,
    'transferred', v_transferred, 'skipped', v_skipped
  );
end;
$$;

revoke all on function public.transfer_guest_data_to_user(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.transfer_guest_data_to_user(uuid, uuid, text)
  to service_role;

comment on function public.transfer_guest_data_to_user(uuid, uuid, text) is
  'Transfers guest-owned data to a permanent user, re-homes guest personal-org rows into the target personal org, and never transfers the guest personal organization or its owner membership.';
