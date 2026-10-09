-- chair-step: grants EXECUTE on custom.agg_calendar(uuid) to authenticated (no function body, table, column, index or policy touched). The function only reads the organization's two calendar knobs (time zone, first day of the week), the same ones the relative date filters and chart buckets are cut with; a signed-in person could not ask it, so the calendar and timeline views had no way to start their weeks on the organization's day.
-- lock: custom
-- lane: NOTION-SMALL-4
--
-- The inverse is `migrations/inverse/notionsmall4_b_the_calendar_reads_the_organizations_week_down.sql`.
--
GRANT EXECUTE ON FUNCTION custom.agg_calendar(uuid) TO authenticated;
