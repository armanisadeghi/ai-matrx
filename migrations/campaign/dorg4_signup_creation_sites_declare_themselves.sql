-- lane: DEFAULT-ORG-4
-- additive: yes
-- based-on: public._provision_new_user_personal_org() 211120339cf5b0f3a095ff436f226ed0c5728d1835d7a1490d4ed448a5e11f90
-- based-on: public._provision_new_user_profile() ba8a86d6a0feadd321c4b9c8f8920ed4d036a2d91c2d5da25dad86374d67eea0
-- based-on: public.handle_new_dm_user() 31b7e25d25cc5ce349e0a513e83c23d7ffedc291a2e0ceeb341dd3d4e7b96d69
-- personal-organization-creation: public._provision_new_user_personal_org — signup provisioning creates the account's OWN personal organization; the organization being created is the answer.
-- personal-organization-creation: public._provision_new_user_profile — signup provisioning creates the account's OWN personal organization and stamps that account's own profile row with it.
-- personal-organization-creation: public.handle_new_dm_user — same shape: the account's own personal organization, on that account's own profile row.
--
-- CREATING A PERSON'S PERSONAL ORGANIZATION AT PROVISIONING IS NOT SUBSTITUTING ONE.
--
-- Chair ruling, 2026-09-22. Rule 7 forbids answering "which organization?" with the
-- caller's own personal workspace, because that is a choice nobody made being applied to
-- somebody else's work. At SIGNUP there is no such choice to make: the personal
-- organization is being CREATED, for the account being created, and it is the only thing
-- the new profile row could possibly carry. There is nothing to guess.
--
-- So these three are DECLARED rather than rewritten. The declaration is a comment line
-- INSIDE each body, which means `pg_get_functiondef` carries it and the census clause in
-- `scripts/check-no-default-organization-sql.ts` reads the claim off the LIVE DATABASE
-- instead of off a promise in a file. Nothing else about any of the three bodies changes:
-- run `pg_get_functiondef` before and after and the only difference is the line.
--
-- THE VERIFICATION THE DECLARATION STANDS ON, done body by body before it was written:
-- each one only CREATES (the account's own personal organization) and only writes THAT
-- account's own row. None of them reads a stated default, and none of them uses the
-- created organization to route a write belonging to anything else. That is the line
-- between this file and the fourteen in
-- dorg4_fourteen_doors_name_the_organization_they_act_in.sql.
--
-- With this file the ratchet
-- (`scripts/no-default-organization-live-bodies.ratchet.json`) reaches ZERO honestly --
-- not by exempting a shape but by answering every body that carried it.

set local lock_timeout = '2s';

-- ── 1. public._provision_new_user_personal_org ─────────────────────────
-- Verified against the live body: it does nothing but run the provisioner for the row
-- being inserted (`new.id`) -- `iam.provision_signup_organization` behind the
-- `custom/signup_provisioning_guard` knob, or `ensure_personal_organization` while the
-- knob resolves false. It reads no preference and writes no other table's organization.
CREATE OR REPLACE FUNCTION public._provision_new_user_personal_org()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- personal-organization-creation: public._provision_new_user_personal_org — this IS signup provisioning: it creates the new account's own personal organization. The organization being created is the answer; there is nothing to guess and nothing is routed anywhere else.
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

-- ── 2. public._provision_new_user_profile ─────────────────────────────
-- Verified against the live body: the only row it writes is `users.profiles` FOR THE SAME
-- USER, stamped with the organization provisioning just created for that user. A profile
-- row carrying its own owner's organization is the parent every satellite in this campaign
-- now derives from -- so this is the site that MAKES the honest answer available, not a
-- site that substitutes one.
CREATE OR REPLACE FUNCTION public._provision_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- personal-organization-creation: public._provision_new_user_profile — signup provisioning for the row being inserted: it creates (or reuses) that account's own personal organization and stamps that account's own profile row with it. It routes no other table's write and reads no stated default.
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

-- ── 3. public.handle_new_dm_user ───────────────────────────────────
-- Same shape as #2 and the same verification: one profile row for the account being
-- created, stamped with that account's own newly-created personal organization.
--
-- 🚨 MEASURED ON THE MAIN DATABASE 2026-09-22, AND LEFT FOR A LANE THAT OWNS SIGNUP:
-- this trigger function IS ATTACHED TO NOTHING. `auth.users` carries `on_auth_user_created`
-- (_provision_new_user_personal_org), `on_auth_user_created_profile`
-- (_provision_new_user_profile), `on_auth_user_created_crm_party` and
-- `zzz_on_auth_user_created_prelaunch_plan` -- none of them is this. It is a dormant second
-- door onto signup provisioning, the same class DEFAULT-ORG-3 found in
-- `public.create_personal_organization` and closed by replacing it with a raising body.
-- This lane's brief is the seventeen bodies and the chair ruled all three creation sites
-- are DECLARED, so it is declared rather than closed; the dormancy is recorded here and in
-- the report so the next reader is not the person who re-attaches it.
CREATE OR REPLACE FUNCTION public.handle_new_dm_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- personal-organization-creation: public.handle_new_dm_user — signup provisioning for the row being inserted: it creates (or reuses) that account's own personal organization and stamps that account's own profile row with it. It routes no other table's write and reads no stated default. (Attached to no trigger on the main database as of 2026-09-22.)
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
