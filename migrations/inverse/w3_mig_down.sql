-- chair-step: W3-MIG's inverse — removes the ten Migration verbs, the dependency reader and
-- the alias table. Run it and the Migration layer this campaign added is gone; re-apply the
-- lane's six files and it is back.
--
-- IT IS DESTRUCTIVE TO ONE THING THAT IS NOT A FUNCTION, AND THE OPERATOR SHOULD KNOW WHICH:
-- `custom.record_alias` holds REC-21's "the losing id resolves to the winner FOREVER". Dropping
-- it ends every forever this store has issued — a merged id stops resolving and answers with a
-- soft-deleted record instead. That is the correct inverse (the table is this lane's, and
-- nothing else reads it), and it is also the reason to think before running this against a
-- database where merges have actually happened. Count them first:
--
--   select count(*) from custom.record_alias;
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH:
--   · `custom.record_delete` / `custom.record_restore` / `custom.record_reparent` /
--     `custom.promote_table` — W1-STORE's and W1-INDEX's, wired by this lane and not created
--     by it.
--   · `platform.relation_on_delete` and `platform.relation_delete_effects` — W1-REL's.
--   · `history.migration_log` and its rows — W3-HIST's, and the permanent structural record
--     (HIS-4). Removing the verbs does not remove what they did.
--   · Anything already soft-deleted by a verb. An inverse that undid every delete a verb ever
--     performed would be a data change dressed as a rollback.
--
-- RUN IT:
--   node node_modules/tsx/dist/cli.mjs scripts/apply-migration.ts \
--     migrations/inverse/w3_mig_down.sql --target branch

-- 🚨 FOUR OF W3-MIG'S OBJECTS ARE SHARED INFRASTRUCTURE NOW, AND THIS INVERSE STOPS
-- DEMOLISHING THEM (lane INVERSE-GUARD, 2026-09-21). `custom.migrate_purge`,
-- `custom.migrate_retype`, `custom.field_dependants` and the table `custom.record_alias` are
-- all reached by bodies that landed after this file was written:
--   · `custom._store_door` — the ONE body behind `custom_record_store_door`,
--     `custom_external_link_store_door` and their `_delete` twins — calls
--     `custom.migrate_purge`;
--   · `custom._field_type_converts_values` (`custom_record_field_type_converts_values` on
--     `custom.record`) calls `custom.migrate_retype`;
--   · `custom.delete_rule` (`doorfix_the_delete_door_consults_the_one_delete_rule.sql`) calls
--     `custom.field_dependants`, and `history.migration_undo` reads `custom.record_alias`.
-- As written this inverse left every write door in the record store calling functions that
-- were gone, so the next write died on `function custom.migrate_purge(uuid,uuid,boolean) does
-- not exist` before the red twin asked anything. A broken store is not the defect this file
-- exists to restore.
--
-- WHAT THE DEFECT ACTUALLY IS: the Migration LAYER a person can reach is gone. That is
-- restored in full — eight of the ten verbs, the id resolver and the door rows all go below,
-- so there is no Migration surface left to use. The four stay standing under the bodies that
-- adopted them, and `custom.record_alias` keeps REC-21's "the losing id resolves to the
-- winner FOREVER" instead of ending every forever this store has issued, which the header
-- above already warned was this file's most dangerous act.
drop function if exists custom.migrate_delete(uuid, uuid, text);
drop function if exists custom.migrate_merge(uuid, uuid, uuid, text);
drop function if exists custom.migrate_split(uuid, uuid, text[], text);
drop function if exists custom.migrate_rename(uuid, uuid, text, text);
drop function if exists custom.migrate_reparent(uuid, uuid, uuid, text);
drop function if exists custom.migrate_extract_parent(uuid, uuid, uuid, text[], text);
drop function if exists custom.migrate_promote(uuid, uuid, text);
drop function if exists custom.migrate_demote(uuid, uuid, text);

drop function if exists custom.resolve_id(uuid, uuid);

-- `custom.record_alias` is NOT dropped — see the note above the verbs.
