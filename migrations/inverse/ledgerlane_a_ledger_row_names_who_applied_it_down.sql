-- chair-step: dropping the seven attribution columns from public._schema_migrations is a DROP,
--   which is not additive by any reading, so it is header-less on the allow-list in BOTH runners
--   and reaches the main database only at a terminal. It rehearses on the clone and the branch
--   with --target clone|branch.
-- lane: LEDGER-LANE
--
-- THE INVERSE of `migrations/campaign/ledgerlane_a_ledger_row_names_who_applied_it.sql`
-- (§4.13: every migration carries its own down-migration in the same commit).
--
-- It removes the attribution columns and every value written into them since the up ran — that is
-- the prior state, and it is exactly what "undo" means for this file. The runners keep working:
-- with the columns absent they write the ledger row without attribution and print one sentence
-- saying so. Nothing else on the ledger is touched.

alter table public._schema_migrations drop column if exists applied_in_window;
alter table public._schema_migrations drop column if exists applied_from_git_head;
alter table public._schema_migrations drop column if exists applied_by_process;
alter table public._schema_migrations drop column if exists applied_by_session;
alter table public._schema_migrations drop column if exists applied_by_host;
alter table public._schema_migrations drop column if exists applied_by_os_user;
alter table public._schema_migrations drop column if exists applied_by_lane;
