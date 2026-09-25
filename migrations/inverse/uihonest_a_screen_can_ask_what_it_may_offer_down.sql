-- INVERSE of migrations/campaign/uihonest_a_screen_can_ask_what_it_may_offer.sql
--
-- Removes the door this lane added, and only that: the declaration row first
-- (so nothing re-grants it), then the function. Nothing else in the store knows
-- this door exists, so there is nothing to put back.

set lock_timeout = '2s';
set statement_timeout = '600s';

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name = 'my_levels'
   and identity_argtypes = array['uuid'::regtype::oid, '_uuid'::regtype::oid, 'text'::regtype::oid];

drop function if exists custom.my_levels(uuid, uuid[], text);
