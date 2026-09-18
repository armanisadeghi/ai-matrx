-- chair-step: removing the eight kernel Table rows is a DELETE, which is never additive; it runs from the same bytes on the branch as rule 27's inverse and reaches production only at a terminal, with the campaign stopped
--
-- THE INVERSE of `migrations/campaign/w1_store_kernel_tables.sql` (§4.13: every migration
-- carries its own down-migration in the same commit).
--
-- HEADER-LESS ON PURPOSE. `-- chair-step:` waives nothing in the allow-list, and a file
-- carrying BOTH a `-- target:` header naming production and a chair-step line is refused
-- by name (`chair-step-names-production`) in both runners. The one route for a
-- non-additive statement is a header-less chair step: it rehearses on the branch with
-- `--target branch` and reaches production only at a terminal, from these same bytes.
--
-- IT REMOVES ONLY THE EIGHT ROWS THIS LANE WROTE, BY ID. A blanket
-- `delete from custom.record where data_class = 'kernel'` would take `W1-FIELD`'s
-- `Merge Field` row with it the moment that lane lands, and the kernel count every later
-- exit proof reads would silently become 0 rather than 8.
--
-- It does NOT delete this file's ledger row: a migration may never write
-- `public._schema_migrations` itself, and both runners refuse a file that tries. Rule 27's
-- loop re-applies the up with `--reapply`, which re-executes bytes the ledger already
-- holds.

set lock_timeout = '5s';
set statement_timeout = '120s';

do $$
declare
  v_other bigint;
  v_gone  bigint;
begin
  if to_regclass('custom.record') is null then
    raise notice 'custom.record is already absent — nothing to undo.';
    return;
  end if;

  select count(*) into v_other
    from custom.record
   where data_class <> 'kernel';
  if v_other > 0 then
    raise notice 'custom.record holds % non-kernel row(s); they are left untouched.', v_other;
  end if;

  delete from custom.record
   where id in (
     '11111111-0000-4000-8000-000000000001'::uuid,
     '11111111-0000-4000-8000-000000000002'::uuid,
     '11111111-0000-4000-8000-000000000003'::uuid,
     '11111111-0000-4000-8000-000000000004'::uuid,
     '11111111-0000-4000-8000-000000000005'::uuid,
     '11111111-0000-4000-8000-000000000006'::uuid,
     '11111111-0000-4000-8000-000000000007'::uuid,
     '11111111-0000-4000-8000-000000000008'::uuid
   );
  get diagnostics v_gone = row_count;
  raise notice 'W1-STORE inverse: % kernel Table row(s) removed.', v_gone;
end
$$;
