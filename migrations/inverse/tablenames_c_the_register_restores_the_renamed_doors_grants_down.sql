-- inverse of tablenames_c_the_register_restores_the_renamed_doors_grants.sql
-- WHAT IT DOES NOT UNDO: nothing; restoring a declared door's grants is idempotent and is the state before tablenames_a.
select 1;
