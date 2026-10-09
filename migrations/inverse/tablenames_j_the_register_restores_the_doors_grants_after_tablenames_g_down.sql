-- inverse of tablenames_j_the_register_restores_the_doors_grants_after_tablenames_g.sql
-- WHAT IT DOES NOT UNDO: nothing; restoring a declared door's grants is idempotent and is the state before tablenames_g.
select 1;
