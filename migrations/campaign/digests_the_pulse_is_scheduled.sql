-- chair-step: this registers ONE pg_cron job — a `select cron.schedule(...)`, which the additive allow-list refuses by name because it cannot read what a function call will do. It creates no table, drops nothing, changes no grant and writes no data. The job it registers calls two functions this campaign owns and nothing else.
-- lane: DIGESTS (subscriptions and digests, PRODUCTS row 8; DOOR-18)
--
-- BEFORE THIS FILE, NOTHING CALLED EITHER RUNNER. `custom.agg_subscription_fire`
-- had exactly one caller in the whole database — `custom.form_notify`, on a form
-- submission — and `custom.agg_digest_run` had none at all. `custom.io_outbox`
-- published `records.changed` for every write to the store and no subscription ever
-- heard it. Product #8 was a data model with no pulse: a person could write "text
-- me on a new lead", the store would keep the Rule perfectly, and nothing would ever
-- happen.
--
-- ONE JOB, NOT TWO. `pg_cron` is the scheduling primitive this database already
-- runs thirteen platform jobs on (`files_webhook_tick` every 30 seconds,
-- `hr-membership-access-sweep` hourly, and the rest), so a subscription runner
-- belongs there rather than in a new timer somewhere else. Five minutes is the
-- interval because it is the coarsest that still reads as "as it happens" for a
-- text message and the finest that costs nothing: each tick is two indexed reads
-- when nothing has changed.
--
--   custom.agg_subscription_tick('15 minutes')  reads the records.changed outbox for
--                                               the last fifteen minutes and fires
--                                               the instant subscriptions whose view
--                                               a record has just ENTERED. The window
--                                               is three ticks wide on purpose: a
--                                               missed tick is covered by the next
--                                               two, and re-reading costs nothing
--                                               because custom.agg_deliver's dedupe
--                                               key is a UNIQUE constraint.
--   custom.agg_digest_tick()                    sends the summaries that have come
--                                               due, each measured from its own last
--                                               send.
--
-- BOTH ARE SWITCHED OFF WITH THE PRODUCT. Every path below `custom.agg_*` asks
-- `custom.assert_store_door`, which resolves `custom/system_enabled` for the
-- organization, so while the campaign's switch is off this job does its two reads,
-- steps over every organization and sends nothing.
--
-- THE INVERSE: `migrations/inverse/digests_the_pulse_is_scheduled_down.sql`.

select cron.schedule(
  'custom-subscription-tick',
  '*/5 * * * *',
  $job$select custom.agg_subscription_tick('15 minutes'::interval); select custom.agg_digest_tick();$job$);
