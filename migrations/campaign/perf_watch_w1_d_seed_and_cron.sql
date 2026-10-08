--
-- perf_watch_w1_d_seed_and_cron.sql
--
-- PERFORMANCE WATCH, WAVE 1 — THE EIGHT DOOR WATCHES AND THE TWO pg_cron JOBS.
-- The doors are the eight read/write doors of `pnpm perf:data` (scripts/perf-data/doors.mjs,
-- budgets from scripts/perf-data/budgets.json; template_install stays CLI-only). Their fixtures
-- are PINNED here, never discovered: resolved once on 2026-10-08 the way doors.mjs does — as
-- admin@admin.com, the Deliverables table in the data home (Holloway Creative), its first record,
-- its first view's sort, and the clients of its first 50 records.
-- Design: common-docs/systems/architecture/observability/performance-watch/PLAN.md §1, §2, Waves.
-- Inverse: migrations/inverse/perf_watch_w1_d_seed_and_cron_down.sql.
select ops.perf_watch_declare(v.slug, 'door', v.label, v.subject::jsonb, 300, 'p95', 900, 'PERF-WATCH', 'data')
  from (values
    ('door:custom.data_home', 'custom.data_home',
     '{"schema":"custom","function":"data_home","argtypes":"uuid, text, boolean",
       "args":{"p_include_app_tables":false}}'),
    ('door:custom.read_records_page:first_50', 'custom.read_records_page (first 50)',
     '{"schema":"custom","function":"read_records_page","argtypes":"uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer, text",
       "args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2","p_table_id":"7ea2340a-f0a8-4a4f-a8f6-29c8604d63cd","p_limit":50,"p_offset":0}}'),
    ('door:custom.read_records_page:sorted_search', 'custom.read_records_page (sorted+search)',
     '{"schema":"custom","function":"read_records_page","argtypes":"uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer, text",
       "args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2","p_table_id":"7ea2340a-f0a8-4a4f-a8f6-29c8604d63cd","p_limit":50,"p_offset":0,
               "p_search":"email","p_sort":[{"field":"due_on","direction":"asc"}]}}'),
    ('door:custom.views', 'custom.views',
     '{"schema":"custom","function":"views","argtypes":"uuid, uuid",
       "args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2","p_table_id":"7ea2340a-f0a8-4a4f-a8f6-29c8604d63cd"}}'),
    ('door:custom.relation_words_with_icons_many', 'custom.relation_words_with_icons_many',
     '{"schema":"custom","function":"relation_words_with_icons_many","argtypes":"uuid, uuid, uuid[]",
       "args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2","p_field_id":"7997bcca-e6e4-4058-9086-8dfaf7cd5dd9",
               "p_record_ids":["15a1b961-39ea-48c0-96fb-73f258b2f9aa","2ccbb0b3-9749-404b-b474-55590fa6e2ca","30cdfdd2-fb71-440c-a9a1-50d7f5c32cb1",
                               "40bf2abb-7157-46f9-9214-2a8fed089b84","48dd14f6-82f0-43a2-838f-2884912c511d","562d6c0a-291a-4be9-9245-085c54225238",
                               "7313488f-5116-4412-8161-5760ee1b8d51","9978e137-bf47-4dcf-82da-2354748ee973","a529020c-f88c-41c3-95b5-0879f41041b4",
                               "a8fe5e07-c206-488d-b065-9b37fb0e7378","aa07d85d-919a-4467-a31e-542a427ff8b3","b8c8495d-ba94-4111-ad09-e6da2fa77a62",
                               "ca85aeb0-9127-459b-b216-a75920e3c070","f62d0559-9c32-474b-8b18-1feed7c97313","f70ab38b-837e-4f2d-8557-4b454b33c1bf",
                               "f9a1fdd4-0f2b-4e58-ab8f-364965fc9524"]}}'),
    ('door:custom.record_aggregate', 'custom.record_aggregate',
     '{"schema":"custom","function":"record_aggregate","argtypes":"uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb, text, text",
       "args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2","p_table_id":"7ea2340a-f0a8-4a4f-a8f6-29c8604d63cd",
               "p_group_by":["kind"],"p_measures":[{"op":"sum","key":"price"}],"p_limit":200}}'),
    ('door:platform.drill_rows', 'platform.drill_rows',
     '{"schema":"platform","function":"drill_rows","argtypes":"uuid, jsonb, jsonb",
       "args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2","p_source":{"kind":"table","id":"7ea2340a-f0a8-4a4f-a8f6-29c8604d63cd"},"p_question":null}}'),
    -- The one-record write patches a field to the value it already holds (22), and every probe
    -- call is rolled back anyway: nothing survives (perf_watch_w1_tests.sql (b)).
    ('door:custom.record_update', 'custom.record_update (one record)',
     '{"schema":"custom","function":"record_update","argtypes":"uuid, uuid, jsonb, integer",
       "args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2","p_record_id":"01627457-8a65-42f5-8592-71cc626a77c9","p_patch":{"hours":22}}}')
  ) as v(slug, label, subject);

-- The door probe, every 15 minutes (perf.probe_cadence_minutes), as postgres.
select cron.schedule('perf-watch-probe', '*/15 * * * *',
  $cmd$SET statement_timeout='90s'; SET lock_timeout='1s'; SELECT ops.perf_probe_run();$cmd$);
-- Retention, daily at 10:17 UTC (03:17 Pacific, inside the 1–4 AM maintenance window).
select cron.schedule('perf-watch-sample-retention', '17 10 * * *',
  $cmd$SET statement_timeout='60s'; SET lock_timeout='1s'; SELECT ops.perf_sample_retention();$cmd$);
