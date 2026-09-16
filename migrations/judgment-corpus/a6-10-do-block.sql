-- expect: branch=refuse:not-additive production=refuse:not-additive
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- A DO block builds DDL at run time, so the allow-list cannot read what it will execute.
--
do $$ begin execute 'create or replace function custom.zz_fn() returns void language sql as $f$ select 1 $f$'; end $$;
