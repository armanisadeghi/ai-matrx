-- expect-scan: function zz_bo_09.fresh_helper
-- expect-live: accept
-- setup: select 1
--
-- DROP IF EXISTS of a function that does not exist live, then CREATE: nothing is destroyed.
drop function if exists zz_bo_09.fresh_helper(text);
create function zz_bo_09.fresh_helper(p_in text) returns text language sql immutable as $f$ select p_in $f$;
