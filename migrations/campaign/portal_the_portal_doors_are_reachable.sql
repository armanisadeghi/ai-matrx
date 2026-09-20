-- chair-step: this GRANTs EXECUTE on the portal's fourteen doors — eight to `authenticated` (the owner's side of a portal, plus the outsider's own `custom.portal_me`) and four to `service_role` (the two a signed-out visitor's request reaches, and the two the sign-in route calls on their behalf). A GRANT is refused by the additive allow-list by name, so it comes through this route and a person reads exactly what is opened and to whom. No REVOKE, no DROP, no data movement, no existing grant changed, no table privilege anywhere, and `anon` gains nothing.
-- lane: PORTAL (the outsider portal, PRODUCTS row 2)
--
-- WHY `anon` IS NOT NAMED. Schema `custom` stays revoked from it, which is the posture
-- W4-ANON chose and the public form's own chair step recorded. The portal's sign-in page
-- is SERVER-RENDERED: the caller of `custom.portal_public` and `custom.portal_invitation`
-- is the app's server, holding the secret key, which never leaves that process. A browser
-- able to ask "was this address invited to this portal?" could test addresses against an
-- organization, which is why that door refuses every signed-in caller in its own body too.
--
-- WHY `authenticated` IS SAFE ON THE OTHER EIGHT. Every one of them decides access on the
-- ONE ladder before it does anything: `custom.assert_client_may_reach` for the
-- organization wall, then `custom.assert_client_may_change` at the `admin` rung of the
-- portal's client Table — the same rung `custom.share_grant` asks before it hands one
-- record to somebody else, because a portal hands records to people outside the
-- organization. `custom.portal_me` answers about the caller and nobody else.
-- `custom.portal_principal_bind` admits only the store owner, the person binding their
-- OWN identity, or an organization admin — checked in the body, not here.

-- ─────────────────────────────────────────────────── 10. the grants these doors need

grant execute on function custom.portal_declare(uuid, text, uuid, jsonb, uuid, text, text) to authenticated;
grant execute on function custom.portals(uuid) to authenticated;
grant execute on function custom.portal_card(uuid, uuid) to authenticated;
grant execute on function custom.portal_invite(uuid, uuid, uuid, text, uuid) to authenticated;
grant execute on function custom.portal_principal_bind(uuid, uuid, uuid) to authenticated;
grant execute on function custom.portal_revoke(uuid, uuid, uuid) to authenticated;
grant execute on function custom.portal_me() to authenticated;
grant execute on function custom.portal_preview(uuid, uuid, uuid, uuid) to authenticated;

-- THE SERVER LANE, and only the two doors a signed-out visitor's request reaches. `anon`
-- gains nothing: schema `custom` stays revoked from it, exactly as W4-ANON chose and as
-- the public form's own chair step recorded.
grant execute on function custom.portal_public(text) to service_role;
grant execute on function custom.portal_invitation(text, text) to service_role;
grant execute on function custom.portal_principal_bind(uuid, uuid, uuid) to service_role;
grant execute on function custom.portal_invite(uuid, uuid, uuid, text, uuid) to service_role;
