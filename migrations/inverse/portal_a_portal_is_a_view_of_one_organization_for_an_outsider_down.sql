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

-- LAST, because `custom.assert_client_may_reach`, `custom.share_grant`,
-- `iam.may_touch_field`, `custom.carrying_edges_in/of` and `custom.list_door_disagreements`
-- all read one of these. Run THEIR inverses before this file, or those five bodies will
-- raise `42P01` on their next call.
drop function if exists custom.portal_admits(uuid, uuid);
drop table if exists custom.portal_principal;
drop table if exists custom.portal_table;
drop table if exists custom.portal;
