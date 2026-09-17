-- expect: branch=refuse:not-additive production=refuse:not-additive
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- An upsert rewrites rows that are already there: an UPDATE wearing an INSERT's clothes.
--
insert into custom.record (id, table_id, data)
  values ('00000000-0000-0000-0000-000000000001'::uuid,
          '00000000-0000-0000-0000-000000000002'::uuid,
          '{"__kind":"corpus_fixture"}'::jsonb)
  on conflict (id) do update set data = excluded.data;
