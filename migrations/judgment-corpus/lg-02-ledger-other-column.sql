-- expect: branch=accept production=accept self_ledger=yes
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- THE NEAR MISS: the same statement shape for a column NOT on the closed list. It is additive,
-- so the judge accepts it — and the SHAPE layer still refuses it, because self_ledger reads YES.
alter table public._schema_migrations add column if not exists applied_by_anyone text;
