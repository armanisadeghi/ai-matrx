-- Delete means archive (Arman, 2026-09-27). The registry is the ORM's source for
-- `_has_soft_delete` (and so for matrx-orm's live-only reads and aidream's
-- check_server_hard_delete guard). A table that carries deleted_at but is
-- registered has_soft_delete=false tells every generator the opposite of the
-- truth. Flip the flag wherever the column exists; the column is the fact.
update platform.entity_types e
   set has_soft_delete = true
 where e.is_active
   and e.has_soft_delete = false
   and e.schema_name <> 'graveyard'
   and exists (
     select 1 from information_schema.columns c
      where c.table_schema = e.schema_name
        and c.table_name = e.table_name
        and c.column_name = 'deleted_at'
   );
