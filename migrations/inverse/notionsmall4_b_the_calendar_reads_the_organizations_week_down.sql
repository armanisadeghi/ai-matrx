-- chair-step: takes back the signed-in EXECUTE grant on custom.agg_calendar(uuid) that notionsmall4_b_the_calendar_reads_the_organizations_week.sql gave.
-- lock: custom
-- lane: NOTION-SMALL-4
--
REVOKE EXECUTE ON FUNCTION custom.agg_calendar(uuid) FROM authenticated;
