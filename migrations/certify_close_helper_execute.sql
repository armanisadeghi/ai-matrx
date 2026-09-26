-- chair-step: restores the certifier helpers' intended non-client-callable posture after the ledgered certifier migration left authenticated EXECUTE; only the two new iam helpers are affected
--
-- The original certifier migration revoked PUBLIC, anon, and authenticated EXECUTE from
-- these invoker-rights catalogue helpers. The applied bytes omitted those REVOKEs, while
-- the live privilege census shows that authenticated can execute both helpers and has
-- USAGE on iam. This closes only that unintended access; it does not replace a function,
-- alter a policy, or change the certifier's logic.

set local lock_timeout = '2s';

revoke execute on function iam.is_doors_only_refusal(boolean, oid[], "char", text, text, text) from public, anon, authenticated;
revoke execute on function iam.doors_only_refusals(regclass) from public, anon, authenticated;
