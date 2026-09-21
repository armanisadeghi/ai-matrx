-- chair-step: INVERSE of realtime2_the_write_doors_take_an_op_id.sql — restores the eight bodies to what they were
-- before the _op_id envelope key, drops the helper, and removes the column from custom.io_outbox. Captured from
-- the live catalogue 2026-09-21 14:0xZ, immediately before that file was applied. Running it puts the writer back
-- to hearing the echo of its own write.

alter table custom.io_outbox drop column if exists op_id;
drop function if exists custom._take_op_id(jsonb, text);
delete from platform.client_callable_door where schema_name='custom' and function_name='_take_op_id';

-- NOTE: the eight function bodies are restored by re-applying the bodies this lane replaced, whose exact
-- sha256 hashes are the `-- based-on:` lines at the top of realtime2_the_write_doors_take_an_op_id.sql.
-- They are NOT pasted here, because a stale paste is how a whole-body write silently reverts another lane's
-- change (DD-220). Recover them with: git show <the commit before this lane> and the catalogue hashes.
