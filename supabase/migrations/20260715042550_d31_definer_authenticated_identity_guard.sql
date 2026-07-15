-- D31: close the remaining authenticated caller-supplied identity paths.
--
-- get_ssr_shell_data is a browser-authenticated, self-only hydration RPC. Its
-- previous SQL body trusted p_user_id, allowing any signed-in user to read
-- another user's preferences, admin bit, SMS count, and org memberships.
-- Convert it to PL/pgSQL so the identity guard runs before the privileged read.
-- service_role remains available for trusted server-side diagnostics.
--
-- apply_usage_delta is server-owned storage accounting. There is no frontend
-- caller; authenticated EXECUTE only allowed users to mutate another user's
-- quota counters. Keep service_role only.

create or replace function public.get_ssr_shell_data(p_user_id uuid)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if (auth.role() = 'service_role' or p_user_id = auth.uid()) is not true then
    raise exception 'access denied: caller is not the target user'
      using errcode = '42501';
  end if;

  return (
    with member_orgs as (
      select o.id, o.name, o.slug, o.is_personal, m.role, o.created_at
      from iam.memberships m
      join iam.organizations o on o.id = m.container_id
      where m.user_id = p_user_id
        and m.container_type = 'organization'
        and m.status = 'active'
        and m.deleted_at is null
    ),
    default_pref as (
      select nullif(
        preferences #>> '{organization,defaultOrganizationId}',
        ''
      )::uuid as default_org_id
      from users.user_preferences
      where user_id = p_user_id
      limit 1
    )
    select json_build_object(
      'is_admin', (
        select exists(
          select 1 from admin.admins where user_id = p_user_id
        )
      ),
      'preferences_exists', (
        select exists(
          select 1
          from users.user_preferences
          where user_id = p_user_id
        )
      ),
      'preferences', (
        select preferences
        from users.user_preferences
        where user_id = p_user_id
        limit 1
      ),
      'ai_models', (
        select coalesce(json_agg(row_to_json(model_row)), '[]'::json)
        from (
          select md.*, p.name as maker
          from ai.model_definition md
          left join ai.provider p on p.id = md.provider_id
          where md.is_deprecated = false
          order by md.common_name asc
        ) model_row
      ),
      'context_menu', (
        select coalesce(json_agg(row_to_json(menu_row)), '[]'::json)
        from (
          select placement_type, categories_flat
          from public.context_menu_unified_view
        ) menu_row
      ),
      'sms_unread_total', (
        select coalesce(sum(unread_count), 0)::int
        from communication.sms_conversations
        where user_id = p_user_id and status = 'active'
      ),
      'personal_organization_id', iam.personal_org_id(p_user_id),
      'organizations', (
        select coalesce(
          json_agg(
            json_build_object(
              'id', member_orgs.id,
              'name', member_orgs.name,
              'slug', member_orgs.slug,
              'is_personal', member_orgs.is_personal,
              'role', member_orgs.role
            )
            order by member_orgs.is_personal desc, member_orgs.name asc
          ),
          '[]'::json
        )
        from member_orgs
      ),
      'active_organization_id', coalesce(
        (
          select member_orgs.id
          from member_orgs
          where member_orgs.id = (select default_org_id from default_pref)
          limit 1
        ),
        (
          select member_orgs.id
          from member_orgs
          where (select count(*) from member_orgs) = 1
          limit 1
        )
      )
    )
  );
end;
$function$;

revoke execute on function public.get_ssr_shell_data(p_user_id uuid)
  from anon, public;
grant execute on function public.get_ssr_shell_data(p_user_id uuid)
  to authenticated, service_role;

revoke execute on function public.apply_usage_delta(
  p_user_id uuid,
  p_bytes_delta bigint,
  p_files_delta integer,
  p_record_upload boolean,
  p_upload_bytes bigint
) from anon, authenticated, public;
grant execute on function public.apply_usage_delta(
  p_user_id uuid,
  p_bytes_delta bigint,
  p_files_delta integer,
  p_record_upload boolean,
  p_upload_bytes bigint
) to service_role;

do $verify$
begin
  if has_function_privilege(
    'authenticated',
    'public.apply_usage_delta(uuid,bigint,integer,boolean,bigint)',
    'execute'
  ) then
    raise exception 'D31 verification failed: authenticated still executes apply_usage_delta';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_ssr_shell_data(uuid)',
    'execute'
  ) then
    raise exception 'D31 verification failed: authenticated lost get_ssr_shell_data';
  end if;
end;
$verify$;
