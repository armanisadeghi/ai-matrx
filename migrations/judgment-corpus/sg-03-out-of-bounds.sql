-- expect: branch=refuse:seeds-guards-out-of-bounds production=refuse:seeds-guards-out-of-bounds
-- target: branch,production
-- additive: yes
-- seeds-guards: yes
--
-- …and it may touch the knob register and nothing else, because it is the one file that cannot
-- name a guard that already resolves.
--
create table if not exists custom.zz_smuggled (id bigint primary key);
