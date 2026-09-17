-- expect: branch=accept production=accept
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- A SELECT source is admitted only while it reads inside schema `custom` — here it does,
-- so no customer data can reach the row.
--
insert into custom.record (id, table_id, data)
  select gen_random_uuid(), t.id, '{"__kind":"corpus_fixture"}'::jsonb
    from custom.table_def t;
