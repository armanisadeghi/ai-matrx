-- ENTITY-FIELDS 2 — INVERSE.
--
-- It removes the machinery, NEVER the columns. Dropping `custom_fields` from 643 live tables
-- would delete every custom value an organization has written on a standard row, and that is
-- the one thing this campaign stops at. What the inverse undoes is the automation and the
-- verb: the registry trigger stops retrofitting new tables and
-- `platform.custom_fields_retrofit` stops existing. The columns and their validation triggers
-- stay, holding the values people wrote, exactly as an ADD COLUMN is additive in the first
-- place.
--
-- A relation that must genuinely lose the column loses it one at a time, by name, by a person
-- who has read what is in it.

DROP TRIGGER IF EXISTS entity_type_gets_custom_fields ON platform.entity_types;
DROP FUNCTION IF EXISTS platform._entity_type_gets_custom_fields();
DROP FUNCTION IF EXISTS platform.custom_fields_retrofit(text);
