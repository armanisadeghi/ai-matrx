-- chair-step: the inverse of W1-REL file 3 - it DROPS the relation-contract trigger from
-- `platform.associations` and the function behind it. Dropping a trigger off a live 34,216-row
-- table is never an unattended production step (rule 9), so this file is header-less on purpose
-- (§4.9): a file naming production in a `-- target:` header PLUS `-- chair-step:` is refused by
-- both runners as `chair-step-names-production`, and these same bytes rehearse on the branch
-- with `--target branch`, which is how rule 27's "the inverse was RUN on the branch" is met.
--
-- THE ORDER IS THE CHECK: the trigger goes first, because the function cannot be dropped while
-- a trigger is still bound to it, and nothing here says CASCADE.
--
-- WHAT IT RESTORES, EXACTLY: `platform.associations` carries the fourteen triggers it carried
-- before this lane and not one more. It removes NO trigger this lane did not create; every one
-- of the platform's own - `trg_associations_auto_orient`, `trg_associations_enforce_known`,
-- `trg_associations_reachability`, `trg_validate_edge_payload` and the rest - is untouched by
-- name, because reverting a lane never takes a peer's guard with it.

set lock_timeout = '5s';
set statement_timeout = '300s';

drop trigger if exists trg_associations_zzz_relation_contract on platform.associations;
drop function if exists platform.enforce_relation_edge();
