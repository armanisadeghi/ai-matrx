-- web_children_read_via_parent_rls.sql — applied live 2026-07-21
-- Marketing model refinement ("a page is only accessible through its site"):
-- child-table READS defer to the parent's OWN RLS via a hashed sub-select
-- instead of a per-row resolver call. Semantics identical; the resolver runs
-- once per visible parent (~11 sites) instead of once per row (121k link_edge
-- rows). Measured: full web.page scan under RLS 18.6ms; outsider sees 0 rows.
-- Writes keep the per-row iam.has_access editor gate (low volume).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('page','site_id','site'),('crawl_event','site_id','site'),('page_evidence','site_id','site'),
    ('crawl_schedule','site_id','site'),('crawl_url','site_id','site'),('snapshot','site_id','site'),
    ('link_edge','site_id','site'),('batch_job','site_id','site'),('batch_item','site_id','site'),
    ('site_item_config','site_id','site'),('crawl_session','site_id','site'),('analysis_result','site_id','site'),
    ('finding','site_id','site'),('sitemap','site_id','site'),('page_sitemap','site_id','site'),
    ('gsc_page_stat','site_id','site'),('screenshot','site_id','site'),
    ('brand_asset','brand_id','brand'),('business_fact','brand_id','brand'),
    ('property','brand_id','brand'),('discovered_item','brand_id','brand')
  ) AS t(tbl, fk, parent)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS std_select ON web.%I', r.tbl);
    EXECUTE format(
      'CREATE POLICY std_select ON web.%I FOR SELECT TO authenticated USING (%I IN (SELECT id FROM web.%I))',
      r.tbl, r.fk, r.parent);
  END LOOP;
END $$;
