-- DEFAULT-ORG-3 inverse -- takes the signed-in EXECUTE back off the three-argument
-- public.creator_claim_handle.
--
-- Running this makes the creator dashboard's claim call return 42501 for every signed-in user
-- as soon as the client passes an acting organization. Only run it to undo a change that broke
-- something worse, and say what.

set local lock_timeout = '2s';

revoke execute on function public.creator_claim_handle(text, text, uuid) from authenticated;
