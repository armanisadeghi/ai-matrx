-- expect: branch=refuse:not-additive production=refuse:not-additive self_ledger=yes
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- The closed door never launders a ROW write that rides beside it: the ADD COLUMN is stripped,
-- the UPDATE is not, so self_ledger reads YES.
alter table public._schema_migrations add column if not exists applied_by_lane text;
update public._schema_migrations set applied_by_lane = 'someone' where filename = 'x.sql';
