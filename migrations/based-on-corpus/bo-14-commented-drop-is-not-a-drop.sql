-- expect-scan: none
-- expect-live: accept
-- setup: select 1
--
-- A DROP inside a comment executes nothing; the CREATE makes a new function.
/* drop function zz_bo_14.new_helper(text); */
create function zz_bo_14.new_helper(p_in text) returns text language sql immutable as $f$ select p_in $f$;
