-- chair-step: the inverse of lane BOOKING — drops the ten booking doors, their declarations, and the one column and one index this lane added to custom.anon_submission, and nothing it did not create
--
-- LANE BOOKING — THE INVERSE.
--
-- Running this takes PRODUCTS row 14 back off the store and leaves everything it composes
-- exactly as it was: REC-71's `custom.work_slots_declare`, `work_slot_hold`,
-- `work_slot_holds`, `work_slot_release` and `work_slot_expire`, DOOR-17's
-- `custom.anon_form`, `form_declare`, `form_public`, `form_submit`, `anon_clear` and
-- `form_notify`, and DOOR-18's `custom.agg_subscriptions` / `agg_deliver` are untouched.
--
-- WHAT IT DOES NOT PUT BACK, STATED RATHER THAN HIDDEN:
--
--  * Dropping `custom.anon_submission.booking_ref` DESTROYS EVERY VISITOR'S OWN LINK.
--    The bookings themselves survive — they are ordinary records in the organization's
--    own Table, with their time, their status and their provenance — and the owner can
--    still see, move and cancel every one of them from the inside. What is gone is the
--    ability of the person who booked to reach their own appointment without an account.
--    That is why this file is a chair step.
--
--  * It does NOT delete any slots Table, any hold, or any booking record. A slots Table
--    made by `custom.booking_declare` is an ordinary Table made by REC-71's own door and
--    is left standing; deleting somebody's calendar because a lane was rolled back is the
--    opposite of what an inverse is for.
--
--  * It does NOT un-declare a booking page. The `presentation -> 'booking'` block stays on
--    each `custom.anon_form` row, so the page still answers as a plain form through
--    `custom.form_public`, and re-applying this lane brings its booking side back with the
--    same availability, the same slots Table and the same slug.

set lock_timeout = '5s';
set statement_timeout = '600s';

drop function if exists custom.bookings(uuid, uuid);
drop function if exists custom.booking_cancel(text, text);
drop function if exists custom.booking_reschedule(text, text, text, text);
drop function if exists custom.booking_manage(text, integer);
drop function if exists custom.booking_notify(uuid, uuid, uuid, uuid, text, text);
drop function if exists custom._booking_release(uuid, uuid, uuid);
drop function if exists custom.booking_confirm(uuid, uuid, text, jsonb, text, text, text);
drop function if exists custom.booking_hold(uuid, text, text, text, text);
drop function if exists custom.booking_public(uuid, integer);
drop function if exists custom.booking_declare(uuid, uuid, text, jsonb, jsonb, jsonb, integer, uuid, uuid, uuid, text, uuid);
drop function if exists custom._booking_slots(jsonb, integer);
drop function if exists custom._booking_availability(uuid, jsonb);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by = 'booking_a_booking_is_a_record_with_a_held_slot.sql';

drop index if exists custom.anon_submission_booking_ref_key;

alter table custom.anon_submission drop column if exists booking_ref;
