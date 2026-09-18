-- chair-step: the inverse of W1-REL file 4 - it DROPS the three version triggers this lane
-- attached to `platform.associations` and the one history reader it created. Dropping triggers
-- off a live 34,216-row table is never an unattended production step (rule 9), so this file is
-- header-less on purpose (§4.9): a file naming production in a `-- target:` header PLUS
-- `-- chair-step:` is refused by both runners as `chair-step-names-production`, and these same
-- bytes rehearse on the branch with `--target branch`.
--
-- WHAT IT DOES NOT TOUCH, BY NAME: `platform._touch_row()` and `platform._version_capture()`.
-- They are the platform's own live functions, used by the 241 tables that already version, and
-- this lane never created them - it bound them. Reversing a binding never drops the thing bound.
--
-- IT ALSO LEAVES `history.row_versions` ALONE. Any relation history written while the guard was
-- on is a record of something that really happened, and an inverse that erased it would be
-- deleting history to make a rollback look tidy. The rows stay; the writers go.

set lock_timeout = '5s';
set statement_timeout = '300s';

drop trigger if exists trg_associations_zzz_version_capture_delete on platform.associations;
drop trigger if exists trg_associations_zzz_version_capture on platform.associations;
drop trigger if exists trg_associations_zzz_touch_row on platform.associations;

drop function if exists platform.relation_history(uuid, uuid);

comment on trigger trg_associations_reachability on platform.associations is null;
