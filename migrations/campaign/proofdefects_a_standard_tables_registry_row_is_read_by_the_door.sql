-- chair-step: lane PROOF-DEFECTS (D1). custom.entity_table(text) — the one lookup every standard-table custom-field door uses to turn a token ("party", "crm_deal") into its table — ran as the PERSON, and platform.entity_types is readable only by platform admins (its restrictive policy platform_admin_only, the registry's System class). So for every ordinary signed-in person, admin@admin.com included, "party" was "There is no table called "party" in this system" and custom.entity_record_read / entity_records_find / entity_value_write answered 400 on every CRM contact, deal, template, screenshot and SEO run page. This file makes the lookup SECURITY DEFINER (it returns only the registry's identity for a token: schema, table, type, title column, label and two catalogue facts — never a row). The rows themselves are still read AS THE PERSON by the calling door, under the table's own row-level security. No policy, grant, table or row changes.
-- lane: PROOF-DEFECTS
--
-- Inverse: migrations/inverse/proofdefects_a_standard_tables_registry_row_is_read_by_the_door_down.sql.
--
-- THE USE CASE. Castellano & Reyes' paralegal opens the CRM contact Jordan Reyes. The page's
-- "Custom fields" section asks custom.entity_record_read(org, 'party', <id>) for the contact's
-- custom values. The door must find the `party` table in the registry whoever is asking; whether
-- the paralegal may open THIS contact is crm.party's own row security, unchanged.

set local statement_timeout = '60s';

alter function custom.entity_table(text) security definer;

comment on function custom.entity_table(text) is
  'REC-33: a standard table''s registry token -> its table (schema, name, type, title column, label, has organization_id, has deleted_at). SECURITY DEFINER since lane PROOF-DEFECTS (D1, 2026-09-27): platform.entity_types is readable only by platform admins, so as an invoker this said "There is no table called ..." to every ordinary person. It returns registry identity only; the calling door still reads the row as the person.';
