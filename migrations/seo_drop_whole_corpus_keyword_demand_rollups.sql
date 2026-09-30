-- chair-step: drops the two whole-corpus rollups the per-site-span functions (seo_keyword_demand_rollup_is_per_site_span.sql) replaced. fn_enqueue_keyword_click_tail(int,text) re-rolled all Search Console history of every site in one statement (128 s, over the postgres role's 30 s ceiling) and fn_refresh_keyword_classification_queue(int,text) rolled 90 days of every site in one; no caller remains once the new server is deployed. No legacy twins.

DROP FUNCTION IF EXISTS seo.fn_enqueue_keyword_click_tail(integer, text);
DROP FUNCTION IF EXISTS seo.fn_refresh_keyword_classification_queue(integer, text);
