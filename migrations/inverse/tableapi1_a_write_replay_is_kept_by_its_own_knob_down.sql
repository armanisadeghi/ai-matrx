-- chair-step: inverse of tableapi1_a_write_replay_is_kept_by_its_own_knob.sql — removes the table API's own idempotency retention knob row; the table API then cannot read its retention and refuses keyed writes until the row is back.
--
-- inverse of tableapi1_a_write_replay_is_kept_by_its_own_knob.sql

set local lock_timeout = '3s';

delete from platform.feature_knob where feature = 'table_api' and key = 'idempotency_retention_hours';
