-- app.definition + agent.message_template — DROP the legacy user_id / is_public
-- columns. Final step of certifying tokens 'app' and 'message_template'.
--
-- Doctrine database-changeover-doctrine.md §8a-1 state 3: "Prove the new code is
-- LIVE, then drop." Both halves were verified RUNNING in production before this
-- file was applied — not merely pushed:
--   aidream   0.2.55, /health/version git_sha 9ab5a3e5, contains 5eba6a711
--             (aga_apps adapter ownership -> created_by)
--   frontend  release v0.4.545, SHA 99c464bf aliased to aimatrx.com, contains
--             45e4b1521 (every FE writer/reader repointed)
--
-- The companion migration app_message_template_repoint_legacy_owner.sql already
-- moved all six Postgres functions, the shareable registry, both indexes, and
-- backfilled the 10 disagreeing visibility rows. Nothing in the DB or either
-- repo reads these columns any more.
--
-- Never CASCADE: a dependent object must still fail loudly. IF EXISTS keeps the
-- migration replay-safe after the live change has already landed.

begin;

alter table app.definition
  drop column if exists user_id,
  drop column if exists is_public;

alter table agent.message_template
  drop column if exists user_id,
  drop column if exists is_public;

commit;
