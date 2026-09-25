-- chair-step: drops the W4-AGG surface (custom.agg_* plus the contract-named eighth verb custom.record_aggregate), all created by this lane and by nothing else — it exists so rule 27's up → inverse → up can be run on the lane's final bytes
--
-- THE INVERSE of `w4_agg_record_aggregate.sql` and `w4_agg_subscription_and_digest.sql`.
-- `custom.record_aggregate` is named by the contract (AGT-N-8) rather than by this lane's
-- prefix, but it is this lane's object: nothing of that name existed before it.
--
-- DROP IF EXISTS throughout, so it is safe against a partially applied lane.

set lock_timeout = '2s';

drop function if exists custom.agg_digest_run(uuid, uuid, timestamptz);
drop function if exists custom.agg_subscription_fire(uuid, uuid, uuid, jsonb);

-- 🚨 `custom.agg_deliver(…)` STAYS STANDING (lane INVERSE-GUARD, 2026-09-21). This file used to drop it here. Two
-- lanes that landed AFTER W4-AGG deliver through it on the live path: `custom.booking_notify`
-- in `booking_a_booking_is_a_record_with_a_held_slot.sql`, and PIPELINES' own
-- `custom._pipeline_on_entry`, which the trigger `zzz_pipelines_on_entry` on `custom.record`
-- runs on every write. Dropping it would not put W4-AGG's defect back: the next write to the
-- record store would die on a function that does not exist, before `w4_agg_red` asked its
-- first question — the class `storerel_a_relation_edge_names_its_field_down.sql` lost a whole
-- session to. Detaching that trigger instead would take PIPELINES' entry hook off the store
-- to tear down an aggregate surface, which is not this lane's to do.
--
-- THE DEFECT IS STILL PUT BACK by everything else here: the aggregate verb itself
-- (`custom.record_aggregate`), its planner, its explain pair, its subscription and cadence
-- surface and its digest run are all gone, so nothing aggregates and nothing subscribes,
-- which is the world before W4-AGG. One delivery body standing for two later callers
-- aggregates nothing.
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
