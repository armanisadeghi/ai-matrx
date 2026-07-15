-- D31 follow-up: remove stale "guest flow" exceptions that were broader than
-- the real call graph. Supabase anonymous-auth users carry an authenticated
-- JWT; the server-side file pipeline uses service_role. Only the public-app
-- rate-limit status check legitimately remains callable without a JWT.

create or replace function public.get_user_limits(
  p_user_id uuid,
  p_is_guest boolean default false
)
returns jsonb
language plpgsql
stable
security definer
as $function$
declare
  v_tier_id text;
  v_tier files.account_tiers%rowtype;
  v_custom jsonb := '{}'::jsonb;
  v_blocked boolean := false;
  v_block_reason text;
begin
  if (auth.role() = 'service_role' or p_user_id = auth.uid()) is not true then
    raise exception 'access denied: caller is not the target user'
      using errcode = '42501';
  end if;

  select tier_id, custom_limits, is_blocked, blocked_reason
  into v_tier_id, v_custom, v_blocked, v_block_reason
  from files.user_account
  where user_id = p_user_id;

  if v_tier_id is null then
    if p_is_guest then
      select id into v_tier_id
      from files.account_tiers
      where is_default_for_guests = true
      limit 1;
    else
      select id into v_tier_id
      from files.account_tiers
      where is_default_for_users = true
      limit 1;
    end if;
  end if;

  select * into v_tier
  from files.account_tiers
  where id = v_tier_id;

  if v_tier.id is null then
    v_tier.id := 'free';
  end if;

  return jsonb_build_object(
    'tier_id', v_tier.id,
    'tier_name', v_tier.name,
    'is_blocked', v_blocked,
    'blocked_reason', v_block_reason,
    'max_storage_bytes', coalesce(
      (v_custom->>'max_storage_bytes')::bigint,
      v_tier.max_storage_bytes
    ),
    'max_file_size_bytes', coalesce(
      (v_custom->>'max_file_size_bytes')::bigint,
      v_tier.max_file_size_bytes
    ),
    'max_files', coalesce(
      (v_custom->>'max_files')::int,
      v_tier.max_files
    ),
    'max_versions_per_file', coalesce(
      (v_custom->>'max_versions_per_file')::int,
      v_tier.max_versions_per_file
    ),
    'max_daily_uploads', coalesce(
      (v_custom->>'max_daily_uploads')::int,
      v_tier.max_daily_uploads
    ),
    'max_daily_upload_bytes', coalesce(
      (v_custom->>'max_daily_upload_bytes')::bigint,
      v_tier.max_daily_upload_bytes
    ),
    'max_share_links_per_resource', coalesce(
      (v_custom->>'max_share_links_per_resource')::int,
      v_tier.max_share_links_per_resource
    ),
    'max_bulk_items', coalesce(
      (v_custom->>'max_bulk_items')::int,
      v_tier.max_bulk_items
    ),
    'rate_limit_uploads_per_min', coalesce(
      (v_custom->>'rate_limit_uploads_per_min')::int,
      v_tier.rate_limit_uploads_per_min
    ),
    'rate_limit_downloads_per_min', coalesce(
      (v_custom->>'rate_limit_downloads_per_min')::int,
      v_tier.rate_limit_downloads_per_min
    ),
    'rate_limit_general_per_min', coalesce(
      (v_custom->>'rate_limit_general_per_min')::int,
      v_tier.rate_limit_general_per_min
    ),
    'features', coalesce(v_custom->'features', v_tier.features)
  );
end;
$function$;

create or replace function public.get_usage_status(
  p_user_id uuid,
  p_is_guest boolean default false
)
returns jsonb
language plpgsql
stable
security definer
as $function$
declare
  v_limits jsonb;
  v_usage files.user_storage_usage%rowtype;
begin
  if (auth.role() = 'service_role' or p_user_id = auth.uid()) is not true then
    raise exception 'access denied: caller is not the target user'
      using errcode = '42501';
  end if;

  v_limits := public.get_user_limits(p_user_id, p_is_guest);

  select * into v_usage
  from files.user_storage_usage
  where user_id = p_user_id;

  return jsonb_build_object(
    'limits', v_limits,
    'usage', coalesce(
      row_to_json(v_usage)::jsonb,
      jsonb_build_object(
        'bytes_used', 0,
        'files_count', 0,
        'daily_upload_count', 0,
        'daily_upload_bytes', 0
      )
    )
  );
end;
$function$;

