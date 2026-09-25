-- The inverse of `w1_reg_the_classification_lands_on_main.sql`: it deletes exactly the rows
-- that file inserted (each stamped with its own note) and takes every registry row's type axis
-- back to null. The three CHECK constraints are left standing - they are NOT VALID and admit a
-- null type on every row, so they constrain nothing once the axis is empty, and dropping them
-- would be the one irreversible act in an inverse.

set lock_timeout = '2s';
set statement_timeout = '600s';

delete from platform.entity_types
 where notes like 'W1-REG/LAND: registered by the classification census on the MAIN database (CUT-14 / REC-32). %';

update platform.entity_types
   set type = null, type_reason = null, custom_fields_enabled = false
 where type is not null or type_reason is not null or custom_fields_enabled;
