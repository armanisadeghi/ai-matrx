-- expect-scan: function zz_bo_02.probe
-- expect-live: accept
-- setup: create function zz_bo_02.probe(p_in text) returns text language sql immutable as $f$ select 'live:' || p_in $f$
-- based-on: zz_bo_02.probe(text) {{hash:function zz_bo_02.probe(text)}}
--
-- Positive control for bo-01: the same replace, declaring the body live right now.
create or replace function zz_bo_02.probe(p_in text) returns text language sql immutable as $f$ select 'mine:' || p_in $f$;
