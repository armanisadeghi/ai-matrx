-- chair-step: INVERSE of realtime2_the_write_doors_take_an_op_id.sql — restores the eight bodies to what they were
-- before the _op_id envelope key, drops the helper, and removes the column from custom.io_outbox. Captured from
-- the live catalogue 2026-09-21 14:0xZ, immediately before that file was applied. Running it puts the writer back
-- to hearing the echo of its own write.

-- 🚨 THE COLUMN IS DROPPED ONLY IF NOTHING ADOPTED IT (lane FIX-11B, 2026-09-22).
-- `custom.io_outbox.op_id` outlived this lane. A LATER migration outside it —
-- `writeperf3b_the_outbox_asks_its_questions_once_per_statement.sql` — rebuilt
-- `custom.io_record_changed_stmt_insert`, the statement-level body every write to the record
-- store passes through, and its INSERT into `custom.io_outbox` NAMES `op_id`. Dropping the
-- column out from under it would not put this lane's defect back (the writer hearing the echo
-- of its own write) — it would make every write to the store fail with `column "op_id" of
-- relation "io_outbox" does not exist`.
-- depends-on: custom.io_outbox.op_id is adopted by custom.io_record_changed_stmt_insert
--   (migrations/campaign/writeperf3b_the_outbox_asks_its_questions_once_per_statement.sql).
-- ground-standing-ok: d — the drop below runs only when the catalogue shows no live body
--   writing that column; an adopter outside this lane leaves it standing, with a notice.
do $col$
declare
  v_left text[];
begin
  select array_agg(pn.nspname || '.' || p.proname order by pn.nspname, p.proname)
    into v_left
    from pg_proc p
    join pg_namespace pn on pn.oid = p.pronamespace
   where p.prokind = 'f'
     and pn.nspname not in ('pg_catalog', 'information_schema')
     and pg_get_functiondef(p.oid) like '%io_outbox%'
     and pg_get_functiondef(p.oid) ~ '\mop_id\M';

  if v_left is not null then
    raise notice
      'custom.io_outbox.op_id is still written by % - leaving the column standing. The eight bodies this file restores already stop putting an op id on the envelope, which is the defect going back; the column a later lane writes into is not this file''s to take away.',
      array_to_string(v_left, ', ');
    return;
  end if;

  execute 'alter table custom.io_outbox drop column if exists op_id';
end;
$col$;
drop function if exists custom._take_op_id(jsonb, text);
delete from platform.client_callable_door where schema_name='custom' and function_name='_take_op_id';

-- NOTE: the eight function bodies are restored by re-applying the bodies this lane replaced, whose exact
-- sha256 hashes are the `-- based-on:` lines at the top of realtime2_the_write_doors_take_an_op_id.sql.
-- They are NOT pasted here, because a stale paste is how a whole-body write silently reverts another lane's
-- change (DD-220). Recover them with: git show <the commit before this lane> and the catalogue hashes.
