-- expect: branch=refuse:not-additive production=refuse:not-additive
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- DD-220: CREATE OR REPLACE FUNCTION is a whole-body write with no concurrency check, so a
-- replacement must declare the body it was written against.
--
create or replace function custom.zz_fn() returns void language sql as $f$ select 1 $f$;
