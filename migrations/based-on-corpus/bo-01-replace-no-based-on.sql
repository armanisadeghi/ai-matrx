-- expect-scan: function zz_bo_01.probe
-- expect-live: refuse
-- setup: create function zz_bo_01.probe(p_in text) returns text language sql immutable as $f$ select 'live:' || p_in $f$
--
-- DD-220/224, the original class: a CREATE OR REPLACE of a live body that declares nothing.
create or replace function zz_bo_01.probe(p_in text) returns text language sql immutable as $f$ select 'mine:' || p_in $f$;
