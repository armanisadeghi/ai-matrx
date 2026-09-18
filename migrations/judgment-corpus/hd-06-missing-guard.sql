-- expect: branch=refuse:production-no-guard production=refuse:production-no-guard
-- target: branch,production
-- additive: yes
--
-- …and names the knob that holds it OFF.
--
create table if not exists custom.zz_x (id bigint primary key);
