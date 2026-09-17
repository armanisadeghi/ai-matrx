-- expect: branch=refuse:production-no-guard production=refuse:production-no-guard
-- target: branch,production
-- additive: yes
--
-- No `-- guard:` line at all. The custom-data INSERT's whole safety argument is the knob
-- that holds schema `custom` shut, so a file with no guard never reaches the allow-list.
--
insert into custom.record (id, table_id, data)
  values ('00000000-0000-0000-0000-000000000001'::uuid,
          '00000000-0000-0000-0000-000000000002'::uuid,
          '{"__kind":"corpus_fixture"}'::jsonb);
