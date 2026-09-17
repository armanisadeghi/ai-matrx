-- expect: branch=refuse:not-additive production=refuse:not-additive
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- UPDATE on custom.* is NOT on the allow-list and the custom-data INSERT did not widen it.
--
update custom.record set data = '{"__kind":"corpus_fixture"}'::jsonb
  where id = '00000000-0000-0000-0000-000000000001'::uuid;
