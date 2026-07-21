-- Everyone-can-view (Arman ruling 2026-07-20): scraped-web content is public
-- data, so every web.brand / web.site access root is visibility='public'.
-- iam.has_access_for_base grants any authenticated user VIEWER on a public
-- row, and every child table (page, snapshot, sitemap, gsc_page_stat, …)
-- resolves through these roots — so this one flip makes the whole vertical
-- universally viewable. Writes stay owner/org-scoped (std_* policies).
--
-- NOTE (open decision): GSC stats, cost, and connection metadata are NOT
-- scraped content; gsc_page_stat currently rides the site root and therefore
-- becomes viewable too. If Arman rules those private, carve them out with a
-- dedicated policy in a follow-up migration.

alter table web.brand alter column visibility set default 'public';
alter table web.site alter column visibility set default 'public';

update web.brand set visibility = 'public'
where deleted_at is null and visibility <> 'public';

update web.site set visibility = 'public'
where deleted_at is null and visibility <> 'public';
