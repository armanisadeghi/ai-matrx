-- chair-step: the inverse of W1-REL file 6 - it DROPS the two on_delete functions this lane
-- created in schema `platform`. A DROP is never an unattended production step (rule 9), so this
-- file is header-less on purpose (§4.9): a file naming production in a `-- target:` header PLUS
-- `-- chair-step:` is refused by both runners as `chair-step-names-production`, and these same
-- bytes rehearse on the branch with `--target branch`.
--
-- THE ORDER IS THE CHECK: `relation_on_delete` calls `relation_delete_effects`, so it goes
-- first, and nothing here says CASCADE.
--
-- IT UNDOES NO DETACHMENT. An edge this lane soft-detached under `set_null` was detached
-- because a record really was deleted; restoring it would attach a relation to something that
-- is gone. Reversing the machinery is not reversing what the machinery correctly did.

set lock_timeout = '5s';
set statement_timeout = '300s';

drop function if exists platform.relation_on_delete(uuid, uuid);
drop function if exists platform.relation_delete_effects(uuid, uuid);
