-- expect: branch=accept production=accept self_ledger=yes
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- THE OTHER NEAR MISS: a closed-list column at the WRONG type is not the runner's shape.
alter table public._schema_migrations add column if not exists applied_in_window text;
