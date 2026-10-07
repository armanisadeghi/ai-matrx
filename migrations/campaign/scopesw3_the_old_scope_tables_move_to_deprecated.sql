-- draft: held 2026-10-07 03:25 PT by the chair — soak passed and the 4 label-only bodies are allowlisted, but view custom.context_scope_types still reads context.scope_types for slug (76 of 154 store slugs differ from the old ones); resolve that, then remove this line.
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
     and p.prosrc ~ 'context\.(scopes|scope_types|context_items|context_item_values|context_value_refs|scope_dataset_instances)\M'
     -- PROVENANCE ALLOWLIST (FTS-1g, 2026-10-05): these bodies name an old table only as the string label
     -- metadata.moved_from.table carried by 10,602 Records (history: where a Record came from), never as a relation;
     -- the move leaves the label true. Each is named; a new body is never let through by a pattern.
     and n2.nspname || '.' || p.proname not in (
       'custom._ctx_store_type',   -- stamps/reads metadata.moved_from.table on a type's Records (history label, a string)
       'custom._ctx_store_scope',   -- stamps the scope-column Fields' moved_from label and finds them by it
       'custom._ctx_store_item',   -- stamps a context field's moved_from label and finds the type's fields by it
       'custom._ctx_store_value',   -- names the old value store in a value's source stamp (history label)
       'custom._ctx_scope_columns',   -- stamps the scope-column Fields' moved_from label
       'custom._ctx_scope_settings',   -- finds a type's settings Fields by their moved_from label
       'custom._ctx_type_subtree_follows',   -- finds a type's context fields by their moved_from label
       'custom.scope_rows_of',   -- finds the scope-column Fields by their moved_from label
       'custom.scope_items_of',   -- leaves out the scope-column Fields by their moved_from label
       'custom.context_item_write',   -- finds a context field Record by its moved_from label
       'custom.context_item_archive',   -- finds a context field Record by its moved_from label
       'custom.context_item_restore',   -- finds a context field Record by its moved_from label
       'custom.context_type_restore',   -- finds the type's context fields by their moved_from label
       'platform.entity_row_access_attrs',   -- finds a context field Record by its moved_from label; two comments name the old type table
       -- Added 2026-10-07 (chair, checked live: comment or moved_from string label only, no relation read):
       'private.association_container_organization_id',   -- a comment names context.scopes
       'public._trash_store_children',   -- compares metadata.moved_from.table to the string 'context.context_items'
       'platform.assert_context_reference',   -- a comment names the three old tables
       'platform.lifecycle_user_keep'   -- compares metadata.moved_from.table to the string 'context.context_items'
     );
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
