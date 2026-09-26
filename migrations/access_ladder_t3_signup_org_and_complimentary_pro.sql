-- chair-step: signup provisioning moves to a trigger function whose name no longer carries the retired organization type; the old trigger function and the unattached retired tombstone create_personal_organization() are DROPPED (nothing references either once on_auth_user_created is repointed). There is no additive form of removing a function.
-- based-on: billing.seed_prelaunch_complimentary() c6c00492e6714e55f21c9f939a823ad7c11cccc5cad138e27f37e03d483ef8af
-- based-on: public._provision_new_user_profile() 464658fd63de79ee27915a32105c709f9248ea019033a2aabccb9e274f67b095
-- based-on: public.handle_new_dm_user() bf85d53e7cb46aca6a98f1bf0f4823bcab4d537112caa9e98bb64e7643cee64e
-- lane: access-ladder T-3
-- lock: auth.users, billing
--
-- SIGNUP CREATES ONE ORGANIZATION, AND THE PRE-LAUNCH COMPLIMENTARY PRO KEYS ON THE PERSON AND
-- THAT ORGANIZATION — NEVER ON AN ORGANIZATION TYPE.
-- (The access ladder, common-docs/policies/access-ladder.md: organizations are unlimited and equal.)
--
-- 1. on_auth_user_created now runs public._provision_new_user_organization(), which always calls
--    iam.provision_signup_organization (flag-free since T-1). The knob custom/signup_provisioning_guard
--    used to route the legacy lane through ensure_personal_organization, which still wrote the
--    deprecated flag = true on every signup.
-- 2. public._provision_new_user_profile stamps the profile with that same organization
--    (provision_signup_organization returns the organization the person already holds).
-- 3. billing.seed_prelaunch_complimentary (PRELAUNCH_COMPLIMENTARY): billing.user_plan for the
--    person (unchanged) + billing.org_plan for the signup organization with the organization plan.
--    It used to pick the plan by the deprecated flag, which T-1 left false for new signups.
-- 4. The retired tombstone create_personal_organization() is dropped; handle_new_dm_user()'s
--    refusal names the new door.

set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public._provision_new_user_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- signup-organization-creation: public._provision_new_user_organization — this IS signup provisioning: it creates the new account's first organization through iam.provision_signup_organization. The organization being created is the answer; there is nothing to guess and nothing is routed anywhere else.
DECLARE
  _auth_prev_tier text := current_setting('app.actor_tier', true);
  _auth_prev_system text := current_setting('app.actor_system', true);
  _auth_prev_agent text := current_setting('app.actor_agent', true);
BEGIN
  PERFORM set_config('app.actor_tier', 'code', true);
  PERFORM set_config('app.actor_system', 'auth.user_provisioning', true);
  PERFORM set_config('app.actor_agent', '', true);
  if coalesce(new.is_anonymous, false) is false then
    perform iam.provision_signup_organization(new.id);
  end if;
  PERFORM set_config('app.actor_tier', coalesce(_auth_prev_tier, ''), true);
  PERFORM set_config('app.actor_system', coalesce(_auth_prev_system, ''), true);
  PERFORM set_config('app.actor_agent', coalesce(_auth_prev_agent, ''), true);
  RETURN NEW;
END;
$function$;

revoke all on function public._provision_new_user_organization() from public, anon, authenticated;
grant execute on function public._provision_new_user_organization() to service_role, supabase_auth_admin;

create or replace trigger on_auth_user_created after insert on auth.users for each row execute function public._provision_new_user_organization();

drop function public._provision_new_user_personal_org();
drop function public.create_personal_organization();

CREATE OR REPLACE FUNCTION public._provision_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- signup-organization-creation: public._provision_new_user_profile — signup provisioning for the row being inserted: it stamps that account's own profile row with the organization iam.provision_signup_organization created (or already holds) for that same account. It routes no other table's write and reads no stated default.
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
  v_org := iam.provision_signup_organization(new.id);
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

CREATE OR REPLACE FUNCTION billing.seed_prelaunch_complimentary()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'billing', 'public'
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
  PRELAUNCH_COMPLIMENTARY_TIER      constant billing.tier := 'premium';
  PRELAUNCH_COMPLIMENTARY_USER_PLAN constant text := 'personal-pro';
  PRELAUNCH_COMPLIMENTARY_ORG_PLAN  constant text := 'company-pro';
  PRELAUNCH_COMPLIMENTARY_NOTE      constant text :=
    'Pre-launch complimentary Pro (Arman 2026-08-16). No Stripe object; can never charge.';
begin
  insert into billing.user_plan (user_id, tier, source, note, plan_id)
  values (new.id, PRELAUNCH_COMPLIMENTARY_TIER, 'complimentary',
          PRELAUNCH_COMPLIMENTARY_NOTE, PRELAUNCH_COMPLIMENTARY_USER_PLAN)
  on conflict (user_id) do nothing;

  -- The organization signup created earlier in this same insert (trigger
  -- on_auth_user_created fires before this one alphabetically). Every
  -- organization is equal (access ladder, 2026-09-26): the person carries the
  -- person plan above, the organization carries the organization plan, and no
  -- organization type chooses between them.
  insert into billing.org_plan (organization_id, tier, source, note, plan_id)
  select o.id, PRELAUNCH_COMPLIMENTARY_TIER, 'complimentary',
         PRELAUNCH_COMPLIMENTARY_NOTE, PRELAUNCH_COMPLIMENTARY_ORG_PLAN
  from iam.organizations o
  where o.created_by = new.id
  on conflict (organization_id) do nothing;

  EXIT provisioning_body;
exception when others then
  -- Loud but never signup-blocking: a missed grant is recoverable, a failed
  -- signup is not.
  raise warning 'seed_prelaunch_complimentary failed for user %: % (%)',
    new.id, sqlerrm, sqlstate;
  EXIT provisioning_body;
end;

  PERFORM set_config('app.actor_tier', coalesce(_auth_prev_tier, ''), true);
  PERFORM set_config('app.actor_system', coalesce(_auth_prev_system, ''), true);
  PERFORM set_config('app.actor_agent', coalesce(_auth_prev_agent, ''), true);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_dm_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- RETIRED 2026-09-22 by lane SIGNUP-DOOR. Attached to no trigger anywhere in the database
  -- when this was written, and nothing in either repository ever attached it. Replaced rather
  -- than dropped so that re-attaching it fails at the first signup, naming the live door,
  -- instead of quietly running a second provisioning path beside it.
  raise exception 'handle_new_dm_user: this is a retired signup provisioner and it is attached to nothing. Signup provisioning runs from the triggers on_auth_user_created and on_auth_user_created_profile on auth.users, through public._provision_new_user_organization and public._provision_new_user_profile. Remedy: attach nothing to this; change _provision_new_user_organization or _provision_new_user_profile instead.'
    using errcode = '23502';
end;
$function$
;
