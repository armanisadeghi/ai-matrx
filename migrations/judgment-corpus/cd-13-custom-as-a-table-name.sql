-- expect: branch=refuse:not-additive production=refuse:not-additive
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- `custom` as the TABLE name in another schema. The word appears; the rule is about the
-- SCHEMA, and platform.custom is a live table like any other.
--
insert into platform.custom (id, data)
  values ('00000000-0000-0000-0000-000000000001'::uuid, '{"__kind":"corpus_fixture"}'::jsonb);
