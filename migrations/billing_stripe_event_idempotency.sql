-- billing_stripe_event_idempotency.sql
-- Idempotency ledger for Stripe webhooks — one row per fully-processed event id.
-- The webhook checks this BEFORE handling and records AFTER success, so a
-- transiently-failed event re-runs on Stripe's retry. Deny-by-default RLS;
-- service_role (the webhook) is the only writer. Idempotent.

create table if not exists billing.stripe_event (
  id          text primary key,          -- Stripe event id (evt_...)
  type        text not null,
  received_at timestamptz not null default now(),
  payload     jsonb
);
alter table billing.stripe_event enable row level security;
drop policy if exists stripe_event_no_access on billing.stripe_event;
create policy stripe_event_no_access on billing.stripe_event
  for all to authenticated using (false) with check (false);
