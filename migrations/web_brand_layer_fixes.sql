-- Brand layer fixes (follow-up to web_brand_layer.sql):
-- 1. discovered_item dedup index becomes a plain NULLS NOT DISTINCT unique
--    index so the scraper's ON CONFLICT (brand_id, category, guessed_kind,
--    url) DO NOTHING is valid (the original partial expression index could
--    not be an ON CONFLICT arbiter).
-- 2. web.create_site creates-or-reuses the owning web.brand and its website
--    web.property in the same transaction — a site must never exist without
--    a brand (brand-first routing depends on it).

drop index if exists web.discovered_item_url_dedup;
create unique index if not exists discovered_item_dedup
  on web.discovered_item (brand_id, category, guessed_kind, url)
  nulls not distinct;

create or replace function web.create_site(
  p_organization_id uuid,
  p_name text,
  p_root_url text,
  p_domain text,
  p_settings jsonb default '{}'::jsonb,
  p_integrations jsonb default '{}'::jsonb,
  p_visibility platform.visibility default 'private'::platform.visibility
)
returns web.site
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  created_site web.site;
  v_brand_id uuid;
  normalized_name text := NULLIF(btrim(p_name), '');
  normalized_root_url text := NULLIF(btrim(p_root_url), '');
  normalized_domain text := lower(NULLIF(btrim(p_domain), ''));
  root_host text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF p_organization_id IS NULL
     OR NOT iam.has_org_access(p_organization_id) THEN
    RAISE EXCEPTION 'Organization access required'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_name IS NULL THEN
    RAISE EXCEPTION 'Site name is required'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_root_url IS NULL
     OR normalized_root_url !~* '^https?://' THEN
    RAISE EXCEPTION 'root_url must be an absolute HTTP(S) URL'
      USING ERRCODE = '22023';
  END IF;

  -- `domain` is the site's exact normalized host and must not be an
  -- independent caller-controlled identity. Credentials and non-HTTP schemes
  -- are deliberately rejected; path scope belongs in settings.
  root_host := lower(
    substring(
      normalized_root_url
      FROM '^https?://([^/:?#@]+)(?::[0-9]+)?(?:[/?#]|$)'
    )
  );

  IF root_host IS NULL THEN
    RAISE EXCEPTION 'root_url must contain a valid host and no credentials'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_domain IS NULL
     OR normalized_domain LIKE '%://%'
     OR normalized_domain LIKE '%/%' THEN
    RAISE EXCEPTION 'domain must be a normalized host without a scheme or path'
      USING ERRCODE = '22023';
  END IF;

  normalized_domain := regexp_replace(normalized_domain, '\.$', '');
  root_host := regexp_replace(root_host, '\.$', '');

  IF normalized_domain = '' THEN
    RAISE EXCEPTION 'domain must not be empty'
      USING ERRCODE = '22023';
  END IF;

  IF normalized_domain IS DISTINCT FROM root_host THEN
    RAISE EXCEPTION 'domain must exactly match the root_url host'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(COALESCE(p_settings, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'settings must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(COALESCE(p_integrations, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'integrations must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  -- A site always belongs to a brand: reuse the org's same-named live brand
  -- or create one. (Attaching a site to a DIFFERENT existing brand is a
  -- deliberate later parameter, not an implicit behavior.)
  SELECT b.id INTO v_brand_id
  FROM web.brand b
  WHERE b.organization_id = p_organization_id
    AND lower(b.name) = lower(normalized_name)
    AND b.deleted_at IS NULL
  LIMIT 1;

  IF v_brand_id IS NULL THEN
    INSERT INTO web.brand (organization_id, created_by, name, website_url, status, visibility)
    VALUES (p_organization_id, auth.uid(), normalized_name, normalized_root_url, 'active',
            COALESCE(p_visibility, 'private'::platform.visibility))
    RETURNING id INTO v_brand_id;
  END IF;

  INSERT INTO web.site (
    organization_id,
    brand_id,
    name,
    root_url,
    domain,
    settings,
    integrations,
    visibility
  )
  VALUES (
    p_organization_id,
    v_brand_id,
    normalized_name,
    normalized_root_url,
    normalized_domain,
    COALESCE(p_settings, '{}'::jsonb),
    COALESCE(p_integrations, '{}'::jsonb),
    COALESCE(p_visibility, 'private'::platform.visibility)
  )
  RETURNING * INTO created_site;

  INSERT INTO web.property (organization_id, created_by, brand_id, kind, url, display_name, site_id)
  VALUES (p_organization_id, auth.uid(), v_brand_id, 'website', normalized_root_url, normalized_name, created_site.id);

  RETURN created_site;
END;
$function$;

-- Backstop: any site row created without a brand between the brand-layer
-- migration and this fix gets one now.
insert into web.brand (organization_id, created_by, name, website_url, status, visibility)
select s.organization_id, s.created_by, s.name, s.root_url, 'active', s.visibility
from web.site s
where s.deleted_at is null and s.brand_id is null
  and not exists (
    select 1 from web.brand b
    where b.organization_id = s.organization_id
      and lower(b.name) = lower(s.name) and b.deleted_at is null
  );

update web.site s
set brand_id = b.id
from web.brand b
where s.brand_id is null and s.deleted_at is null
  and b.organization_id = s.organization_id
  and lower(b.name) = lower(s.name) and b.deleted_at is null;

insert into web.property (organization_id, created_by, brand_id, kind, url, display_name, site_id)
select s.organization_id, s.created_by, s.brand_id, 'website', s.root_url, s.name, s.id
from web.site s
where s.brand_id is not null and s.deleted_at is null
  and not exists (select 1 from web.property p where p.site_id = s.id and p.deleted_at is null);

notify pgrst, 'reload schema';
