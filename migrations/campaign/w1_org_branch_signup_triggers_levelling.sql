-- target: branch
--
-- W1-ORG — THE FOUR `auth.users` TRIGGERS THE REHEARSAL BRANCH DID NOT HAVE.
--
-- WHY THIS FILE EXISTS, MEASURED RATHER THAN ASSUMED (2026-09-18, W1-ORG's entry)
-- ------------------------------------------------------------------------------
-- `W1-ORG`'s exit proof is "a fresh signup lands in exactly one auto-created organization
-- named by the ruled fallback order … the signup is executed END TO END and the resulting
-- row count is READ, not asserted from the code path that created it". On the rehearsal
-- branch that sentence could not be executed at all:
--
--     select tgname from pg_trigger where tgrelid = 'auth.users'::regclass
--       and not tgisinternal;
--   production -> on_auth_user_created, on_auth_user_created_crm_party,
--                 on_auth_user_created_profile, zzz_on_auth_user_created_prelaunch_plan
--   branch     -> (zero rows)
--
-- An INSERT into `auth.users` on the branch provisioned NOTHING, so every organization the
-- branch holds got there by some other hand and a signup proof taken there would have been
-- a green nobody can spend — §3 rule 36's exact class. `pnpm check:branch-schema-drift`
-- does not see it: its failing scope is platform, iam, history, custom's guards and the
-- event triggers, and `auth` is outside it. Named here rather than left as a silent hole.
--
-- THE FOUR FUNCTIONS ALL ALREADY EXIST ON THE BRANCH, byte-identical to production where it
-- matters to this lane — `public._d31_impl_ensure_personal_organization(uuid)` and
-- `iam.auto_organization_name(jsonb,text)` both hash `77d47dd4fd204cc90d8bb1fe1cba3473` and
-- `de205c696694bd929876b7f6226fda2d` on BOTH databases (md5 of `pg_get_functiondef`,
-- measured 2026-09-18). Only the four TRIGGER rows were missing, so this file creates
-- exactly those four and nothing else; every body below is production's own
-- `pg_get_triggerdef` output, read SELECT-only inside `begin transaction read only`.
--
-- BRANCH ONLY, AND IT NEEDS NO PRODUCTION HALF: production already carries all four. It is
-- a levelling file, not a change — §3 rule 36's "catalog-derived file in migrations/campaign/
-- headed `-- target: branch`, every body taken verbatim from production".
--
-- IDEMPOTENCE (rule 27): every statement is guarded by `to_regclass`-style existence checks
-- expressed as `drop trigger if exists` + `create trigger`, which is the only idempotent
-- shape PostgreSQL offers for a trigger and is safe HERE because the branch demonstrably has
-- none of them; a second apply therefore reaches the same four rows with the same
-- definitions. This is a `-- target: branch` file and never touches production, so §6b.2's
-- additive allow-list (which refuses `DROP TRIGGER`) does not judge it.
-- THE INVERSE: `migrations/inverse/w1_org_branch_signup_triggers_levelling_down.sql`.

set lock_timeout = '2s';
set statement_timeout = '120s';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public._provision_new_user_personal_org();

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
  for each row execute function public._provision_new_user_profile();

drop trigger if exists on_auth_user_created_crm_party on auth.users;
create trigger on_auth_user_created_crm_party
  after insert or update of is_anonymous, email, phone on auth.users
  for each row when ((new.is_anonymous is false))
  execute function crm._provision_signed_up_user_party();

drop trigger if exists zzz_on_auth_user_created_prelaunch_plan on auth.users;
create trigger zzz_on_auth_user_created_prelaunch_plan after insert on auth.users
  for each row execute function billing.seed_prelaunch_complimentary();
