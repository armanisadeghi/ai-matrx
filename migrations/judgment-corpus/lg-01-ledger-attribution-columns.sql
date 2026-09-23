-- expect: branch=accept production=accept
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- THE RUNNER'S OWN LEDGER SHAPE (lane LEDGER-LANE, 2026-09-23). Both runners refuse a file that
-- writes public._schema_migrations; the one closed door is ADD COLUMN IF NOT EXISTS of the seven
-- attribution columns at their own types, one per statement. So self_ledger reads NO here.
alter table public._schema_migrations add column if not exists applied_by_lane text;
alter table public._schema_migrations add column if not exists applied_in_window boolean;
comment on column public._schema_migrations.applied_by_lane is 'a corpus fixture';
