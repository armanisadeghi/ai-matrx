-- target: branch
-- based-on: custom.portal_public(text) 701556a96f645999b4b42c11468f064f3627e01a87556beda27be4cb1348f433
--
-- LANE S6 — `custom.portal_public` ON THE REHEARSAL BRANCH, LEVELLED WITH MAIN'S BODY.
--
-- WHY. S6's up file (`migrations/campaign/uichamp_s6_a_portal_carries_its_look_and_its_forms.sql`)
-- declares `custom.portal_public(text)` based on sha256 1c6fdf18…, which is the body LIVE ON MAIN
-- (read 2026-09-24 ~06:55 UTC, read-only, `pnpm db:based-on … --based-on-target production`).
-- The branch holds 701556a9…, which is main's body WITHOUT STORE-OFF's "the store is switched
-- off" answer: `storeoff_a_link_says_the_store_is_off_rather_than_404.sql` was applied to the
-- branch 2026-09-22 04:52Z and `orgcleanup_a_portal_is_archived_never_deleted.sql` 16:49Z the same
-- day replaced the body there with one written before STORE-OFF (it keeps the archived filter and
-- drops the store-off branch). Main carries both. So the BRANCH is behind main, not S6's file.
--
-- WHAT. The body below is main's, byte-for-byte as `pg_get_functiondef` answered it on main
-- (sha256 1c6fdf18…); it restores STORE-OFF's check on the branch and changes nothing else. After
-- it, S6's up applies to the branch with the same `-- based-on:` line production will judge.
-- Rebasing S6 on the branch's older body instead would make production refuse the file — or, with
-- the line forged, throw STORE-OFF's change away on main.
--
-- Branch only: this directory is swept by no release path, and `--target production` refuses it by
-- location. No grant, no signature change.

CREATE OR REPLACE FUNCTION custom.portal_public(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_p custom.portal;
  v_o text;
begin
  -- THE SIGN-IN PAGE, AND NOTHING ELSE. A slug that does not exist, one that is closed, one
  -- that is ARCHIVED, and one whose organization has not opened the external lane all answer
  -- the same NULL, which is the 404: the address cannot be used to learn that anything is
  -- there.
  select * into v_p from custom.portal
   where slug = lower(btrim(coalesce(p_slug, ''))) and is_active and archived_at is null;
  if not found then return null; end if;
  if not coalesce((platform.knob_resolve('custom', 'external_principal_enabled', v_p.organization_id) #>> '{}')::boolean, false) then
    return null;
  end if;
  select o.name into v_o from iam.organizations o where o.id = v_p.organization_id;

  if not custom.store_is_open(v_p.organization_id) then
    return jsonb_build_object(
      'portal_id', v_p.id, 'slug', v_p.slug, 'title', v_p.title, 'organization', v_o,
      'sign_in_method', v_p.sign_in_method, 'state', 'unavailable',
      'message', custom.store_off_sentence(v_p.organization_id));
  end if;

  return jsonb_build_object(
    'portal_id', v_p.id, 'slug', v_p.slug, 'title', v_p.title, 'organization', v_o,
    'sign_in_method', v_p.sign_in_method, 'state', 'open');
end $function$

;
