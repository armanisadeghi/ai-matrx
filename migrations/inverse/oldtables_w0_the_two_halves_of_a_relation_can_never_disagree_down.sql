-- chair-step: the inverse of
--   `migrations/campaign/oldtables_w0_the_two_halves_of_a_relation_can_never_disagree.sql`.
--   It DROPS the two deferred constraint triggers named `zzzz_relation_halves_agree` — one on
--   `custom.record`, one on `platform.associations` — and then the function behind them,
--   `custom._relation_halves_agree()`. Both triggers and the function were created by that file
--   and by nothing else; no other object references them. No row of anybody's data is touched,
--   and removing them removes only a refusal: every write that was legal before the up-migration
--   is legal again, and the two halves of a relation go back to being able to drift apart.

drop trigger if exists zzzz_relation_halves_agree on platform.associations;
drop trigger if exists zzzz_relation_halves_agree on custom.record;
drop function if exists custom._relation_halves_agree();
