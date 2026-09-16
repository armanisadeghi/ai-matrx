-- expect: branch=refuse:not-additive production=refuse:not-additive
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- A DROP inside the campaign contract. Refused by the allow-list, not by a blacklist entry.
--
drop table custom.zz_thing;
