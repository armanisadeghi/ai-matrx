-- chair-step: drops the W4-AGG surface (custom.agg_* plus the contract-named eighth verb custom.record_aggregate), all created by this lane and by nothing else — it exists so rule 27's up → inverse → up can be run on the lane's final bytes
--
-- THE INVERSE of `w4_agg_record_aggregate.sql` and `w4_agg_subscription_and_digest.sql`.
-- `custom.record_aggregate` is named by the contract (AGT-N-8) rather than by this lane's
-- prefix, but it is this lane's object: nothing of that name existed before it.
--
-- DROP IF EXISTS throughout, so it is safe against a partially applied lane.

set lock_timeout = '5s';

drop function if exists custom.agg_digest_run(uuid, uuid, timestamptz);
drop function if exists custom.agg_subscription_fire(uuid, uuid, uuid, jsonb);
drop function if exists custom.agg_deliver(uuid, uuid, uuid, text, uuid, text, text, text, jsonb);
drop function if exists custom.agg_view_admits(uuid, uuid, uuid);
drop function if exists custom.agg_subscriptions(uuid, uuid, text);
drop function if exists custom.agg_subscription_cadences();

drop function if exists custom.agg_explain(uuid, uuid, jsonb, jsonb, jsonb, jsonb, text);
drop function if exists custom.agg_explain(uuid, uuid, jsonb, jsonb);
drop function if exists custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text);
drop function if exists custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text);
drop function if exists custom.agg_value_sql(text);
drop function if exists custom.agg_assert_key(text);
drop function if exists custom.agg_buckets();
drop function if exists custom.agg_operations();
