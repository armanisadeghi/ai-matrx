-- chair-step: restores signup provisioning for guest accounts (replaces the trigger body that skipped is_anonymous) and adds the guest-promotion trigger; the REVOKEs only close client EXECUTE on the two trigger functions, matching every other signup trigger function.
-- based-on: public._provision_new_user_organization() af3d6e5280ba78e0ff34ebe9f91b87185a1215c75752969c78e883d81f1aec1d
-- lane: guest organizations
-- lock: iam.users
--
-- EVERY ACCOUNT GETS ITS ORGANIZATION AT SIGNUP — A GUEST INCLUDED.
--
-- A guest (a website visitor or Chrome-extension user who has not signed in) is a real
-- auth.users row, minted by the server's guest registry (matrx_ai resolve_guest_uuid) with
-- is_anonymous = true. It is an ordinary account that has not told us its name yet, and it
-- owns its own private organization exactly like every other account.
--
-- WHAT BROKE (2026-09-26, access-ladder T-3): access_ladder_t3_signup_org_and_complimentary_pro.sql
-- made this trigger skip is_anonymous accounts, the same day the server began reading a guest's
-- ONE signup membership (aidream effective_org._guest_membership_organization) and
-- public.ensure_personal_organization — the write-time door guests had used — was dropped. From
-- 2026-09-26 17:17 UTC no guest had an organization and every guest AI run was refused with
-- "organization_required: guest … has 0 active organization memberships". Agents then hid guest
-- Chat in the extension instead of fixing this.
--
-- THE LAW THIS RESTORES: common-docs/policies/access-ladder.md — "a guest's own organization is the
-- one created at signup". Never skip a class of account here, never add a write-time fallback
-- elsewhere, never share one organization among guests (organization-wide "Shown to" would show
-- every stranger every other stranger's work). Guard: aidream
-- tests/.../test_guest_signup_gets_its_organization (fails if this trigger skips a guest).
--
-- 1. on_auth_user_created provisions EVERY account, anonymous or not.
-- 2. New trigger on_guest_promoted: when a guest becomes a permanent account in place
--    (lib/services/guest-promotion.ts, admin updateUserById flips is_anonymous → false), it is
--    signup for that person — keep the organization the guest owns (create it for a guest that
--    predates this file), rename the placeholder "Organization <hex>" from the person's name or
--    email, create the profile row the anonymous insert skipped, and grant the pre-launch plan.
--    Conversion INTO an existing account is public.transfer_guest_data_to_user (unchanged): it
--    moves the guest organization's rows into the account's organization.

set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public._provision_new_user_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- signup-organization-creation: public._provision_new_user_organization — this IS signup provisioning: it creates the new account's first organization through iam.provision_signup_organization, for EVERY account including an anonymous guest (a guest is an ordinary account that owns its own organization). The organization being created is the answer; there is nothing to guess and nothing is routed anywhere else.
DECLARE
  _auth_prev_tier text := current_setting('app.actor_tier', true);
  _auth_prev_system text := current_setting('app.actor_system', true);
  _auth_prev_agent text := current_setting('app.actor_agent', true);
BEGIN
  PERFORM set_config('app.actor_tier', 'code', true);
  PERFORM set_config('app.actor_system', 'auth.user_provisioning', true);
  PERFORM set_config('app.actor_agent', '', true);
  -- No branch on is_anonymous: skipping guests here is what broke every guest run on 2026-09-26.
  perform iam.provision_signup_organization(new.id);
  PERFORM set_config('app.actor_tier', coalesce(_auth_prev_tier, ''), true);
  PERFORM set_config('app.actor_system', coalesce(_auth_prev_system, ''), true);
  PERFORM set_config('app.actor_agent', coalesce(_auth_prev_agent, ''), true);
  RETURN NEW;
END;
$function$;

revoke all on function public._provision_new_user_organization() from public, anon, authenticated;
grant execute on function public._provision_new_user_organization() to service_role, supabase_auth_admin;

CREATE FUNCTION public._provision_promoted_guest()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- signup-organization-creation: public._provision_promoted_guest — a guest becoming a permanent account in place IS signup for that person: iam.provision_signup_organization returns the organization the guest already owns (or creates the one a guest that predates signup-for-guests never got), the placeholder name becomes the person's, and the profile row the anonymous insert skipped is created in that same organization. Nothing is guessed or routed elsewhere.
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
    v_org   uuid;
    v_email text;
    v_meta  jsonb;
    v_name  text;
  begin
    v_org := iam.provision_signup_organization(new.id);

    select u.email, u.raw_user_meta_data into v_email, v_meta
      from auth.users u where u.id = new.id;

    -- The guest's organization was named "Organization <hex>" because a guest has no name.
    -- Only that untouched placeholder is renamed; a name the person chose is never overwritten.
    v_name := iam.auto_organization_name(v_meta, v_email);
    if v_name is not null then
      update iam.organizations o
         set name = v_name
       where o.id = v_org
         and o.created_by = new.id
         and o.name = 'Organization ' || substring(replace(new.id::text, '-', ''), 1, 8);
    end if;

    insert into users.profiles (id, organization_id, display_name, avatar_url)
    values (
      new.id,
      v_org,
      coalesce(v_meta ->> 'display_name', v_meta ->> 'name',
               nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'User'),
      coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture')
    )
    on conflict (id) do update set
      display_name = coalesce(excluded.display_name, users.profiles.display_name),
      avatar_url   = coalesce(excluded.avatar_url, users.profiles.avatar_url),
      updated_at   = now();

    perform billing.repair_prelaunch_complimentary_grant(new.id);
    EXIT provisioning_body;
  exception when others then
    -- Never block the sign-up; scream with the remedy.
    perform ops.record_system_error(jsonb_build_object(
      'organization_id', coalesce(v_org, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid),
      'user_id', new.id,
      'kind', 'guest_promotion_provisioning_failed',
      'error_type', sqlstate,
      'error_text', format(
        'public._provision_promoted_guest failed for user %s: %s (%s). The guest became a permanent '
        || 'account but its organization/profile provisioning did not finish. Remedy: re-run '
        || 'select iam.provision_signup_organization(%L); then create the users.profiles row.',
        new.id, sqlerrm, sqlstate, new.id),
      'source_app', 'database',
      'source_feature', 'auth'));
    raise warning 'guest promotion provisioning failed for %: % (%)', new.id, sqlerrm, sqlstate;
    EXIT provisioning_body;
  end;
  PERFORM set_config('app.actor_tier', coalesce(_auth_prev_tier, ''), true);
  PERFORM set_config('app.actor_system', coalesce(_auth_prev_system, ''), true);
  PERFORM set_config('app.actor_agent', coalesce(_auth_prev_agent, ''), true);
  RETURN NEW;
END;
$function$;

revoke all on function public._provision_promoted_guest() from public, anon, authenticated;
grant execute on function public._provision_promoted_guest() to service_role, supabase_auth_admin;

CREATE TRIGGER on_guest_promoted
  AFTER UPDATE OF is_anonymous ON iam.users
  FOR EACH ROW
  WHEN (old.is_anonymous IS TRUE AND new.is_anonymous IS FALSE)
  EXECUTE FUNCTION public._provision_promoted_guest();
