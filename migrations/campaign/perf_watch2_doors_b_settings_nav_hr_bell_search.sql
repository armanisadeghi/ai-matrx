--
-- perf_watch2_doors_b_settings_nav_hr_bell_search.sql
--
-- PERF-WATCH-2, worker DOORS-B. Door watches for the hottest client-called RPCs of settings / knob resolution,
-- organizations / navigation, HR, the notification bell and search, plus statement watches for the busiest
-- of them. Declared with ops.perf_watch_declare exactly as perf_watch_w2_e_seed_and_cron.sql does; fixtures are
-- PINNED here, never discovered at run time:
--   organization "admin's Workspace" 884d1ce8-... (both seats are members; nine scope types, the heaviest tree),
--   organization "Holloway Creative" 344cfaa8-... (the data home the other watches use) for HR and the levels,
--   eight record ids of the relation fixture of door:custom.relation_words_with_icons_many for the levels doors,
--   search text "plan", seat user ids of admin@admin.com / test@test.com for the two knob doors.
-- Seats: admin = admin@admin.com (default seat); member = test@test.com (perf_subject.seat_email), as every twin.
-- Every door here is a read (STABLE); nothing is written. Budgets: 300 ms p95 (budgets.json default); knob_index
-- 1000 ms p95 because it answers the whole 6 MB index in one call when no feature prefix is given.
-- Measured on 2026-10-10 as the probe seat, warm: see the PLAN.md line under "PERF-WATCH-2 doors".
-- NOT door-watched on purpose: custom.effective_level_many (EXECUTE is not granted to authenticated: a server
-- door, so only a statement watch), and the background statements custom.io_outbox_pending_organizations,
-- custom.record_changes_drain, realtime WAL (server work, no client seat).
-- HELD for a third probe group (member group already averages ~39 s of its 75 s cap): door:public.hr_my_context@member
-- (3.7 s a call, 351 KB) and door:platform.knob_index@member (0.83 s, 6 MB).
-- Inverse: migrations/inverse/perf_watch2_doors_b_settings_nav_hr_bell_search_down.sql.

with seat(email, uid, member) as (values
  ('admin@admin.com', '87a6e699-3622-4869-8843-d0867456c0dd', false),
  ('test@test.com',   '4060701e-706a-4c76-b3ca-0bbc69fa5a14', true)),
d(slug, label, feature, budget, admin_only, subj) as (values
  ('door:public.get_scope_trees', 'public.get_scope_trees (3 organizations, navigation tree)', 'organizations', 300, false,
   '{"schema":"public","function":"get_scope_trees","argtypes":"uuid[], uuid","args":{"p_org_ids":["884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f","0a54df90-eab8-4d07-ab29-81a45fb41e04","11f4e747-c13a-49c7-81a3-66e6391f8a9b"]}}'),
  ('door:public.hr_my_context', 'public.hr_my_context (HR context of one organization)', 'hr', 300, true,
   '{"schema":"public","function":"hr_my_context","argtypes":"uuid","args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2"}}'),
  ('door:platform.knob_snapshot', 'platform.knob_snapshot (settings snapshot of one organization)', 'settings', 300, false,
   '{"schema":"platform","function":"knob_snapshot","argtypes":"uuid, uuid, jsonb","args":{"p_organization_id":"884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"}}'),
  ('door:platform.knob_index', 'platform.knob_index (whole settings index, no feature prefix)', 'settings', 1000, true,
   '{"schema":"platform","function":"knob_index","argtypes":"uuid, text, uuid, boolean, jsonb, uuid","args":{"p_organization_id":"884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"}}'),
  ('door:custom.my_levels', 'custom.my_levels (access level of 8 records)', 'settings', 300, false,
   '{"schema":"custom","function":"my_levels","argtypes":"uuid, jsonb, text","args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2","p_ids":["15a1b961-39ea-48c0-96fb-73f258b2f9aa","2ccbb0b3-9749-404b-b474-55590fa6e2ca","30cdfdd2-fb71-440c-a9a1-50d7f5c32cb1","40bf2abb-7157-46f9-9214-2a8fed089b84","48dd14f6-82f0-43a2-838f-2884912c511d","562d6c0a-291a-4be9-9245-085c54225238","7313488f-5116-4412-8161-5760ee1b8d51","9978e137-bf47-4dcf-82da-2354748ee973"]}}'),
  ('door:platform.search_item_sections', 'platform.search_item_sections (search "plan", 5 per type)', 'search', 300, false,
   '{"schema":"platform","function":"search_item_sections","argtypes":"text, text[], uuid[], uuid[], text[], text[], uuid[], timestamp with time zone, timestamp with time zone, integer, jsonb","args":{"p_query":"plan","p_limit_per_type":5}}'),
  ('door:communication.my_notification_unread_count', 'communication.my_notification_unread_count (bell badge)', 'notifications', 300, false,
   '{"schema":"communication","function":"my_notification_unread_count","argtypes":"","args":{},"expect_nonempty":false}'))
select ops.perf_watch_declare(
         d.slug || case when s.member then '@member' else '' end,
         'door',
         d.label || case when s.member then ' (member seat)' else '' end,
         d.subj::jsonb
           || case when s.member then jsonb_build_object('seat_email', s.email) else '{}'::jsonb end
           || case when d.slug in ('door:platform.knob_snapshot', 'door:platform.knob_index')
                   then jsonb_build_object('args', (d.subj::jsonb -> 'args') || jsonb_build_object('p_user_id', s.uid))
                   else '{}'::jsonb end,
         d.budget, 'p95', 900, 'PERF-WATCH-2', d.feature)
  from d cross join seat s
 where not (s.member and d.admin_only);

select ops.perf_watch_declare('stmt:' || v.fn, 'statement', v.fn || ' (mean, all real callers)',
         jsonb_build_object('schema', split_part(v.fn, '.', 1), 'function', split_part(v.fn, '.', 2),
                            'match', format('"%s"."%s"(', split_part(v.fn, '.', 1), split_part(v.fn, '.', 2))),
         300, 'mean', 3600, 'PERF-WATCH-2', v.feature)
  from (values ('public.get_scope_trees', 'organizations'), ('public.hr_my_context', 'hr'), ('platform.knob_snapshot', 'settings'),
               ('custom.effective_level_many', 'settings'), ('custom.my_levels', 'settings')) v(fn, feature);

update ops.proof_check
   set metadata = metadata || jsonb_build_object('perf_budget_basis',
         case when slug = 'door:platform.knob_index' then 'heavy aggregate: the whole 6 MB settings index in one call, 1000 ms p95'
              when slug like 'stmt:%' then 'the door budget (300 ms), bound to the mean of real calls'
              else 'the default read-door budget (scripts/perf-data/budgets.json), 300 ms p95' end)
 where kind = 'perf' and owner = 'PERF-WATCH-2' and metadata->>'perf_budget_basis' is null;
