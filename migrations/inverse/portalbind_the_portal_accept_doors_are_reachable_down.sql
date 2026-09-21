-- INVERSE of migrations/campaign/portalbind_the_portal_accept_doors_are_reachable.sql.
-- It puts the two doors back out of reach of a browser, which is where they stood between
-- the previous file's apply and this one.
revoke execute on function custom.portal_invite_accept(text) from authenticated;
revoke execute on function public.portal_share_peek(text) from anon, authenticated;
