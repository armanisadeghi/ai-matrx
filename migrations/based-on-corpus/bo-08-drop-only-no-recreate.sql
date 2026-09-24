-- expect-scan: none
-- expect-live: accept
-- setup: create function zz_bo_08.retired_helper(p_in text) returns text language sql immutable as $f$ select p_in $f$
--
-- A DROP this file does NOT recreate puts no older body back; the deny-list and chair-step rules
-- judge it, not this guard.
drop function if exists zz_bo_08.retired_helper(text);
