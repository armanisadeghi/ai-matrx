-- chair-step: this REVOKES the EXECUTE grants lane PORTAL issued on its fourteen doors — eight from `authenticated` and four from `service_role`. After it, every portal screen and the sign-in route answer 42501 / HTTP 403 by name. No function, table, row or other grant is touched, and `anon` was never named in either direction.
-- lane: PORTAL (the outsider portal, PRODUCTS row 2)

revoke execute on function custom.portal_declare(uuid, text, uuid, jsonb, uuid, text, text) from authenticated;
revoke execute on function custom.portals(uuid) from authenticated;
revoke execute on function custom.portal_card(uuid, uuid) from authenticated;
revoke execute on function custom.portal_invite(uuid, uuid, uuid, text, uuid) from authenticated;
revoke execute on function custom.portal_principal_bind(uuid, uuid, uuid) from authenticated;
revoke execute on function custom.portal_revoke(uuid, uuid, uuid) from authenticated;
revoke execute on function custom.portal_me() from authenticated;
revoke execute on function custom.portal_preview(uuid, uuid, uuid, uuid) from authenticated;
revoke execute on function custom.portal_public(text) from service_role;
revoke execute on function custom.portal_invitation(text, text) from service_role;
revoke execute on function custom.portal_principal_bind(uuid, uuid, uuid) from service_role;
revoke execute on function custom.portal_invite(uuid, uuid, uuid, text, uuid) from service_role;
