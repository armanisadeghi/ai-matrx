-- expect: branch=refuse:header-guard-malformed production=refuse:header-guard-malformed
-- target: branch,production
-- additive: yes
-- guard: custom
--
-- platform.feature_knob's primary key is TWO columns, so the guard is `<feature>/<key>`.
--
create table if not exists custom.zz_x (id bigint primary key);
