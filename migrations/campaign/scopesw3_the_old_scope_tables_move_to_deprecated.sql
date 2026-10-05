-- draft: soak ends 2026-10-07T04:32Z — scopesw2_the_old_scope_tables_take_no_client_reads.sql was applied to production 2026-10-05T04:31:43Z; apply only after the soak, with 0 bodies naming the six (FTS-1b) and 0 permission-denied errors on them.
-- chair-step: wave 3 of SCOPES-ON-THE-STORE. It MOVES the six old scope tables — context.scopes, scope_types, context_items, context_item_values, context_value_refs, scope_dataset_instances — into the `deprecated` schema with ALTER TABLE … SET SCHEMA (no row is touched; indexes, constraints, triggers, owned sequences and the 13 outside foreign keys move with them by OID). The reference tables stay in `context`. THIS FILE REFUSES ITSELF while any function body outside `deprecated` still names one of the six by its old name (a plpgsql body resolves the name at run time and would fail after the move): on 2026-10-05 that census lists 86 bodies (the lane-9 doors' image write and follow, the old RPCs, the instruments and the class-C readers), so wave 2's remaining moves and the image-write removal must land first. Reversible: the inverse moves the six back.
-- lane: FINISH-THE-SWITCH (FTS-1, wave 3 prep of SCOPES-ON-THE-STORE)
-- lock: custom
--
-- Inverse: migrations/inverse/scopesw3_the_old_scope_tables_move_to_deprecated_down.sql.
--
-- THE USE CASE. Cedar Ridge Physical Therapy's scopes live only in the record store; the old copies are parked where
-- nothing can find them by their old names, and a single statement brings them back if anything was missed.

do $pre$
declare v text; n int;
begin
  select count(*), string_agg(n2.nspname || '.' || p.proname, ', ' order by 1) into n, v
    from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
   where n2.nspname not in ('pg_catalog', 'information_schema', 'deprecated')
     and p.prosrc ~ 'context\.(scopes|scope_types|context_items|context_item_values|context_value_refs|scope_dataset_instances)\M';
  if n > 0 then
    raise exception 'scopesw3: % function bodies still name an old scope table by its old name; move them first: %', n, left(v, 3000);
  end if;
  if exists (select 1 from pg_views where definition ~ 'context\.(scopes|scope_types|context_items|context_item_values|context_value_refs|scope_dataset_instances)\M') then
    raise exception 'scopesw3: a view still reads an old scope table';
  end if;
end $pre$;

alter table context.scopes set schema deprecated;
alter table context.scope_types set schema deprecated;
alter table context.context_items set schema deprecated;
alter table context.context_item_values set schema deprecated;
alter table context.context_value_refs set schema deprecated;
alter table context.scope_dataset_instances set schema deprecated;
