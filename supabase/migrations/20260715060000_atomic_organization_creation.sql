-- Create a non-personal organization and its first owner atomically.
-- Direct browser inserts are revoked so every authenticated creation uses this
-- transaction boundary; service-role provisioning remains available.

create or replace function public.org_create(
  p_name text,
  p_slug text,
  p_description text default null,
  p_logo_url text default null,
  p_logo_file_id uuid default null,
  p_website text default null,
  p_settings jsonb default '{}'::jsonb
)
returns iam.organizations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_org iam.organizations;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if p_name is null or pg_catalog.btrim(p_name) = '' then
    raise exception 'organization name is required' using errcode = '22023';
  end if;

  if p_slug is null or p_slug !~ '^[a-z0-9\-]+$' then
    raise exception 'invalid organization slug' using errcode = '22023';
  end if;

  if p_settings is null or pg_catalog.jsonb_typeof(p_settings) <> 'object' then
    raise exception 'organization settings must be an object'
      using errcode = '22023';
  end if;

  insert into iam.organizations (
    name,
    slug,
    description,
    logo_url,
    logo_file_id,
    website,
    created_by,
    is_personal,
    is_system,
    settings
  )
  values (
    pg_catalog.btrim(p_name),
    p_slug,
    p_description,
    p_logo_url,
    p_logo_file_id,
    p_website,
    v_uid,
    false,
    false,
    p_settings
  )
  returning * into v_org;

  insert into iam.memberships (
    organization_id,
    container_type,
    container_id,
    user_id,
    role,
    status,
    created_by,
    updated_by,
    metadata
  )
  values (
    v_org.id,
    'organization',
    v_org.id,
    v_uid,
    'owner',
    'active',
    v_uid,
    v_uid,
    '{}'::jsonb
  );

  return v_org;
end;
$function$;

revoke all on function public.org_create(
  text, text, text, text, uuid, text, jsonb
) from public, anon;
grant execute on function public.org_create(
  text, text, text, text, uuid, text, jsonb
) to authenticated;

revoke insert on table iam.organizations from public, anon, authenticated;

do $verification$
begin
  if has_table_privilege('authenticated', 'iam.organizations', 'insert')
     or has_table_privilege('anon', 'iam.organizations', 'insert') then
    raise exception 'direct organization insert remains executable';
  end if;

  if has_function_privilege(
       'anon',
       'public.org_create(text,text,text,text,uuid,text,jsonb)',
       'execute'
     )
     or not has_function_privilege(
       'authenticated',
       'public.org_create(text,text,text,text,uuid,text,jsonb)',
       'execute'
     ) then
    raise exception 'org_create execute ACL is incorrect';
  end if;
end;
$verification$;
