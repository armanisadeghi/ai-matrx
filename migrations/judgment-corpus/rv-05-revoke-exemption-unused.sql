-- expect: branch=refuse:revoke-exemption-unused production=refuse:revoke-exemption-unused
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- allows: revoke custom
--
-- An exemption nobody uses is an exemption nobody reviewed.
--
create table if not exists custom.zz_thing (id bigint primary key);
