-- The inverse of `digests_the_pulse_is_scheduled.sql`: it unregisters the one job
-- that file registered and touches nothing else. No function, no notification and
-- no Rule is affected — subscriptions simply stop firing by themselves again.

select cron.unschedule('custom-subscription-tick');
