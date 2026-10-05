-- chair-step: it DROPS platform.cutover_store_writer_scope_parity(), an instrument of the scopes writer switch that compared the old context.* scope rows with the store. Census 2026-10-05 on production: no function body, trigger, view, policy or cron job names it; pg_stat_statements shows 0 calls; no code in aidream, matrx-frontend, matrx-local, matrx-extend or matrx-ship calls it; no door row. The inverse recreates its body, owner and EXECUTE grants exactly.
-- lane: FINISH-THE-SWITCH (FTS-1c, wave 2 last bodies of SCOPES-ON-THE-STORE)
-- lock: platform
--
-- Inverse: migrations/inverse/scopesw2c_the_scope_writer_parity_instrument_is_gone_down.sql.
--
-- THE USE CASE. Cedar Ridge Physical Therapy's scopes are written by the store alone; a parity meter against the
-- old tables measures nothing and would break when they move.

drop function platform.cutover_store_writer_scope_parity();
