-- expect: branch=refuse:production-not-declared-additive production=refuse:production-not-declared-additive
-- target: branch,production
-- guard: custom/system_enabled
--
-- A file that names production is accepted only when it STATES that it is additive.
--
create table if not exists custom.zz_x (id bigint primary key);
