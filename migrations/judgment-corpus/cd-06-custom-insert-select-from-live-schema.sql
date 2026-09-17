-- expect: branch=refuse:not-additive production=refuse:not-additive
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- INSERT … SELECT out of a LIVE schema. It is structurally additive and it COPIES
-- CUSTOMER DATA into the table whose whole safety argument is that it holds nothing yet.
--
insert into custom.record (id, table_id, data)
  select gen_random_uuid(), '00000000-0000-0000-0000-000000000002'::uuid, to_jsonb(p)
    from crm.party p;
