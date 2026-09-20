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

drop function if exists custom.migrate_purge(uuid, uuid, boolean);
drop function if exists custom.migrate_delete(uuid, uuid, text);
drop function if exists custom.migrate_merge(uuid, uuid, uuid, text);
drop function if exists custom.migrate_split(uuid, uuid, text[], text);
drop function if exists custom.migrate_retype(uuid, uuid, text, text);
drop function if exists custom.migrate_rename(uuid, uuid, text, text);
drop function if exists custom.migrate_reparent(uuid, uuid, uuid, text);
drop function if exists custom.migrate_extract_parent(uuid, uuid, uuid, text[], text);
drop function if exists custom.migrate_promote(uuid, uuid, text);
drop function if exists custom.migrate_demote(uuid, uuid, text);

drop function if exists custom.field_dependants(uuid, uuid);
drop function if exists custom.resolve_id(uuid, uuid);

drop table if exists custom.record_alias;
