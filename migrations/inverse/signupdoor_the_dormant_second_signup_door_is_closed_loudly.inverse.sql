-- lane: SIGNUP-DOOR
-- additive: yes
-- inverse of: migrations/campaign/signupdoor_the_dormant_second_signup_door_is_closed_loudly.sql
-- based-on: public.handle_new_dm_user() bf85d53e7cb46aca6a98f1bf0f4823bcab4d537112caa9e98bb64e7643cee64e
--   (the RETIRED body this lane's up leaves behind: an inverse is read against the world the
--    up made, never against the world before it.)
--
-- Puts the dormant second signup door back, BYTE FOR BYTE as DEFAULT-ORG-4 left it
-- (dorg4_signup_creation_sites_declare_themselves.sql), declaration line and all -- this is
-- pg_get_functiondef's own output, copied out of the live catalogue, so after this file runs
-- the body hashes back to exactly what the up declares it was based on and the up can land
-- again. That is rule 27's third leg, and an inverse that cannot give it back is not an inverse.
--
-- ground-standing-ok: c
--   Clause (c) is CORRECT here and it is the point of the file. public.handle_new_dm_user is a
--   trigger body that NO trigger runs -- that IS the defect this lane closed ("a dormant second
--   signup door"), so the inverse necessarily restores an inert body. The red twin does not
--   assert that the body FIRES; it asserts that the creation shape is back in the live
--   catalogue while nothing runs it, which is what pg_get_functiondef answers and what the
--   no-default-organization census reads.
--   Clause (a) has nothing to find: this file attaches and detaches nothing, and the two live
--   signup triggers (on_auth_user_created -> public._provision_new_user_personal_org,
--   on_auth_user_created_profile -> public._provision_new_user_profile) are untouched by both
--   this file and the file it inverts.

set local lock_timeout = '2s';

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
$function$;

comment on function public.handle_new_dm_user() is
  'DEFAULT-ORG-4 2026-09-22: declared creation site. Signup provisioning for the row being inserted; attached to no trigger.';
