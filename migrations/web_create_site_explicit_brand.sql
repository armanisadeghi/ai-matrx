-- web.create_site gains p_brand_id: an explicit brand ALWAYS wins.
-- The name-match-or-create fallback only applies when no brand is given —
-- adding a site from inside a brand must never mint a duplicate brand
-- (production incident 2026-07-20: site added from a brand cockpit created a
-- second brand because attachment was name-matched).
-- Also: web.move_site_brand(p_site_id, p_brand_id, ...) reassigns a site (and
-- its website property row) to another brand of the same organization, so a
-- mis-attached site can be repaired without delete/recreate.

-- Drop the old 7-arg signature first — CREATE OR REPLACE with a new default
-- parameter would otherwise leave an ambiguous overload behind for PostgREST.
drop function if exists web.create_site(uuid, text, text, text, jsonb, jsonb, platform.visibility);

create or replace function web.create_site(
  p_organization_id uuid,
  p_name text,
  p_root_url text,
  p_domain text,
  p_settings jsonb default '{}'::jsonb,
  p_integrations jsonb default '{}'::jsonb,
  p_visibility platform.visibility default 'private'::platform.visibility,
  p_brand_id uuid default null
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
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_organization_id IS NULL
     OR NOT iam.has_org_access(p_organization_id) THEN
    RAISE EXCEPTION 'Organization access required' USING ERRCODE = '42501';
  END IF;

  IF normalized_name IS NULL THEN
    RAISE EXCEPTION 'Site name is required' USING ERRCODE = '22023';
  END IF;

  IF normalized_root_url IS NULL
     OR normalized_root_url !~* '^https?://' THEN
    RAISE EXCEPTION 'root_url must be an absolute HTTP(S) URL'
      USING ERRCODE = '22023';
  END IF;

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
    RAISE EXCEPTION 'domain must not be empty' USING ERRCODE = '22023';
  END IF;

  IF normalized_domain IS DISTINCT FROM root_host THEN
    RAISE EXCEPTION 'domain must exactly match the root_url host'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(COALESCE(p_settings, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'settings must be a JSON object' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(COALESCE(p_integrations, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'integrations must be a JSON object' USING ERRCODE = '22023';
  END IF;

  IF p_brand_id IS NOT NULL THEN
    SELECT b.id INTO v_brand_id
    FROM web.brand b
    WHERE b.id = p_brand_id
      AND b.organization_id = p_organization_id
      AND b.deleted_at IS NULL;
    IF v_brand_id IS NULL THEN
      RAISE EXCEPTION 'Brand not found in this organization'
        USING ERRCODE = '22023';
    END IF;
  ELSE
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
  END IF;

  INSERT INTO web.site (
    organization_id, brand_id, name, root_url, domain,
    settings, integrations, visibility
  )
  VALUES (
    p_organization_id, v_brand_id, normalized_name, normalized_root_url,
    normalized_domain, COALESCE(p_settings, '{}'::jsonb),
    COALESCE(p_integrations, '{}'::jsonb),
    COALESCE(p_visibility, 'private'::platform.visibility)
  )
  RETURNING * INTO created_site;

  INSERT INTO web.property (organization_id, created_by, brand_id, kind, url, display_name, site_id)
  VALUES (p_organization_id, auth.uid(), v_brand_id, 'website', normalized_root_url, normalized_name, created_site.id);

  RETURN created_site;
END;
$function$;

create or replace function web.move_site_brand(
  p_site_id uuid,
  p_brand_id uuid
)
returns web.site
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_site web.site;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT s.* INTO v_site
  FROM web.site s
  WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_site.id IS NULL THEN
    RAISE EXCEPTION 'Site not found' USING ERRCODE = '22023';
  END IF;

  IF NOT (v_site.created_by = auth.uid()
          OR iam.has_access('web_site', v_site.id, 'editor')) THEN
    RAISE EXCEPTION 'Editor access to this site required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM web.brand b
    WHERE b.id = p_brand_id
      AND b.organization_id = v_site.organization_id
      AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Brand not found in this organization' USING ERRCODE = '22023';
  END IF;

  IF NOT (EXISTS (
            SELECT 1 FROM web.brand b
            WHERE b.id = p_brand_id
              AND (b.created_by = auth.uid()
                   OR iam.has_access('web_brand', b.id, 'editor'))
          )) THEN
    RAISE EXCEPTION 'Editor access to the target brand required' USING ERRCODE = '42501';
  END IF;

  UPDATE web.site SET brand_id = p_brand_id
  WHERE id = v_site.id
  RETURNING * INTO v_site;

  UPDATE web.property SET brand_id = p_brand_id
  WHERE site_id = v_site.id AND deleted_at IS NULL;

  RETURN v_site;
END;
$function$;

grant execute on function web.move_site_brand(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
