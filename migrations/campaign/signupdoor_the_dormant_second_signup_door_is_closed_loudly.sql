-- lane: SIGNUP-DOOR
-- additive: yes
-- supersedes: migrations/auth_user_provisioning_triggers_restored.sql
-- supersedes-function: public.handle_new_dm_user
-- based-on: public.handle_new_dm_user() f1d96dc716654a8883c9d34fd5c4811108b2e23a27e2cb4a4baf1b97c02491ad
--
-- THE SECOND SIGNUP DOOR THAT WAS STILL STANDING, CLOSED THE SAME WAY THE FIRST ONE WAS.
--
-- DEFAULT-ORG-3 found `public.create_personal_organization` attached to nothing and replaced
-- its body with one that RAISES, naming the live signup path. DEFAULT-ORG-4 then measured the
-- whole catalogue and left one sibling behind, recorded in its own migration, in its inverse
-- and in the build log: `public.handle_new_dm_user` is the SAME shape — a signup trigger
-- function, attached to NO trigger, still carrying the personal-organization creation body.
-- DEFAULT-ORG-4 could only DECLARE it (the chair ruling covers creation sites) because closing
-- a signup door belongs to a lane that owns signup. This is that lane.
--
-- THE CENSUS, measured 2026-09-22 on the main database and in both repositories.
--   ATTACHED TO NOTHING. `pg_trigger` joined to `pg_proc` over every non-system schema returns
--   exactly two rows for the signup family, and neither is this one:
--       on_auth_user_created          on auth.users -> public._provision_new_user_personal_org
--       on_auth_user_created_profile  on auth.users -> public._provision_new_user_profile
--   auth.users' four non-internal triggers are those two plus on_auth_user_created_crm_party
--   (crm._provision_signed_up_user_party) and zzz_on_auth_user_created_prelaunch_plan
--   (billing.seed_prelaunch_complimentary). None of them is this.
--   WHO EVER ATTACHED IT. Nothing in either repository's history ever did. The only ledgered
--   file that names it is `migrations/auth_user_provisioning_triggers_restored.sql` (the
--   2026-08-22 incident record, after the project move dropped every custom trigger on
--   auth.users), and it names this function only to say WHY it was not restored: at signup
--   there is no `auth.uid()`, so users.profiles' own `_stamp_org_default` cannot resolve the
--   organization, "which is why the original handle_new_dm_user could not have worked here."
--   The four triggers it restored point at `_provision_new_user_*` and crm/billing instead.
--   `migrations/dd169_grandfather_batch2_reading_doors.sql` names it once, in the list of
--   grandfather rows it DELETES — a trigger function holds no client EXECUTE grant.
--   NOTHING CALLS IT. `pg_get_functiondef` over every function in every non-system schema
--   returns one body that contains the string at all, `public.edu_set_age_band`, and there it
--   is a COMMENT ("created at signup by handle_new_dm_user"), not a call. `pg_depend` records
--   no non-automatic dependent. No .ts/.tsx/.py/.sql line in matrx-frontend, aidream,
--   matrx-extend, matrx-local or the @ai-matrx sources calls it; the only hits anywhere are
--   this campaign's own files and census JSON.
--   NO DOOR ROW. `platform.client_callable_door` carries none for it and never did — it is a
--   trigger function, not a client-callable door — so there is nothing to move into
--   `platform.client_callable_door_retirement`. The retirement marker that DOES belong to a
--   function is its own comment, and this file writes it, exactly as DEFAULT-ORG-3 did.
--
-- WHY REPLACE AND NOT DROP. Dropping it would make re-creating it silent. Replacing the body
-- with one that raises means the failure arrives at the FIRST signup after anyone attaches it,
-- with a sentence that names the live path and the file to change instead. Soft-retire, never
-- delete. The signature is untouched, so nothing that resolves the name breaks differently.
--
-- WHAT THE RATCHET DOES. The body loses its `-- personal-organization-creation:` declaration,
-- because there is no longer a creation in it. `check:no-default-organization-sql` reads
-- `pg_get_functiondef` off the live database, so the census stops printing this name the
-- moment this file lands: three declared creation sites become two, and both of those are
-- attached to a live trigger and provably at signup.
--
-- Inverse: migrations/inverse/signupdoor_the_dormant_second_signup_door_is_closed_loudly.inverse.sql
-- Proof:   scripts/campaign-tests/signupdoor_green.sql (green)
--          scripts/campaign-tests/signupdoor_red.sql   (red twin)

set local lock_timeout = '2s';

create or replace function public.handle_new_dm_user()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- RETIRED 2026-09-22 by lane SIGNUP-DOOR. Attached to no trigger anywhere in the database
  -- when this was written, and nothing in either repository ever attached it. Replaced rather
  -- than dropped so that re-attaching it fails at the first signup, naming the live door,
  -- instead of quietly running a second provisioning path beside it.
  raise exception 'handle_new_dm_user: this is a retired signup provisioner and it is attached to nothing. Signup provisioning runs from the triggers on_auth_user_created and on_auth_user_created_profile on auth.users, through public._provision_new_user_personal_org and public._provision_new_user_profile. Remedy: attach nothing to this; change _provision_new_user_personal_org or _provision_new_user_profile instead.'
    using errcode = '23502';
end;
$function$;

comment on function public.handle_new_dm_user() is
  'SIGNUP-DOOR 2026-09-22: RETIRED, kept loud rather than dropped. It was a pre-campaign signup trigger function (it created the new personal organization for the account being inserted and stamped users.profiles with it) and it has been attached to no trigger since at least the 2026-08-22 project move, which restored four other triggers on auth.users and deliberately not this one. The live path is on_auth_user_created -> public._provision_new_user_personal_org and on_auth_user_created_profile -> public._provision_new_user_profile. Re-attaching this raises 23502 naming both.';
