-- target: branch
-- additive: yes
-- guard: custom/entity_custom_fields_guard
--
-- THE INVERSE of `migrations/campaign/w1_field_entity_custom_fields.sql` (§4.13, rule 27).
-- It restores the prior state exactly: `crm.party` carries no trigger of ours and schema
-- `custom` holds none of this file's three functions.
--
-- IT IS `-- target: branch` ON PURPOSE, exactly as its sibling inverse is: an inverse is a
-- DROP, which rule 9 forbids on production in any lane; on production it travels
-- `-- chair-step:`.
--
-- The DROP of the trigger comes first because the function it calls cannot be dropped while
-- it is still bound, which is the check that this order is right.

set lock_timeout = '5s';
set statement_timeout = '300s';

drop trigger if exists custom_fields_validation on crm.party;
drop function if exists custom._entity_custom_fields_guard();
drop function if exists custom.validate_custom_fields(text, uuid, jsonb);
drop function if exists custom.custom_fields_tables();
