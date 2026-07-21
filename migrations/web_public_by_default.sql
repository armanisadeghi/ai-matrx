-- Arman's ruling (2026-07-21, final): web.* is scraped PUBLIC data. Every
-- brand and site is viewable by every authenticated platform user, ALWAYS.
-- The private-creation leak (FE hardcoded p_visibility='private',
-- web.create_site defaulting private, brand editor defaulting private) kept
-- re-locking new records after the public backfill — owners then hit access
-- errors from their own rows. This migration makes public the DB-enforced
-- default AND the coerced value on web.brand/web.site, so no code path in
-- any repo can ever create a locked row again. Writes stay owner/org-scoped.

-- 1. Backfill everything (children inherit via their access root).
update web.brand set visibility = 'public' where visibility is distinct from 'public';
update web.site  set visibility = 'public' where visibility is distinct from 'public';

-- 2. Column defaults.
alter table web.brand alter column visibility set default 'public'::platform.visibility;
alter table web.site  alter column visibility set default 'public'::platform.visibility;

-- 3. Coerce on write — inserts AND updates. Loud in the log, never blocking.
create or replace function web.force_public_visibility() returns trigger
language plpgsql as $$
begin
  if new.visibility is distinct from 'public'::platform.visibility then
    raise warning 'web.% row % visibility % coerced to public (web is public data — Arman ruling 2026-07-21)',
      tg_table_name, new.id, new.visibility;
    new.visibility := 'public'::platform.visibility;
  end if;
  return new;
end$$;

drop trigger if exists force_public_visibility on web.brand;
create trigger force_public_visibility
  before insert or update of visibility on web.brand
  for each row execute function web.force_public_visibility();

drop trigger if exists force_public_visibility on web.site;
create trigger force_public_visibility
  before insert or update of visibility on web.site
  for each row execute function web.force_public_visibility();

-- 4. web.create_site: public default in the signature and body (the trigger
--    already coerces, this stops the signature lying). Body otherwise
--    identical to the live 2026-07-20 version.
CREATE OR REPLACE FUNCTION web.create_site(p_organization_id uuid, p_name text, p_root_url text, p_domain text, p_settings jsonb DEFAULT '{}'::jsonb, p_integrations jsonb DEFAULT '{}'::jsonb, p_visibility platform.visibility DEFAULT 'public'::platform.visibility, p_brand_id uuid DEFAULT NULL::uuid)
 RETURNS web.site
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
              COALESCE(p_visibility, 'public'::platform.visibility))
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
    COALESCE(p_visibility, 'public'::platform.visibility)
  )
  RETURNING * INTO created_site;

  INSERT INTO web.property (organization_id, created_by, brand_id, kind, url, display_name, site_id)
  VALUES (p_organization_id, auth.uid(), v_brand_id, 'website', normalized_root_url, normalized_name, created_site.id);

  RETURN created_site;
END;
$function$;
