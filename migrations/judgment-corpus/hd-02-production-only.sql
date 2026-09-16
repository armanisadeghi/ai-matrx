-- expect: branch=refuse:header-flag-disagree production=accept
-- target: production
-- additive: yes
-- guard: custom/system_enabled
--
-- `-- target: production` alone is still the campaign contract: additive, guarded, allow-listed.
--
create table if not exists custom.zz_prod_only (id bigint primary key);
