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

set lock_timeout = '5s';

drop trigger if exists default_organization_is_a_membership on users.user_preferences;
drop function if exists iam._default_organization_is_a_membership();
drop function if exists iam.default_organization_id(uuid);
alter table users.user_preferences drop column if exists default_organization_id;