create or replace function public.check_rate_limit(
  p_app_id uuid,
  p_user_id uuid default null,
  p_fingerprint text default null,
  p_ip_address inet default null
)
returns table(
  allowed boolean,
  remaining integer,
  reset_at timestamptz,
  is_blocked boolean
)
language plpgsql
stable
security definer
set search_path to 'public', 'app', 'pg_temp'
as $function$
declare
  v_app app.definition%rowtype;
  v_limit_record app.rate_limit%rowtype;
  v_max_executions integer;
  v_window_hours integer;
begin
  if p_user_id is not null
    and (auth.role() = 'service_role' or p_user_id = auth.uid()) is not true
  then
    raise exception 'access denied: caller is not the target user'
      using errcode = '42501';
  end if;

  select * into v_app
  from app.definition
  where id = p_app_id;

  if not found then
    raise exception 'App not found';
  end if;

  if p_user_id is not null then
    v_max_executions := coalesce(v_app.rate_limit_authenticated, 100);
  else
    v_max_executions := coalesce(v_app.rate_limit_per_ip, 20);
  end if;

  v_window_hours := greatest(
    coalesce(v_app.rate_limit_window_hours, 24),
    1
  );

  if p_user_id is not null then
    select * into v_limit_record
    from app.rate_limit
    where app_id = p_app_id and user_id = p_user_id;
  elsif p_fingerprint is not null then
    select * into v_limit_record
    from app.rate_limit
    where app_id = p_app_id
      and user_id is null
      and fingerprint = p_fingerprint;
  elsif p_ip_address is not null then
    select * into v_limit_record
    from app.rate_limit
    where app_id = p_app_id
      and user_id is null
      and fingerprint is null
      and ip_address = p_ip_address;
  end if;

  if v_limit_record is null then
    return query
    select
      true,
      v_max_executions - 1,
      now() + make_interval(hours => v_window_hours),
      false;
    return;
  end if;

  if v_limit_record.is_blocked
    and (
      v_limit_record.blocked_until is null
      or v_limit_record.blocked_until > now()
    )
  then
    return query
    select false, 0, v_limit_record.blocked_until, true;
    return;
  end if;

  if v_limit_record.window_start_at + make_interval(hours => v_window_hours) < now() then
    return query
    select
      true,
      v_max_executions - 1,
      now() + make_interval(hours => v_window_hours),
      false;
    return;
  end if;

  if v_limit_record.execution_count >= v_max_executions then
    return query
    select
      false,
      0,
      v_limit_record.window_start_at + make_interval(hours => v_window_hours),
      false;
    return;
  end if;

  return query
  select
    true,
    v_max_executions - v_limit_record.execution_count - 1,
    v_limit_record.window_start_at + make_interval(hours => v_window_hours),
    false;
end;
$function$;

-- Server-only quota gates and the retired invitation RPC.
revoke execute on function public.check_upload_quota(uuid, bigint, boolean)
  from anon, authenticated, public;
grant execute on function public.check_upload_quota(uuid, bigint, boolean)
  to service_role;

revoke execute on function public.accept_organization_invitation(text, uuid)
  from anon, authenticated, public;
grant execute on function public.accept_organization_invitation(text, uuid)
  to service_role;

-- Authenticated self reads. Anonymous-auth accounts use authenticated JWTs;
-- unauthenticated callers have no legitimate user id to supply.
revoke execute on function public.get_user_limits(uuid, boolean)
  from anon, public;
grant execute on function public.get_user_limits(uuid, boolean)
  to authenticated, service_role;

revoke execute on function public.get_usage_status(uuid, boolean)
  from anon, public;
grant execute on function public.get_usage_status(uuid, boolean)
  to authenticated, service_role;

-- The public-app preflight remains public only when p_user_id is null. Its
-- body now rejects cross-user authenticated/anon probes.
revoke execute on function public.check_rate_limit(uuid, uuid, text, inet)
  from public;
grant execute on function public.check_rate_limit(uuid, uuid, text, inet)
  to anon, authenticated, service_role;

do $verify$
begin
  if has_function_privilege(
    'anon',
    'public.get_usage_status(uuid,boolean)',
    'execute'
  ) then
    raise exception 'D31 verification failed: anon still executes get_usage_status';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.check_upload_quota(uuid,bigint,boolean)',
    'execute'
  ) then
    raise exception 'D31 verification failed: client still executes check_upload_quota';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.accept_organization_invitation(text,uuid)',
    'execute'
  ) then
    raise exception 'D31 verification failed: retired invitation RPC remains exposed';
  end if;
end;
$verify$;
