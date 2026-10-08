-- lane: HOT-DOORS-4
--
-- HOT-DOORS-4 c (2026-10-08): switch access/kernel_batch on for everyone, after the same-snapshot proof on live
-- (read-only transactions, mx.kernel_batch off vs on): custom.read_records_page 171 page calls (admin@admin.com,
-- the 2-organization fixture member, test@test.com; the Confidential table, "only me" tables, published tables,
-- the 25,000-row table; plain, sorted, searched, offset pages), custom.levels_of on 2,484 ids and
-- platform.drill_rows on 39 sources: 0 differ.
-- Revert (one statement): update platform.feature_knob set value = '{"on": false, "off_for": []}' where feature = 'access' and key = 'kernel_batch';

update platform.feature_knob
   set value = '{"on": true, "off_for": []}'::jsonb,
       basis = 'HOT-DOORS-4, 2026-10-08: 0 of 171 page reads, 2,484 id levels and 39 drill reads differ old vs new on one snapshot; switched on.'
 where feature = 'access' and key = 'kernel_batch';
