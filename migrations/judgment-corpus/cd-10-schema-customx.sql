-- expect: branch=refuse:not-additive production=refuse:not-additive
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- The schema must be EXACTLY `custom`. A prefix match would admit every schema whose name
-- starts with those six letters.
--
insert into customx.record (id, data)
  values ('00000000-0000-0000-0000-000000000001'::uuid, '{"__kind":"corpus_fixture"}'::jsonb);
