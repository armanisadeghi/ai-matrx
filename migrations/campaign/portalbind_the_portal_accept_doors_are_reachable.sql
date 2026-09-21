-- PORTAL-BIND — THE TWO NEW DOORS ARE REACHABLE FROM A BROWSER.
--
-- Additive: two GRANTs and nothing else. It is a separate file because the DDL guard
-- `definer_client_grant_revoked` fires ON the grant and requires the `platform.client_callable_door`
-- row to exist FIRST — and in `portalbind_a_portal_invitation_is_an_invitation.sql` the grants sat
-- a few lines above the INSERT that declares them, so both were revoked at birth exactly as that
-- guard is built to do. The rows landed in the same transaction; these grants now stand on them.
-- (Measured, not assumed: `has_function_privilege` read `f` for both immediately after that apply.)
--
-- This is the same shape as `portal_the_portal_doors_are_reachable.sql`, which lane PORTAL wrote
-- for the same reason.

set lock_timeout = '4s';

-- The invited client's own door. `authenticated` only: it needs a signed-in identity to match
-- the invitation's address against, and refuses by name when there is none.
grant execute on function custom.portal_invite_accept(text) to authenticated;

-- What the link OFFERS, to somebody who has no account yet — which is what an outside
-- invitation is for. Declared `anonymous_callers` with its purpose; an unknown token learns
-- nothing.
grant execute on function public.portal_share_peek(text) to anon, authenticated;
