-- expect: branch=accept production=accept
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.zz_fn() 0000000000000000000000000000000000000000000000000000000000000000
--
-- The positive control for the line above: the same statement WITH its `-- based-on:` line, and
-- a body that reads the knob the header names.
--
create or replace function custom.zz_fn() returns void language sql as
$f$ select case when platform.knob_resolve('custom', 'system_enabled', null)::boolean then 1 else 0 end $f$;
