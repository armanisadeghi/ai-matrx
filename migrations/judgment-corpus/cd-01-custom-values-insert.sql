-- expect: branch=accept production=accept
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- THE CUSTOM-DATA INSERT, the shape this rule exists for. Schema `custom` is created by
-- this campaign, revoked from PUBLIC/anon/authenticated/service_role, absent from
-- pgrst.db_schemas and held shut by custom/system_enabled, so this row is unreachable by
-- every client and the file's stored inverse removes it. The store lane's kernel Table
-- rows are its only positive production proof.
--
insert into custom.record (id, table_id, data)
  values ('00000000-0000-0000-0000-000000000001'::uuid,
          '00000000-0000-0000-0000-000000000002'::uuid,
          '{"__kind":"corpus_fixture"}'::jsonb);
