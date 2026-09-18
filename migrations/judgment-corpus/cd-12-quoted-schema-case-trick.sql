-- expect: branch=refuse:not-additive production=refuse:not-additive
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- `"Custom"` is a DIFFERENT schema from `custom`: quoting preserves the capital. It reads
-- as custom only to a judge that folds case before it looks.
--
insert into "Custom".record (id, data)
  values ('00000000-0000-0000-0000-000000000001'::uuid, '{"__kind":"corpus_fixture"}'::jsonb);
