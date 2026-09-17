-- chair-step: dropping schema custom and the crm.party retrofit column is the store lane's teardown, never an additive change; it runs from the same bytes on the branch as rule 27's inverse and reaches production only at a terminal, with the campaign stopped
--
-- THE INVERSE of `migrations/campaign/w1_store_custom_record_store.sql` (§4.13: every
-- migration carries its own down-migration in the same commit).
--
-- HEADER-LESS ON PURPOSE — see `w1_store_kernel_tables_down.sql` for the reasoning. A
-- `DROP` is refused by the allow-list in every lane; the one route is a header-less chair
-- step, rehearsed on the branch with `--target branch` and confirmed at a terminal
-- anywhere else.
--
-- 🚨 IT REFUSES WHILE ANOTHER LANE'S OBJECTS ARE IN THE SCHEMA. `LOCK:custom` is handed
-- down a fourteen-hold chain — `W1-TABLE`, `W1-INDEX`, `W1-FIELD` and nine more all build
-- in schema `custom`. `DROP SCHEMA custom CASCADE` run after any of them has landed would
-- take their work with it and leave the ledger claiming it is still there. So this file
-- raises, and names what it found, unless `custom` holds exactly what this lane created:
-- `custom.record`, its sixteen partitions and `custom.record_write`.
--
-- §6.10 is why the DROP is safe when it IS this lane's alone: nothing outside the campaign
-- ever wrote a row into schema `custom`.
--
-- It does NOT delete this file's ledger row: a migration may never write
-- `public._schema_migrations` itself, and both runners refuse a file that tries. Rule 27's
-- loop re-applies the up with `--reapply`.

set lock_timeout = '5s';
set statement_timeout = '120s';

do $$
declare
  v_strays text;
  v_rows   bigint;
begin
  if to_regnamespace('custom') is null then
    raise notice 'schema custom is already absent — nothing to undo.';
  else
    select string_agg(format('%s.%s', n.nspname, c.relname), ', ' order by c.relname)
      into v_strays
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'custom'
       and c.relkind in ('r','p','v','m','f')
       and c.relname <> 'record'
       and c.relname !~ '^record_p[0-9]{2}$';
    if v_strays is not null then
      raise exception
        'REFUSING to drop schema custom: it holds relation(s) this lane did not create — %. '
        'LOCK:custom is handed down a fourteen-hold chain and those objects belong to a later '
        'lane. Undo that lane first, or drop its objects by name.', v_strays;
    end if;

    if to_regclass('custom.record') is not null then
      execute 'select count(*) from custom.record' into v_rows;
      if v_rows > 0 then
        raise notice 'custom.record holds % row(s); they go with the schema.', v_rows;
      end if;
    end if;

    drop schema custom cascade;
    raise notice 'W1-STORE inverse: schema custom dropped.';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'crm' and table_name = 'party' and column_name = 'custom_fields'
  ) then
    alter table crm.party drop column custom_fields;
    raise notice 'W1-STORE inverse: crm.party.custom_fields dropped.';
  else
    raise notice 'crm.party.custom_fields is already absent — nothing to undo.';
  end if;
end
$$;
