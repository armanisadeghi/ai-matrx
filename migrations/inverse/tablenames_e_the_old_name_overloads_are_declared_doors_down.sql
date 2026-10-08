-- inverse of tablenames_e_the_old_name_overloads_are_declared_doors.sql
-- WHAT IT DOES NOT UNDO: nothing; it removes only the rows that file declared.
delete from platform.client_callable_door where declared_by = 'tablenames_e_the_old_name_overloads_are_declared_doors.sql';
