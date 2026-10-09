-- lane: KERNEL-SHADOW
-- =============================================================================
-- KERNEL-SHADOW stage 1 switch — the store's set doors answer from the set form of the access kernel.
--
-- Proven on live immediately before (read-only, repeatable-read transactions, the same snapshot
-- answered both ways): data_home and data_home_tables for admin@admin.com, test@test.com,
-- info@aimatrx.com, tomas.iversen@fixtures, dd048-joiner, and read_records_page, drill_rows and
-- record_aggregate on 10 Tables per seat: 0 of 113 answers differ. Stage 0 the same evening:
-- 0 of 208,092 (person, Table, level) and 0 of 44,540 mixed-record answers differ.
--
-- 🚨 ONE-STATEMENT REVERT:
--   update platform.feature_knob set value = '{"on": false, "off_for": []}'::jsonb
--    where feature = 'access' and key = 'kernel_set_form';
-- =============================================================================
update platform.feature_knob
   set value = '{"on": true, "off_for": []}'::jsonb, updated_at = now()
 where feature = 'access' and key = 'kernel_set_form';
