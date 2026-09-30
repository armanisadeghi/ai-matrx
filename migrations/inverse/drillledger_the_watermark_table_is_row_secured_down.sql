-- chair-step: the inverse of migrations/campaign/drillledger_the_watermark_table_is_row_secured.sql (lane DRILL-LEDGER-RECORDS) — drops the one-row derived table runtime._ai_usage_hourly_watermark (how far the usage rollup counted; the next rebuild that reaches now would write it again) and its registry row. Run it AFTER the inverse of drillledger_the_records_behind_a_usage_number_are_the_ledger.sql (whose refresh writes this table). No row of anybody's data is touched.
-- lane: DRILL-LEDGER-RECORDS
-- lock: platform

delete from platform.entity_types where token = 'ai_usage_hourly_watermark';
drop table if exists runtime._ai_usage_hourly_watermark;
