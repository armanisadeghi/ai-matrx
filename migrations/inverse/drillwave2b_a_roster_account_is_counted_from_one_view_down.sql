-- chair-step: the inverse of migrations/campaign/drillwave2b_a_roster_account_is_counted_from_one_view.sql (lane DRILL-WAVE2-B) — removes the registry row account_facts and the view users._account_facts. Apply AFTER the inverse of the account_roster definition. No row of anybody's data is touched.
-- lane: DRILL-WAVE2-B
-- lock: platform
-- Read from production 2026-10-07 (no function is replaced, so no based-on line): the view and registry row are the ones the campaign file creates.

delete from platform.entity_types where token = 'account_facts';
drop view if exists users._account_facts;
