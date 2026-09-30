-- chair-step: the inverse of migrations/campaign/drillusage_the_rollup_is_filled_from_the_ledger.sql (lane DRILL-USAGE-PAGE) — empties the derived usage rollup runtime._ai_usage_hourly (a summary rebuilt from the ledger at any time; no source row lives only there).
-- lane: DRILL-USAGE-PAGE
-- lock: platform

delete from runtime._ai_usage_hourly;
