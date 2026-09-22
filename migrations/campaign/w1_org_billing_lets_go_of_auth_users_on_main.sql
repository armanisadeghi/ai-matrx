-- chair-step: this DROPS three live foreign keys, one CHECK constraint and one index on the three
--   Stripe-facing billing tables. It is the FIRST of the two files that move billing's owner
--   columns to the organization, and it exists ONLY because of a lock: every one of its
--   statements needs ACCESS EXCLUSIVE on `auth.users`, and nothing else in the move does. Run it,
--   then `w1_org_billing_owner_columns_move_on_main.sql`, in that order, in the same window.
--   A person reads the whole body.
--
-- w1_org_billing_lets_go_of_auth_users_on_main.sql
--
-- W1-ORG — REC-62, STEP 1 OF 2: BILLING LETS GO OF `auth.users`.
--
-- 🚨 WHY THIS IS ITS OWN FILE — MEASURED, NOT ASSUMED (W1-ORG-PREP, 2026-09-22)
-- ------------------------------------------------------------------------------
-- `alter table … drop constraint <fk>` where the foreign key REFERENCES `auth.users` takes
-- ACCESS EXCLUSIVE on `auth.users` — it has to drop the referential triggers that live on that
-- table — and PostgreSQL holds every lock until COMMIT. `auth.users` is the busiest table on the
-- platform: every sign-in, every token refresh and every signup touches it, so for as long as
-- that lock is held NOBODY CAN LOG IN.
--
-- Sampled from a second connection while the combined file ran on the nightly dev clone
-- (production's own data, 2026-09-22):
--
--     AccessExclusiveLock | auth.users      | granted=FALSE   <- waiting
--     AccessExclusiveLock | billing.customer| granted=true
--     … ERROR: canceling statement due to lock timeout
--
-- It could not even ACQUIRE the lock inside `lock_timeout = '5s'` — twice — on a clone with NO
-- user traffic at all. Kept in one file with the renames, the twelve policies and the four
-- function bodies, that lock would have been held for the whole ~6-second transaction and every
-- retry would have redone all of it.
--
-- So the three statements that need `auth.users` are here, alone, in a transaction that does
-- nothing else. The lock is taken and released in milliseconds, and a failure costs nothing but
-- a retry. Everything else — the renames, the new foreign keys (which point at
-- `iam.organizations`, not at `auth.users`), the primary keys, the policies and the bodies — is
-- in `w1_org_billing_owner_columns_move_on_main.sql`, which never names `auth.users` at all.
--
-- BETWEEN THE TWO FILES the three tables sit with a `user_id` column carrying no foreign key.
-- That is harmless and was measured: all three hold ZERO rows on production and on the clone
-- (2026-09-22), so there is no row whose referential integrity could lapse, and statement 0
-- refuses if that has changed.
--
-- MEASURED ON PRODUCTION, 2026-09-22 (SELECT-only) — every name below exists exactly:
--   customer_user_id_fkey        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   connect_account_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   subscription_user_id_fkey    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   subscription_user_or_org     CHECK ((user_id IS NOT NULL) OR (org_id IS NOT NULL))
--   subscription_user_idx        btree (user_id)
--
-- REVERT: migrations/inverse/w1_org_billing_lets_go_of_auth_users_on_main_down.sql
-- (run it AFTER `w1_org_billing_owner_columns_move_on_main_down.sql`, the reverse of the order
-- these two were applied in).

set lock_timeout = '5s';

do $$
begin
  if (select count(*) from billing.customer) > 0
     or (select count(*) from billing.subscription) > 0
     or (select count(*) from billing.connect_account) > 0 then
    raise exception 'REC-62: billing.customer / subscription / connect_account are no longer empty, so dropping their foreign keys to auth.users would leave real rows unprotected'
      using errcode = 'check_violation',
            hint = 'This pair of files is only correct while the three Stripe-facing tables hold zero rows, which is what was measured on 2026-09-18 and again on 2026-09-22. With rows present the move is add organization_id + backfill from the organization the row''s person NAMES + swap + drop, in four short files. Write those instead of forcing these.';
  end if;
end $$;

alter table billing.customer        drop constraint customer_user_id_fkey;
alter table billing.connect_account drop constraint connect_account_user_id_fkey;
alter table billing.subscription    drop constraint subscription_user_id_fkey;
alter table billing.subscription    drop constraint subscription_user_or_org;
drop index billing.subscription_user_idx;
