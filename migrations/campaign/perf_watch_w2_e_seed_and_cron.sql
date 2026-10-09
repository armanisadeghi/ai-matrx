--
-- perf_watch_w2_e_seed_and_cron.sql
--
-- PERFORMANCE WATCH, WAVE 2 — LARGE-DATA TWINS, STATEMENT WATCHES, TWO pg_cron JOBS.
-- Design: common-docs/systems/architecture/observability/performance-watch/PLAN.md §1, §2, Waves 2.
--
-- LARGE TWINS. Each row door gets `door:<fn>[:variant]@large`, the same door against a large
-- table PINNED here (config, never discovered). Chosen by a one-time query on 2026-10-08: no table
-- in "admin's Workspace" has 10k records (its largest, "Q3 Visit Ledger", has 5,000), so the twin
-- uses the largest realistic table the probe seat (admin@admin.com) reaches — "Time Entries"
-- (a312f617…, 25,000 records: dated hours per team member, client, project, task type) in
-- Holloway Creative, the same data home the small watches use. Fixtures: the first 50 records
-- read_records_page returns (relation field `client` f86a25b0…), search "retainer" sorted by
-- work_date, group by task_type summing hours, and record 00139b71… patched to the hours it
-- already holds (6.75; every probe call is rolled back anyway). Time Entries has no saved view,
-- so custom.views@large measures the access path of a 25k-record table's view list.
-- Budget basis: the small door's 300 ms p95 (scripts/perf-data/budgets.json — a read door answers
-- in under 300 ms at p95), unchanged: a person feels a large table exactly as much.
--
-- STATEMENT WATCHES. `stmt:<schema>.<fn>` for the seven door functions + template_install: the
-- mean of every real caller's call, from pg_stat_statements (budget_stat 'mean', hourly). Matched
-- by the PostgREST call text `"<schema>"."<fn>"(`, re-resolved every run. Budgets = the door
-- budgets (300 ms; template_install 5000 ms, budgets.json "first call").
--
-- CRON: perf-watch-statements hourly at :05; perf-watch-health hourly at :35 (between probes).
-- Inverse: migrations/inverse/perf_watch_w2_e_seed_and_cron_down.sql.
select ops.perf_watch_declare(v.slug, 'door', v.label, v.subject::jsonb, 300, 'p95', 900, 'PERF-WATCH', 'data')
  from (values
    ('door:custom.read_records_page:first_50@large', 'custom.read_records_page (first 50) (large table)',
     '{"schema":"custom","function":"read_records_page","argtypes":"uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer, text",
       "table_records":25000,"args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2","p_table_id":"a312f617-a388-41f4-b1ed-37a844827684","p_limit":50,"p_offset":0}}'),
    ('door:custom.read_records_page:sorted_search@large', 'custom.read_records_page (sorted+search) (large table)',
     '{"schema":"custom","function":"read_records_page","argtypes":"uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer, text",
       "table_records":25000,"args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2","p_table_id":"a312f617-a388-41f4-b1ed-37a844827684","p_limit":50,"p_offset":0,
               "p_search":"retainer","p_sort":[{"field":"work_date","direction":"asc"}]}}'),
    ('door:custom.views@large', 'custom.views (large table)',
     '{"schema":"custom","function":"views","argtypes":"uuid, uuid",
       "table_records":25000,"args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2","p_table_id":"a312f617-a388-41f4-b1ed-37a844827684"}}'),
    ('door:custom.relation_words_with_icons_many@large', 'custom.relation_words_with_icons_many (large table)',
     '{"schema":"custom","function":"relation_words_with_icons_many","argtypes":"uuid, uuid, uuid[]",
       "table_records":25000,"args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2","p_field_id":"f86a25b0-77b0-4d0a-90d8-4bc468328c30",
               "p_record_ids":["00139b71-8b7d-4540-a208-e98b2eed6cf6","001ddf2b-2abf-4f5c-ae4f-9039b805b0f0","0036b18e-6915-4b59-a4e5-98eaf500fb28","007d82e1-262c-46b7-8bc7-d19d8ab18ac7","00db767a-e7ba-4b64-bee3-1a470d99b39d",
                               "00f767f8-37e5-43c7-bc53-53f1b48b9547","01129ce5-7649-4f8d-9bd4-282b2ef5afd8","0151bf0f-e7d4-4016-a100-03eb3851b2bb","015763a5-59a6-479e-b0e3-33cfa8298e2a","01676a5f-c5f1-40f8-8819-0b57b27226d9",
                               "01741489-3211-43f4-b066-dbd4a01731c5","01aa3905-9318-4afd-bfff-b59e3f43e55c","01bb49f7-1ab1-4e43-af5c-d2ca9cba4740","01c8dcd9-46f1-4433-8963-d5875519f50f","01e82b77-80dc-4455-b91b-c48e62929238",
                               "023eb7f3-f128-47b2-8d5c-41a6ec839bec","02594c56-63a0-42f9-a2c5-26dd0fb60b7e","028d8dc2-739a-4398-a9ee-fcfb4eeba319","02ad7021-96ac-4ba3-9021-d9ac3fe21a13","02db0652-6d83-4508-a65a-210a74556804",
                               "0305c6e9-9e02-4f74-9001-7032c79161c2","0336fd9f-3a45-4aec-ad6d-5589b9537ee8","033ced76-0078-41c2-925a-4d4fd2dbc604","03771c16-2c2b-442c-ac02-fac4da4eaea7","038a121d-b89c-4e8d-a94c-082c0766d00c",
                               "03dce99e-79b5-4be3-bf60-7f0adfdb01de","03fe9a51-27ba-4b67-bced-1b21270c6b47","048bd112-9ada-4e08-afd5-91e45d8ca5c2","04fb90c4-d96f-47f5-b3e7-e2c1501877e1","051a9258-cc73-4ff0-88dc-bd33eda0a929",
                               "05404fad-0134-4ada-8802-a675eb339ba7","0575d1f3-4ceb-4ccd-94fc-0c24a72c3849","0583be7a-1e8d-4a2a-8f1d-16a662cf6603","05a3e122-6f67-4f21-b8ed-3cb770bdde0e","05b2cdd0-bcee-48cd-bc7b-84966b5efd79",
                               "05c0af6d-092e-41ae-9110-e0998bc66a65","05c3a28d-4e63-462e-88af-658902f3ea35","05ed40cf-689d-401a-9f8a-a76c544e19b3","05fbbb1c-6c8c-48bb-ad20-ed7a273bb15f","0609ae07-61c9-4dc8-bf48-cd24ce99fded",
                               "06589dc5-b62d-42a2-8c19-538dc2ecdf7e","0681e599-a359-43d6-b6a5-d5215b859a64","0691462d-fde9-4098-973a-c1d9748aebd8","06ac3f0c-f60f-432b-8f81-591a7a5d984f","06ccf664-33f6-43e6-bcd5-df82ea95a870",
                               "06d3181d-005e-4f62-9b6a-875dc2900609","06de0271-5cc7-4c97-8529-a736262862d1","06e7ab95-4044-47fe-b570-dbc9769b9c56","06f20b15-576e-4286-9db2-64d538dec994","070e627d-9f76-4b87-989e-99bed2008c9a"]}}'),
    ('door:custom.record_aggregate@large', 'custom.record_aggregate (large table)',
     '{"schema":"custom","function":"record_aggregate","argtypes":"uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb, text, text",
       "table_records":25000,"args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2","p_table_id":"a312f617-a388-41f4-b1ed-37a844827684",
               "p_group_by":["task_type"],"p_measures":[{"op":"sum","key":"hours"}],"p_limit":200}}'),
    ('door:platform.drill_rows@large', 'platform.drill_rows (large table)',
     '{"schema":"platform","function":"drill_rows","argtypes":"uuid, jsonb, jsonb",
       "table_records":25000,"args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2","p_source":{"kind":"table","id":"a312f617-a388-41f4-b1ed-37a844827684"},"p_question":null}}'),
    ('door:custom.record_update@large', 'custom.record_update (one record) (large table)',
     '{"schema":"custom","function":"record_update","argtypes":"uuid, uuid, jsonb, integer",
       "table_records":25000,"args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2","p_record_id":"00139b71-8b7d-4540-a208-e98b2eed6cf6","p_patch":{"hours":6.75}}}')
  ) as v(slug, label, subject);

