-- target: branch
--
-- INVERSE of `migrations/campaign/w1_org_branch_signup_triggers_levelling.sql`.
-- Restores the branch's prior state exactly: the four `auth.users` triggers were ABSENT on
-- the rehearsal branch before that file ran (measured 2026-09-18, zero rows from
-- `pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal`), so the inverse
-- is their removal. It is a `-- target: branch` file and can never reach production, where
-- all four are live and are not this campaign's to touch.

set lock_timeout = '5s';

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_created_profile on auth.users;
drop trigger if exists on_auth_user_created_crm_party on auth.users;
drop trigger if exists zzz_on_auth_user_created_prelaunch_plan on auth.users;
