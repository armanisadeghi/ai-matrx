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
--
-- 🚨 THE ONE BODY OUTSIDE THIS LANE THAT ADOPTED THESE TWO CATCHES THEIR ABSENCE BY NAME
-- (lane INVERSE-GUARD, 2026-09-21). `custom.delete_rule` in
-- `migrations/campaign/doorfix_the_delete_door_consults_the_one_delete_rule.sql` calls
-- `platform.relation_on_delete` and `platform.relation_delete_effects` on the live delete
-- path — and it calls BOTH inside a single `begin … exception when undefined_function then`
-- block whose handler puts the role back and sets
-- `v_effects := jsonb_build_object('note', 'platform.relation_on_delete is not on this
-- database')`. That is this lane's absence, handled, announced in the door's own answer, and
-- written before either of these functions existed on every database that did not carry them.
-- So the drops below leave the delete door standing and saying what it lost, which is the
-- defect REL-2 / T7 exists to restore — a delete that no longer consults `on_delete` — rather
-- than a broken door. Nothing else in either repository calls either function.
-- ground-standing-ok: d

set lock_timeout = '2s';
set statement_timeout = '300s';

drop function if exists platform.relation_on_delete(uuid, uuid);
drop function if exists platform.relation_delete_effects(uuid, uuid);
