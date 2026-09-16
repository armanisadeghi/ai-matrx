-- expect: branch=refuse:not-additive production=refuse:not-additive
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- A REVOKE with no exemption claimed.
--
revoke select on all tables in schema custom from authenticated;
