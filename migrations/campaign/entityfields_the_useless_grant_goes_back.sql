-- chair-step: one REVOKE, refused by the production allow-list by name.
--
-- ENTITY-FIELDS 5 — THE ORDER OF TWO STATEMENTS.
--
-- File 4 revoked `custom.assert_client_may_reach` from `authenticated` and THEN deleted its
-- door row. Between the two, the GRANT it issued for `custom.assert_entity_door` fired the
-- `platform_reopen_declared_doors` event trigger, which re-granted every DECLARED door of
-- schema `custom` - and `assert_client_may_reach` was still declared at that instant, so its
-- grant came straight back. `pnpm check:store-doors-decide` then named it twice, correctly.
-- The row is gone now, so the revoke is all that is left and nothing re-opens it.
--
-- The lesson, recorded because it is the class: in this schema a REVOKE only sticks AFTER the
-- declaration is gone, because the declaration is what hands the grant back.
--
-- INVERSE: migrations/inverse/entityfields_the_useless_grant_goes_back_down.sql

REVOKE EXECUTE ON FUNCTION custom.assert_client_may_reach(uuid, text) FROM authenticated;
