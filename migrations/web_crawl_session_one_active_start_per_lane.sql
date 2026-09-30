-- THE crawl start claim: one queued/running session per (site, start lane).
--
-- 2026-09-14: creating aireserv.com from the "New Website" flow ran TWO full
-- site initializations 0.4 s apart (sessions d2afe38d / 2c144364; again on
-- www.w3.org 2026-09-17, 0.17 s apart). The scraper only guarded full/list
-- crawls, and only with a check-then-insert election in application code.
-- This index makes the INSERT itself the claim, so a double click, a remounted
-- page, two tabs, or a schedule firing into a manual run can never start two.
--
-- Lanes (mirrors matrx_scraper.web_crawl.persistence.START_LANE_BY_MODE):
--   site_crawl          ← scope.mode full | list
--   site_initialization ← scope.mode initialization | homepage
-- page_fetch / sitemap_sync / gsc_sync / analysis sessions have no lane.
--
-- A dead-but-unreaped holder is retired by the scraper (retire_dead_session)
-- before it re-claims; the live judgment stays in code, the arbiter is here.
-- web.crawl_session held 436 rows and zero active laned sessions at authoring.

create unique index if not exists crawl_session_one_active_start_per_lane
  on web.crawl_session (
    site_id,
    (case when scope ->> 'mode' in ('full', 'list') then 'site_crawl'
          else 'site_initialization' end)
  )
  where status in ('queued', 'running')
    and deleted_at is null
    and scope ->> 'mode' in ('full', 'list', 'initialization', 'homepage');

comment on index web.crawl_session_one_active_start_per_lane is
  'Crawl start claim: one queued/running session per (site, start lane). '
  'Lanes: site_crawl (full/list), site_initialization (initialization/homepage). '
  'Mirrors matrx_scraper START_LANE_BY_MODE; a violation is a 409 "already active".';
