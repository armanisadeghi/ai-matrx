-- expect: branch=refuse:not-additive production=refuse:not-additive
-- target: branch,production
-- additive: yes
-- guard: platform/associations_guard
--
-- A guard that is NOT a `custom/…` knob. The row's unreachability rests on the custom
-- schema's own switch; any other knob is a comment about a different thing.
--
insert into custom.record (id, table_id, data)
  values ('00000000-0000-0000-0000-000000000001'::uuid,
          '00000000-0000-0000-0000-000000000002'::uuid,
          '{"__kind":"corpus_fixture"}'::jsonb);
