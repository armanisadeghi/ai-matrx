-- A snapshot body is the raw HTTP response body, not necessarily HTML.
-- Keep the canonical file ownership, tenant, site, session, visibility,
-- immutability, and metadata checks while allowing the body's real media type.
-- Derived markdown and screenshots retain their exact media-type checks.

CREATE OR REPLACE FUNCTION web.validate_snapshot_artifact_files()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, web
AS $$
BEGIN
  PERFORM web.assert_crawl_artifact_file(
    new.body_file_id,
    new.organization_id,
    new.site_id,
    new.session_id,
    ''
  );
  PERFORM web.assert_crawl_artifact_file(
    new.markdown_file_id,
    new.organization_id,
    new.site_id,
    new.session_id,
    'text/markdown'
  );
  RETURN new;
END;
$$;
