-- target: branch
-- based-on: public._provision_new_user_personal_org() 211120339cf5b0f3a095ff436f226ed0c5728d1835d7a1490d4ed448a5e11f90
--
-- INVERSE of `migrations/campaign/w1_org_one_organization_at_signup_and_never_the_last.sql`.
--
-- Restores the prior state exactly. `public._provision_new_user_personal_org()` goes back to
-- the body the up-migration declared it was based on — sha256
-- `3fd1d1367902fcf692aa55ad95b487069acf417fee266e1d86f78f471dbdf37f` per `pnpm db:based-on`,
-- which is the body live on BOTH databases on 2026-09-18 — written out here verbatim rather
-- than described, because a rollback that cannot be executed is not a rollback. The two new
-- functions and the two new triggers did not exist before the up-migration and are dropped.
--
-- ITS OWN `-- based-on:` LINE names the body it is UNDOING — the ON-capable body this
-- lane's up-migration installed on the rehearsal branch (sha256 `211120…1f90`, read from the
-- BRANCH by pointing `pnpm db:based-on` at it with per-process `SUPABASE_MATRIX_*` overrides,
-- rule 31: the shared `.env.local` is never written). The runner refused this file by name
-- until that line was here, which is the DD-220 guard working: an inverse is a whole-body
-- write like any other.
--
-- It is a `-- target: branch` file and can never reach production; nothing on production runs
-- the ON path while `custom/signup_provisioning_guard` resolves false.

set lock_timeout = '2s';

drop trigger if exists guard_last_organization_membership_update on iam.memberships;
drop trigger if exists guard_last_organization_membership_delete on iam.memberships;
drop function if exists iam._guard_last_organization_membership();
-- A DOOR FOLLOWS ITS FUNCTION, in the same transaction — the guard this lane repaired earlier
-- tonight refused this very inverse until the row went with it (SQLSTATE 23514, `the door for
-- iam.provision_signup_organization(p_user_id uuid) reached COMMIT naming a function that no
-- longer exists`). That is the repaired guard working, on a REAL orphan.
delete from platform.client_callable_door
 where schema_name = 'iam' and function_name = 'provision_signup_organization';
drop function if exists iam.provision_signup_organization(uuid);

create or replace function public._provision_new_user_personal_org()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  _auth_prev_tier text := current_setting('app.actor_tier', true);
  _auth_prev_system text := current_setting('app.actor_system', true);
  _auth_prev_agent text := current_setting('app.actor_agent', true);
BEGIN
  PERFORM set_config('app.actor_tier', 'code', true);
  PERFORM set_config('app.actor_system', 'auth.user_provisioning', true);
  PERFORM set_config('app.actor_agent', '', true);
  <<provisioning_body>>

begin
  if coalesce(new.is_anonymous, false) is false then
    perform public.ensure_personal_organization(new.id);
  end if;
  EXIT provisioning_body;
end;

  PERFORM set_config('app.actor_tier', coalesce(_auth_prev_tier, ''), true);
  PERFORM set_config('app.actor_system', coalesce(_auth_prev_system, ''), true);
  PERFORM set_config('app.actor_agent', coalesce(_auth_prev_agent, ''), true);
  RETURN NEW;
END;
$function$;
