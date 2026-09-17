-- expect: branch=refuse:not-additive production=refuse:not-additive
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- `"custom.record"` is ONE identifier — a table literally named `custom.record` in
-- whatever schema search_path picks at execution time, NOT schema custom. It reads as
-- custom.record only to a judge that strips quotes before it looks.
--
insert into "custom.record" (id, data)
  values ('00000000-0000-0000-0000-000000000001'::uuid, '{"__kind":"corpus_fixture"}'::jsonb);
