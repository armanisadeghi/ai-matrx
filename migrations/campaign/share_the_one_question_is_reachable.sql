-- chair-step: one GRANT, which the additive allow-list refuses by name and correctly so. `public.may_manage_sharing` is declared in platform.client_callable_door as a signed-in door, but the DDL guard that fires on CREATE takes PUBLIC's default EXECUTE back from every new SECURITY DEFINER function BEFORE the door row exists a few statements later — so the door was declared and shut. This re-issues exactly what that row declares, for `authenticated` only. The two server_only adapters beside it stay closed, which is the same guard working.
--
-- SHARE — THE ONE QUESTION IS REACHABLE.
--
-- The share dialog has to know, BEFORE it draws anything, whether this person may decide who
-- else sees this thing: a dialog that renders a people picker, a level picker and a revoke
-- button and then refuses every one of them is the dead control this platform refuses. So
-- `public.may_manage_sharing` is a client door, declared as one, and this is its grant.

grant execute on function public.may_manage_sharing(text, uuid) to authenticated;
