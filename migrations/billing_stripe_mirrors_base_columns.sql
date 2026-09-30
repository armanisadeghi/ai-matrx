-- billing_stripe_mirrors_base_columns.sql  (lane B-BILLING, 2026-09-29)
--
-- The three Stripe mirror tables (registered Organization, `ledger` variant, by access-ladder T-9c)
-- lacked only base columns the grader requires; the webhook's dedupe table could not be written by
-- the server at all.
--
--   billing.customer         base_id_uuid, base_metadata          (0 rows)
--   billing.connect_account  base_id_uuid, base_metadata, _touch_row  (0 rows)
--   billing.subscription     _touch_row                           (0 rows)
--   billing.stripe_event     service_role held SELECT only, so the Stripe webhook's idempotency
--                            insert (matrx-frontend features/entitlements/stripe/sync.ts, admin
--                            client) would fail 42501 the first time Stripe calls. Granted the same
--                            privileges service_role holds on every other billing table.
--
-- The natural keys stay (customer/connect_account are keyed by organization_id, one per organization,
-- DD-047); `id` is the canonical identity beside them, unique. Nothing reads or writes the new
-- columns yet; every writer (Stripe sync/connect, service role) names its columns, so a default fills
-- them. No policy, no client grant and no access rule changes. Locks: the three empty tables only.

alter table billing.customer        add column if not exists id uuid not null default gen_random_uuid();
alter table billing.customer        add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table billing.connect_account add column if not exists id uuid not null default gen_random_uuid();
alter table billing.connect_account add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists customer_id_key        on billing.customer (id);
create unique index if not exists connect_account_id_key on billing.connect_account (id);

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'billing.connect_account'::regclass and tgname = '_touch_row') then
    create trigger _touch_row before insert or update on billing.connect_account
      for each row execute function platform._touch_row();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'billing.subscription'::regclass and tgname = '_touch_row') then
    create trigger _touch_row before insert or update on billing.subscription
      for each row execute function platform._touch_row();
  end if;
end $$;

grant select, insert, update, delete on billing.stripe_event to service_role;

do $$
begin
  if exists (select 1 from billing.customer where id is null)
     or exists (select 1 from billing.connect_account where id is null) then
    raise exception 'billing mirrors: a row has no id';
  end if;
  if not has_table_privilege('service_role', 'billing.stripe_event', 'INSERT') then
    raise exception 'billing.stripe_event: service_role still cannot insert';
  end if;
end $$;
