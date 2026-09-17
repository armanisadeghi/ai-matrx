-- expect: branch=refuse:not-additive production=refuse:not-additive
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- DELETE on custom.* is NOT on the allow-list either — an inverse is a chair step.
--
delete from custom.record
  where id = '00000000-0000-0000-0000-000000000001'::uuid;
