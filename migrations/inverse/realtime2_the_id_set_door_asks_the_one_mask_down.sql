-- chair-step: INVERSE of realtime2_the_id_set_door_asks_the_one_mask.sql — puts
-- custom.read_records_by_ids back to resolving the caller's level on the TABLE once and
-- masking every row with that one answer, which is the page door's shape. The bytes are in
-- realtime2_the_read_door_by_id_set.sql, whose sha256 is the `-- based-on:` line at the top of
-- the file this inverses. Running it raises check:fields-stay-masked from 7 to 8 by design,
-- which is the reason that shape was replaced.
--
-- It is NOT pasted here: a stale paste of a whole body is how a CREATE OR REPLACE silently
-- reverts another lane's change (DD-220).
select 'recover the body from migrations/campaign/realtime2_the_read_door_by_id_set.sql' as remedy;
