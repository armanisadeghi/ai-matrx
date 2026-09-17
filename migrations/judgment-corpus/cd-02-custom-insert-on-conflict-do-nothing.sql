-- expect: branch=accept production=accept
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- The idempotent form of the same shape: re-running the file writes nothing twice.
--
insert into custom.record (id, table_id, data)
  values ('00000000-0000-0000-0000-000000000001'::uuid,
          '00000000-0000-0000-0000-000000000002'::uuid,
          '{"__kind":"corpus_fixture"}'::jsonb)
  on conflict (id) do nothing;
