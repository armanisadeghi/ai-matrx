-- chair-step: the inverse of migrations/campaign/drillledger_the_rollup_is_refilled_from_the_records.sql (lane DRILL-LEDGER-RECORDS) — forgets how far the rollup counted (empties runtime._ai_usage_hourly_watermark, one derived row), so the next rebuild that reaches now starts it again. The rebuilt rollup rows stay: they are the ledger's exact aggregate by the same rules the previous body used (0 groups differ over 35 days, proven on the clone).
-- lane: DRILL-LEDGER-RECORDS
-- lock: platform

delete from runtime._ai_usage_hourly_watermark;
