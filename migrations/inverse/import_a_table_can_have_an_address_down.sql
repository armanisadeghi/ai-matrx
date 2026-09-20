-- INVERSE of migrations/campaign/import_a_table_can_have_an_address.sql (lane IMPORT).
--
-- Every function it drops was CREATED by that file. The knob row is removed too.
--
-- WHAT IT DOES NOT UNDO, AND SAYS SO: the addresses already minted (rows of
-- `custom.anon_inbound`), the messages already received (`custom.anon_submission`) and the
-- records and Files they became. Deleting somebody's received mail to tidy up after a
-- migration is the destructive thing this campaign never does. With the doors gone the
-- addresses simply stop being reachable, which is the reversal that costs nothing.

drop function if exists custom.inbound_mail_land(text, jsonb, text);
drop function if exists custom.inbound_mail_map(uuid, uuid, jsonb);
drop function if exists custom.inbound_set(uuid, uuid, boolean);
drop function if exists custom.inbound_addresses(uuid, uuid);
drop function if exists custom.inbound_declare(uuid, uuid, text);
drop function if exists custom.inbound_domain(uuid);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('inbound_declare', 'inbound_addresses', 'inbound_set');

delete from platform.feature_knob where feature = 'custom' and key = 'inbound_domain';
