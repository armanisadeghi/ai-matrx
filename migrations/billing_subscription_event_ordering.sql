-- billing_subscription_event_ordering.sql
-- Out-of-order webhook guard: track the Stripe event timestamp last applied to a
-- subscription so a retried OLDER event (Stripe doesn't guarantee delivery order)
-- can't overwrite newer state (e.g. an old `active` clobbering a newer `canceled`).
-- The sync layer compares event.created against this before applying. Idempotent.
alter table billing.subscription add column if not exists last_stripe_event_at timestamptz;
