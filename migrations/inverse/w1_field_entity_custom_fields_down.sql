-- 🚨 TWO BODIES ARE LEFT STANDING, ON PURPOSE (lane INVERSE-GUARD, 2026-09-21).
-- `custom._entity_custom_fields_guard` was ADOPTED after this inverse was written:
-- `platform.custom_fields_retrofit` (entityfields_every_entity_and_detail_can_hold_one.sql) calls
-- it, and that body runs under the LIVE event trigger `entity_type_gets_custom_fields` on
-- `platform.entity_types` — so every new entity type registered after this inverse ran would have
-- raised on a function that was gone. `custom.validate_custom_fields` stays with it because the
-- guard calls it.
--   THE DEFECT IS STILL RESTORED: the `custom_fields_validation` trigger comes off `crm.party`, so
-- the table carries no trigger of ours and nothing validates a party's custom fields — which is
-- the prior state this file exists to put back. `custom.custom_fields_tables` still goes.
--
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

set lock_timeout = '2s';
set statement_timeout = '300s';

drop trigger if exists custom_fields_validation on crm.party;
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom._entity_custom_fields_guard();
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.validate_custom_fields(text, uuid, jsonb);
drop function if exists custom.custom_fields_tables();
