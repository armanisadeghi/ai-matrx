-- expect: branch=refuse:header-allows-unknown production=refuse:header-allows-unknown
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: drop custom
--
-- `-- allows:` is deliberately not a general escape hatch.
--
create table if not exists custom.zz_thing (id bigint primary key);
