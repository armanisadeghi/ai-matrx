-- Creating a site is idempotent on the database-enforced live identity:
-- (organization_id, normalized domain). Returning the existing row makes a
-- repeated click, a lost-response retry, and concurrent creators converge on
-- the same site instead of leaking a 23505 conflict to the user.
--
-- The nested block matters. If two first-time calls race, the losing block's
-- tentative brand is rolled back before the winning site is returned, so the
-- recovery path cannot leave an orphan brand behind. Other unique violations
-- retain their original diagnostics.

create or replace function web.create_site(
  p_organization_id uuid,
  p_name text,
  p_root_url text,
  p_domain text,
  p_settings jsonb default '{}'::jsonb,
  p_integrations jsonb default '{}'::jsonb,
  p_visibility platform.visibility default null::platform.visibility,
  p_brand_id uuid default null
)
returns web.site
language plpgsql
security definer
set search_path to ''
as $function$
declare
  created_site web.site;
  v_brand_id uuid;
  v_constraint_name text;
  normalized_name text := nullif(btrim(p_name), '');
  normalized_root_url text := nullif(btrim(p_root_url), '');
  normalized_domain text := lower(nullif(btrim(p_domain), ''));
  root_host text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_organization_id is null
     or not iam.has_org_access(p_organization_id) then
    raise exception 'Organization access required' using errcode = '42501';
  end if;

  if normalized_name is null then
    raise exception 'Site name is required' using errcode = '22023';
  end if;

  if normalized_root_url is null
     or normalized_root_url !~* '^https?://' then
    raise exception 'root_url must be an absolute HTTP(S) URL'
      using errcode = '22023';
  end if;

  root_host := lower(
    substring(
      normalized_root_url
      from '^https?://([^/:?#@]+)(?::[0-9]+)?(?:[/?#]|$)'
    )
  );

  if root_host is null then
    raise exception 'root_url must contain a valid host and no credentials'
      using errcode = '22023';
  end if;

  if normalized_domain is null
     or normalized_domain like '%://%'
     or normalized_domain like '%/%' then
    raise exception 'domain must be a normalized host without a scheme or path'
      using errcode = '22023';
  end if;

  normalized_domain := regexp_replace(normalized_domain, '\.$', '');
  root_host := regexp_replace(root_host, '\.$', '');

  if normalized_domain = '' then
    raise exception 'domain must not be empty' using errcode = '22023';
  end if;

  if normalized_domain is distinct from root_host then
    raise exception 'domain must exactly match the root_url host'
      using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_settings, '{}'::jsonb)) <> 'object' then
    raise exception 'settings must be a JSON object' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_integrations, '{}'::jsonb)) <> 'object' then
    raise exception 'integrations must be a JSON object' using errcode = '22023';
  end if;

  if p_brand_id is not null then
    select b.id into v_brand_id
    from web.brand b
    where b.id = p_brand_id
      and b.organization_id = p_organization_id
      and b.deleted_at is null;
    if v_brand_id is null then
      raise exception 'Brand not found in this organization'
        using errcode = '22023';
    end if;
  end if;

  select s.* into created_site
  from web.site s
  where s.organization_id = p_organization_id
    and s.domain = normalized_domain
    and s.deleted_at is null;

  if found then
    return created_site;
  end if;

  begin
    if p_brand_id is null then
      select b.id into v_brand_id
      from web.brand b
      where b.organization_id = p_organization_id
        and lower(b.name) = lower(normalized_name)
        and b.deleted_at is null
      limit 1;

      if v_brand_id is null then
        insert into web.brand (
          organization_id, created_by, name, website_url, status, visibility
        )
        values (
          p_organization_id, auth.uid(), normalized_name,
          normalized_root_url, 'active',
          coalesce(
            p_visibility,
            platform.entity_default_visibility('web_brand')
          )
        )
        returning id into v_brand_id;
      end if;
    end if;

    insert into web.site (
      organization_id, brand_id, name, root_url, domain,
      settings, integrations, visibility
    )
    values (
      p_organization_id, v_brand_id, normalized_name, normalized_root_url,
      normalized_domain, coalesce(p_settings, '{}'::jsonb),
      coalesce(p_integrations, '{}'::jsonb),
      coalesce(
        p_visibility,
        platform.entity_default_visibility('web_site')
      )
    )
    returning * into created_site;

    insert into web.property (
      organization_id, created_by, brand_id, kind, url, display_name, site_id
    )
    values (
      p_organization_id, auth.uid(), v_brand_id, 'website',
      normalized_root_url, normalized_name, created_site.id
    );
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name <> 'site_org_domain_live_unique' then
        raise;
      end if;

      select s.* into created_site
      from web.site s
      where s.organization_id = p_organization_id
        and s.domain = normalized_domain
        and s.deleted_at is null;

      if not found then
        raise;
      end if;
  end;

  return created_site;
end;
$function$;

notify pgrst, 'reload schema';
