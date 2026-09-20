-- chair-step: this UPDATEs ONE row of `platform.feature_knob` — `custom/external_principal_enabled` — moving `overridable_by` from `{}` to `{organization}` and writing its `basis`. An UPDATE is refused by the additive allow-list by name, so it comes through this route and a person reads exactly what changes. THE DEFAULT STAYS FALSE: no organization gains anything from this file. It changes only WHO may answer the question, from nobody to each organization about itself.
-- lane: PORTAL (the outsider portal, PRODUCTS row 2)
--
-- WHY. W2-TRUST shipped this knob at the platform rung, off, which was right while nothing
-- consumed it: there was no product that let an outsider in, so there was nothing for an
-- organization to say yes to. A portal is that product, and "outsiders may sign in here"
-- is an answer ONE organization gives about ITS OWN data. A clinic opening a patient
-- portal is not making a statement about anybody else's records.
--
-- W2-TRUST'S RULING IS UNTOUCHED, and it is worth quoting because the two can be confused:
-- *"The world lane's two admission checks are NOT switchable: a gate on who may publish to
-- the open internet that a knob can turn off is not a gate. The knobs hold the LANE closed,
-- not the checks."* This file moves the LANE'S switch down one rung. It does not make a
-- check switchable, and it does not touch `custom/world_publish_enabled`, which stays at
-- the platform rung — publishing to the open internet and letting a named client see their
-- own invoices are different acts with different blast radii.
--
-- WHO FLIPS IT. Not a lane and not an agent: `custom.portal_declare` writes the override,
-- in the same transaction as the portal, with the portal's title in the note — so the
-- explicit act VIS-N-5 asks for is a person declaring a portal, and there is a row saying
-- when and why. An organization with no portal keeps the platform default, which is false.
--
-- REVERSIBLE IN ONE STATEMENT. The inverse is
-- `migrations/inverse/portal_an_organization_opens_its_own_outside_door_down.sql`, which
-- puts `overridable_by` back to `{}`; any override rows written in between stop resolving
-- the moment it runs, which is the whole point of holding the lane at the knob.

update platform.feature_knob
   set overridable_by = array['organization']::text[],
       basis = 'PORTAL (PRODUCTS row 2, 2026-09-20): a portal is the consumer of the external-principal lane, and whether outsiders may sign in is one organization''s answer about its own data. custom.portal_declare writes the override with the portal''s title in the note. The platform default stays false.'
 where feature = 'custom' and key = 'external_principal_enabled';
