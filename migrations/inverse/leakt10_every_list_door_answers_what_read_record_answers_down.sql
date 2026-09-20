-- chair-step: it DROPS custom.list_door_disagreements, census 13's own function, which nothing
-- but pnpm check:store-doors-decide and the lane's two suites call.
--
-- THE INVERSE of migrations/campaign/leakt10_every_list_door_answers_what_read_record_answers.sql.
-- Run it and census 13 disappears: `pnpm check:store-doors-decide` reports the census as
-- UNMEASURED rather than green, which is the point — a guard that vanishes must not read as a pass.

DROP FUNCTION IF EXISTS custom.list_door_disagreements(text, uuid, integer);
