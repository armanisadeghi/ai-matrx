-- chair-step: lane DRILL-SERVER-2 — adds two partial btree indexes on users.guest_executions (the guest row that names an account, and the guest row that enriches another guest's first touch), built CONCURRENTLY, so no write on the table waits for them. Its only DROPs are in the inverse. No row of anybody's data is touched.
-- lane: DRILL-SERVER-2
-- AUTOCOMMIT FILE: CREATE INDEX CONCURRENTLY cannot run inside a transaction; apply statement by statement.
--
-- WHY. users._acquisition_facts (next file) finds an identity's first touch by
-- metadata ->> 'acquisition_user_id' (the account a guest row was captured for) and by
-- metadata ->> 'guest_fingerprint' (the guest a browser-side enrichment row belongs to); 180,000
-- guest rows on production (2026-10-07), ~9,000 and ~14,000 of them carry the two keys. Without
-- these each lookup reads the whole table, once per identity.
-- INVERSE: migrations/inverse/drillserver2_the_first_touch_lookups_are_indexed_down.sql

create index concurrently if not exists guest_executions_acquisition_user_idx
  on users.guest_executions ((metadata ->> 'acquisition_user_id'), created_at)
  where (metadata ->> 'acquisition_user_id') is not null;

create index concurrently if not exists guest_executions_guest_fingerprint_idx
  on users.guest_executions ((metadata ->> 'guest_fingerprint'), created_at)
  where (metadata ->> 'guest_fingerprint') is not null;
