-- chair-step: the inverse of V1-STORE-FIXES finding 1 - it removes the organization wall
-- from schema `custom`, which is a DROP and therefore never an unattended step. Header-less
-- on purpose (§4.9): a file naming production in a `-- target:` header PLUS `-- chair-step:`
-- is refused by both runners as `chair-step-names-production`, and these same bytes rehearse
-- on the branch with `--target branch`.
--
-- It restores the state the store was in before
-- `migrations/campaign/w1_v1store_organizations_are_hard_walls.sql`: no wall triggers on the three
-- base tables in `custom`, and no census or predicate behind them. Every other guard -
-- containment, the field and rule shape guards, `custom.validate_values` - is untouched,
-- because the wall added nothing to them.
--
-- It is written to run twice with the same result: every statement carries IF EXISTS.

drop trigger if exists custom_record_organization_wall on custom.record;
drop trigger if exists custom_external_link_organization_wall on custom.external_link;
drop trigger if exists custom_external_source_organization_wall on custom.external_source;

drop function if exists custom._organization_wall_guard();
drop function if exists custom.assert_organization_wall(text, uuid, jsonb);
drop function if exists custom.organization_references(text, uuid, jsonb);
