-- APPLIED to Matrx Main (txzxabzwovsujtloxrus) 2026-08-11. Record, not mechanism.
--
-- STILL AUTHORITATIVE for `web.is_machine_resource_url` (the live function is
-- this definition). The v_page_list body below was superseded the same day by
-- `web_page_list_evidence_and_resource_classification.sql`, which carries this
-- exact is_resource expression forward alongside is_canonical /
-- has_page_evidence and marks the view security_invoker. Read that file for the
-- current view; read this one for the classifier.
--
-- The URL-shape half of the page-vs-machine-resource rule.
--
-- WHY: `is_resource` was the crawler's content_type verdict alone. That verdict
-- is NULL for 8.7k of 10.8k `web.page` rows — every sitemap- and GSC-declared
-- URL that was never fetched — so it was silent for most of the registry.
-- Combined with a pre-2026-07-27 crawler bug (it followed WordPress'
-- `json+oembed` <head> alternate link, fetched the JSON, never stamped
-- content_type_last, and scored the response with the HTML audit),
-- datadestruction.com's site audit ranked 717 `/wp-json/...` endpoints as its
-- worst pages — 3 errors + 7 warnings each, for missing og:title and <h1>.
--
-- ONE rule, three mirrors — change one, change all three:
--   * web.is_machine_resource_url          (here)
--   * matrx-scraper web_crawl/page_class.py
--   * features/marketing/lib/page-content-class.ts
--
-- The shape set is deliberately narrow: only URLs that can never be a page a
-- human visits. Extensionless, .php, .html and .aspx are NOT matched, because
-- plenty of extensionless URLs serve JSON and plenty of .php URLs serve HTML —
-- that ambiguity is exactly what content_type_last is for.
--
-- NOTE: `web.snapshot` is immutable (web.reject_immutable_fact_mutation), so the
-- ~293 historical snapshots carrying an HTML audit of a JSON endpoint are NOT
-- rewritten. They stay as the honest record of what was computed that day; the
-- classifier simply never reads them for a resource row.

CREATE OR REPLACE FUNCTION web.is_machine_resource_url(page_url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH parts AS (
    SELECT
      lower(split_part(split_part(regexp_replace(COALESCE(page_url, ''), '^[a-zA-Z][a-zA-Z0-9+.-]*://[^/]*', ''), '#', 1), '?', 1)) AS path,
      lower(split_part(split_part(COALESCE(page_url, ''), '#', 1), '?', 2)) AS query
  )
  -- COALESCE is load-bearing: the extension test is NULL for extensionless
  -- paths and NULL OR false is NULL, which would make is_resource three-valued
  -- and silently drop every real page from `.eq("is_resource", false)` reads.
  SELECT COALESCE(
    COALESCE(substring(parts.path from '\.([a-z0-9]+)$') IN (
      'png','jpg','jpeg','gif','webp','svg','svgz','ico','bmp','tif','tiff','avif','heic',
      'mp4','webm','mov','avi','mkv','m4v','mp3','wav','ogg','oga','ogv','m4a','flac','aac',
      'pdf','doc','docx','xls','xlsx','ppt','pptx','csv','tsv','rtf',
      'json','xml','rss','atom','txt','yaml','yml','sql',
      'zip','gz','tgz','bz2','7z','rar','tar','dmg','exe','apk',
      'css','js','mjs','map','woff','woff2','ttf','otf','eot'
    ), false)
    OR parts.path ~ '^/wp-json(/|$)'
    OR parts.path ~ '^/wp-admin(/|$)'
    OR parts.path ~ '^/wp-includes(/|$)'
    OR parts.path ~ '^/wp-content(/|$)'
    OR parts.path ~ '^/xmlrpc\.php$'
    OR parts.path ~ '(^|/)feed/?$'
    OR parts.path ~ '(^|/)rss(\.xml)?/?$'
    OR parts.path ~ '^/cdn-cgi(/|$)'
    OR parts.path ~ '^/\.well-known(/|$)'
    OR parts.query ~ '(^|&)rest_route='
  , false)
  FROM parts;
$$;

COMMENT ON FUNCTION web.is_machine_resource_url(text) IS
  'URL-shape half of the page-vs-machine-resource rule. Mirror of matrx-scraper web_crawl/page_class.py::is_machine_resource_url and matrx-frontend features/marketing/lib/page-content-class.ts. Change one, change all three.';

-- v_page_list.is_resource then ORs the two signals. The full view body as
-- applied lives in the database; only the changed expression is shown here:
--
--   ((page.content_type_last IS NOT NULL AND page.content_type_last <> 'html')
--     OR web.is_machine_resource_url(page.url)) AS is_resource
--
-- Superseded: web_page_list_live_site_and_resource_class.sql's verdict-only
-- expression.