select ops.perf_watch_declare('stmt:' || v.fn, 'statement', v.fn || ' (mean, all real callers)',
         jsonb_build_object('schema', split_part(v.fn, '.', 1), 'function', split_part(v.fn, '.', 2),
                            'match', format('"%s"."%s"(', split_part(v.fn, '.', 1), split_part(v.fn, '.', 2))),
         v.budget, 'mean', 3600, 'PERF-WATCH', 'data')
  from (values ('custom.data_home', 300), ('custom.read_records_page', 300), ('custom.views', 300),
               ('custom.relation_words_with_icons_many', 300), ('custom.record_aggregate', 300),
               ('platform.drill_rows', 300), ('custom.record_update', 300), ('custom.template_install', 5000)) v(fn, budget);

update ops.proof_check
   set metadata = metadata || jsonb_build_object('perf_budget_basis',
         case when slug like '%@large' then 'the small door''s 300 ms p95 (scripts/perf-data/budgets.json), unchanged for 25,000 records'
              when slug = 'stmt:custom.template_install' then 'budgets.json template_install first call 5000 ms; mean of real calls'
              else 'the door''s 300 ms (scripts/perf-data/budgets.json), bound to the mean of real calls' end)
 where kind = 'perf' and (slug like '%@large' or slug like 'stmt:%');

-- The statement collector, hourly at :05 (perf.statement_cadence_minutes), as postgres.
select cron.schedule('perf-watch-statements', '5 * * * *',
  $cmd$SET statement_timeout='60s'; SET lock_timeout='1s'; SELECT ops.perf_statement_collect();$cmd$);
-- Stale + collector health, hourly at :35.
select cron.schedule('perf-watch-health', '35 * * * *',
  $cmd$SET statement_timeout='60s'; SET lock_timeout='1s'; SELECT ops.perf_health_run();$cmd$);
