-- chair-step: drops the trigger that keeps an organization's record-store switch from
-- holding two halves that disagree. Running this re-opens the V11-A drift: any proof or
-- fixture that writes platform.knob_override directly can again turn the store on for an
-- organization and leave the server's own half saying the opposite, which is how 42
-- organizations — Greenline Landscaping Crew among them — came to be half-on.
--
-- THE INVERSE of migrations/campaign/fix11a_the_two_halves_of_the_one_switch_cannot_drift.sql.

set lock_timeout = '2s';
set statement_timeout = '600s';

drop trigger if exists store_switch_halves_follow_each_other_tg on platform.knob_override;
drop function if exists platform._store_switch_halves_follow_each_other();
