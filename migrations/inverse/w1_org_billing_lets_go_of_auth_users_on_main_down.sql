-- chair-step: the inverse of w1_org_billing_lets_go_of_auth_users_on_main.sql. It puts back the
--   three foreign keys to auth.users, the user_or_org CHECK and the user_id index. Like its up
--   file it takes ACCESS EXCLUSIVE on auth.users, so it is alone in its own transaction and holds
--   that lock for milliseconds. It requires `user_id` / `org_id` to be back on the three tables,
--   so it runs AFTER w1_org_billing_owner_columns_move_on_main_down.sql, never before.
--   A person reads the body.
--
-- w1_org_billing_lets_go_of_auth_users_on_main_down.sql
--
-- Restores, exactly as production carried them on 2026-09-22:
--   customer_user_id_fkey        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   connect_account_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   subscription_user_id_fkey    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
--   subscription_user_or_org     CHECK ((user_id IS NOT NULL) OR (org_id IS NOT NULL))
--   subscription_user_idx        btree (user_id)

set lock_timeout = '5s';

alter table billing.customer
  add constraint customer_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
alter table billing.connect_account
  add constraint connect_account_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
alter table billing.subscription
  add constraint subscription_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
create index subscription_user_idx on billing.subscription using btree (user_id);
alter table billing.subscription
  add constraint subscription_user_or_org check (user_id is not null or org_id is not null);
