-- 🚨 THE THREE PORTAL TABLES AND `custom.portal_admits` STAY STANDING AND ARE EMPTIED
-- (lane INVERSE-GUARD, 2026-09-21).
-- The note below already knew five bodies read one of these; the guard found they are on the
-- LIVE path and cannot be asked to wait for another inverse. `custom._field_write_door` — under
-- the live trigger `custom_record_field_write_door` on `custom.record` — reads `custom.portal`,
-- `custom.portal_table` and `custom.portal_principal`; `platform.unified_data_store_on`
-- (invitedelivery_admission_is_the_ladder_not_the_membership_row.sql),
-- `custom.list_door_disagreements` (exportfix_the_census_follows_the_export.sql) and
-- `custom.carrying_edges_of` (ladderperf_the_one_ladder_plans_once.sql) read the rest. Dropping
-- the tables took the ground out from under the field write door: the next write to the record
-- store would have raised 42P01.
--   SO THE TABLES STAY AND ARE EMPTIED INSTEAD, which is the same data destruction this header
-- warns about and none of the structural destruction: every portal, every Table a portal exposed
-- and every invitation still goes, `custom.portal_admits` still answers false for everybody
-- because there is nothing left to admit them to, every other portal door and every
-- `platform.client_callable_door` row still goes, and the five bodies above keep a table to read.
--
-- chair-step: this DROPS the three portal tables (`custom.portal`, `custom.portal_table`, `custom.portal_principal`) and the fourteen `custom.portal*` functions this lane created, and deletes their `platform.client_callable_door` rows. IT DESTROYS DATA: every portal, every Table a portal exposed and every invitation goes with it. The grants a portal WROTE are ordinary `iam.permissions` rows on client records and are NOT touched here — run `custom.portal_revoke` for each person first, or those outsiders keep reading what they were given with nothing left to say why. Nothing outside this lane's reserved prefix is touched.
-- lane: PORTAL (the outsider portal, PRODUCTS row 2)
--
-- ORDER MATTERS: the door rows first (they name functions), then the functions, then the
-- tables — `custom.portal_table` and `custom.portal_principal` cascade from `custom.portal`,
-- so dropping the parent takes the children, but they are named here anyway so a reader of
-- this file knows exactly what leaves.

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('portal_declare','portals','portal_card','portal_invite',
                         'portal_principal_bind','portal_revoke','portal_me','portal_preview',
                         'portal_admits','portal_public','portal_invitation',
                         'portal_record_title','portal_slug','portal_field_map');

drop function if exists custom.portal_preview(uuid, uuid, uuid, uuid);
drop function if exists custom.portal_invitation(text, text);
drop function if exists custom.portal_public(text);
drop function if exists custom.portal_me();
drop function if exists custom.portal_revoke(uuid, uuid, uuid);
drop function if exists custom.portal_principal_bind(uuid, uuid, uuid);
drop function if exists custom.portal_invite(uuid, uuid, uuid, text, uuid);
drop function if exists custom.portal_card(uuid, uuid);
drop function if exists custom.portals(uuid);
drop function if exists custom.portal_declare(uuid, text, uuid, jsonb, uuid, text, text);
drop function if exists custom.portal_field_map(uuid, uuid);
drop function if exists custom.portal_slug(uuid, text, uuid);
drop function if exists custom.portal_record_title(uuid, uuid);

-- LAST, and NO LONGER DROPPED (lane INVERSE-GUARD, 2026-09-21). `custom.assert_client_may_reach`,
-- `custom.share_grant`, `iam.may_touch_field`, `custom.carrying_edges_in/of`,
-- `custom.list_door_disagreements` and `custom._field_write_door` — the last of which runs under
-- the live trigger `custom_record_field_write_door` on `custom.record` — all read one of these.
-- "Run THEIR inverses first" is not an order anybody can keep on a live database, so the four
-- objects STAY and the three tables are EMPTIED instead: the portals, the exposed Tables and the
-- invitations are all destroyed exactly as this header warns, `custom.portal_admits` answers
-- false for everybody because there is nothing left to admit them to, and those six bodies keep
-- the ground they stand on.
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.portal_admits(uuid, uuid);
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop table if exists custom.portal_principal;
delete from custom.portal_principal;   -- the table stays; every row this lane wrote goes, which is the defect put back.
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop table if exists custom.portal_table;
delete from custom.portal_table;   -- the table stays; every row this lane wrote goes, which is the defect put back.
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop table if exists custom.portal;
delete from custom.portal;   -- the table stays; every row this lane wrote goes, which is the defect put back.
