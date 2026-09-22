-- DEFAULT-ORG-4 inverse — removes the `-- personal-organization-creation:` declaration
-- from the three signup provisioning bodies.
--
-- Each body is restored to its bytes on the main database on 2026-09-22 before
-- migrations/campaign/dorg4_signup_creation_sites_declare_themselves.sql — which is the
-- SAME BEHAVIOUR, minus one comment line. Nothing about signup changes either way.
--
-- What DOES change is the guard: with the declaration gone, the census clause in
-- scripts/check-no-default-organization-sql.ts counts all three as unanswered live bodies
-- again and goes red naming them. That is the point of running it — the declaration is
-- the only thing standing between these three and a red guard, so removing it must show.
--
-- Only run it to undo a change that broke something worse, and say what.

-- ground-standing-ok: c
-- Clause (c) asks whether any body here is a trigger body nothing runs.
-- MEASURED ON THE MAIN DATABASE 2026-09-22: `public.handle_new_dm_user` is indeed attached
-- to NO trigger -- `auth.users` carries `on_auth_user_created`,
-- `on_auth_user_created_profile`, `on_auth_user_created_crm_party` and
-- `zzz_on_auth_user_created_prelaunch_plan`, and none of them is this. It is a dormant
-- second signup door, recorded as such in the forward file and in DEFAULT-ORG-4's report.
-- The other two ARE live (`on_auth_user_created` and `on_auth_user_created_profile`). This
-- file restores all three to bytes they already had, so nothing can be left unrunnable.
--
-- The bodies this file OVERWRITES are the ones the forward migration installed, so these
-- hashes are of the POST-change bodies, measured on the dev clone right after leg 1.
-- based-on: public._provision_new_user_personal_org() 3c867e66ce8fab3e5fdb544ef2a1f8585d6a776883778a6762185fa2281f9eac
-- based-on: public._provision_new_user_profile() 464658fd63de79ee27915a32105c709f9248ea019033a2aabccb9e274f67b095
-- based-on: public.handle_new_dm_user() f1d96dc716654a8883c9d34fd5c4811108b2e23a27e2cb4a4baf1b97c02491ad

set local lock_timeout = '2s';


-- public._provision_new_user_personal_org() — without the declaration line
CREATE OR REPLACE FUNCTION public._provision_new_user_personal_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _auth_prev_tier text := current_setting('app.actor_tier', true);
  _auth_prev_system text := current_setting('app.actor_system', true);
  _auth_prev_agent text := current_setting('app.actor_agent', true);
  _campaign_on boolean;
BEGIN
  PERFORM set_config('app.actor_tier', 'code', true);
  PERFORM set_config('app.actor_system', 'auth.user_provisioning', true);
  PERFORM set_config('app.actor_agent', '', true);
  <<provisioning_body>>

begin
  if coalesce(new.is_anonymous, false) is false then
    -- THE GUARD. `custom/signup_provisioning_guard` resolves false on both databases today,
    -- so every signup takes the SAME line it takes now.
    _campaign_on := coalesce(
      (platform.knob_resolve('custom', 'signup_provisioning_guard', null) #>> '{}')::boolean,
      false);
    if _campaign_on then
      perform iam.provision_signup_organization(new.id);
    else
      perform public.ensure_personal_organization(new.id);
    end if;
  end if;
  EXIT provisioning_body;
end;

  PERFORM set_config('app.actor_tier', coalesce(_auth_prev_tier, ''), true);
  PERFORM set_config('app.actor_system', coalesce(_auth_prev_system, ''), true);
  PERFORM set_config('app.actor_agent', coalesce(_auth_prev_agent, ''), true);
  RETURN NEW;
END;
$function$
;

-- public._provision_new_user_profile() — without the declaration line
CREATE OR REPLACE FUNCTION public._provision_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _auth_prev_tier text := current_setting('app.actor_tier', true);
  _auth_prev_system text := current_setting('app.actor_system', true);
  _auth_prev_agent text := current_setting('app.actor_agent', true);
BEGIN
  PERFORM set_config('app.actor_tier', 'code', true);
  PERFORM set_config('app.actor_system', 'auth.user_provisioning', true);
  PERFORM set_config('app.actor_agent', '', true);
  <<provisioning_body>>

declare
  v_org uuid;
begin
  if coalesce(new.is_anonymous, false) is true then
    EXIT provisioning_body;
  end if;
  v_org := public.ensure_personal_organization(new.id);
  insert into users.profiles (id, organization_id, display_name, avatar_url)
  values (
    new.id,
    v_org,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1),
      'User'
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  )
  on conflict (id) do update set
    display_name = coalesce(excluded.display_name, users.profiles.display_name),
    avatar_url   = coalesce(excluded.avatar_url, users.profiles.avatar_url),
    updated_at   = now();
  EXIT provisioning_body;
exception when others then
  -- Never block account creation on profile provisioning; scream instead.
  raise warning 'profile provisioning failed for % : % (%)', new.id, sqlerrm, sqlstate;
  EXIT provisioning_body;
end;

  PERFORM set_config('app.actor_tier', coalesce(_auth_prev_tier, ''), true);
  PERFORM set_config('app.actor_system', coalesce(_auth_prev_system, ''), true);
  PERFORM set_config('app.actor_agent', coalesce(_auth_prev_agent, ''), true);
  RETURN NEW;
END;
$function$
;

-- public.handle_new_dm_user() — without the declaration line
CREATE OR REPLACE FUNCTION public.handle_new_dm_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_org uuid;
BEGIN
  v_org := public.ensure_personal_organization(NEW.id);

  INSERT INTO users.profiles (id, organization_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    v_org,
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(NEW.email, '@', 1),
      'User'
    ),
    COALESCE(
      NEW.raw_user_meta_data ->> 'avatar_url',
      NEW.raw_user_meta_data ->> 'picture'
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(
      EXCLUDED.display_name,
      users.profiles.display_name
    ),
    avatar_url = COALESCE(
      EXCLUDED.avatar_url,
      users.profiles.avatar_url
    ),
    updated_at = now();
  RETURN NEW;
END;
$function$
;
