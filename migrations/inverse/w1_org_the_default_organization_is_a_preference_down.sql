-- target: branch
--
-- INVERSE of `migrations/campaign/w1_org_the_default_organization_is_a_preference.sql`.
-- Restores the prior state exactly: before that file, `users.user_preferences` carried no
-- `default_organization_id` column and no `default_organization_is_a_membership` trigger, and
-- neither `iam.default_organization_id(uuid)` nor
-- `iam._default_organization_is_a_membership()` existed in the catalogue (measured
-- 2026-09-18 on both databases — the column list was user_id, preferences, created_at,
-- updated_at, auto_rag_enabled, auto_index_non_pdf, organization_id, created_by, updated_by,
-- deleted_at, metadata). Dropping the column takes its FK constraint with it.
--
-- It is a `-- target: branch` file and can never reach production; the production undo is the
-- same four statements as a chair step, and nothing on production reads any of these objects
-- while `custom/signup_provisioning_guard` resolves false.

set lock_timeout = '2s';

drop trigger if exists default_organization_is_a_membership on users.user_preferences;
drop function if exists iam._default_organization_is_a_membership();
drop function if exists iam.default_organization_id(uuid);
-- 🚨 THE COLUMN STAYS, AND IS EMPTIED (lane INVERSE-GUARD, 2026-09-21).
-- `w1_org_one_organization_at_signup_and_never_the_last.sql` — a LATER file of this same
-- family, which this one is not the inverse of — taught
-- `public._provision_new_user_personal_org()` to write
-- `users.user_preferences.default_organization_id` at signup, and that body is what the live
-- trigger `on_auth_user_created` on `auth.users` runs. Dropping the column would leave that
-- trigger attached over a column that is gone, and EVERY SIGNUP would raise: the person would
-- get no account and no organization at all. Detaching `on_auth_user_created` instead is worse
-- again — it silently stops provisioning every new person.
--
-- So the column is LEFT WHERE IT IS and the behaviour is NEUTERED, the same remedy
-- `mergehist_a_compound_operation_signs_its_revision_down.sql` uses for
-- `history.row_versions.migration_id`: the FK, the index and the comment go, every value is
-- set back to NULL, and the resolver and the membership guard above are dropped. After this
-- file runs there is no `iam.default_organization_id()` to read the preference through, no
-- guard that the preference is a membership, and not one row carrying a default — which is
-- the pre-W1-ORG state this file exists to restore — while the signup path the rest of the
-- platform stands on is untouched.
alter table users.user_preferences
  drop constraint if exists user_preferences_default_organization_id_fkey;
drop index if exists users.user_preferences_default_organization_id_idx;
comment on column users.user_preferences.default_organization_id is null;
update users.user_preferences
   set default_organization_id = null
 where default_organization_id is not null;
--   alter table users.user_preferences drop column if exists default_organization_id; -- NOT dropped
