-- chair-step: this DROPS the three functions errorshonest_s1_one_way_to_say_not_found.sql created — platform.refuse_not_found(text, text, text), platform.refusal_message(text, text), platform.refusal_code(text, text). They hold no data. Run it only AFTER the inverses of errorshonest_2 … errorshonest_7, which restore every body that calls them; before that, a door that says "not found" would fail with 42883 instead.
-- lane: ERRORS-HONEST
-- ground-standing-ok: a
--   (a) The trigger bodies the gate names (iam._guard_emergency_door_grant, hr._timecard_reject_reopen)
--   and every other caller call these three ONLY in the bodies errorshonest_s2 … _s7 wrote. This file
--   runs after those six inverses, which restore every one of those bodies to its P0002 raise, so at
--   the moment of the DROP no live body calls them. Run out of order it is refused by nothing and
--   would leave those triggers raising 42883 — so the order is written here and in the chair's list.

drop function if exists platform.refusal_code(text, text);
drop function if exists platform.refusal_message(text, text);
drop function if exists platform.refuse_not_found(text, text, text);
