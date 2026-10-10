--
-- perf_watch2_doors_a_chat_notes_files_tasks_workflows.sql
--
-- PERF-WATCH-2, worker DOORS-A. Door watches for the hottest client-called RPCs of agents/chat (agent list,
-- conversation list facets, conversation load), notes, files, tasks/projects and workflows. Declared with
-- ops.perf_watch_declare exactly as perf_watch_w1_d_seed_and_cron.sql / perf_watch2_doors_b_* do; fixtures are
-- PINNED here, never discovered at run time (resolved 2026-10-10 as admin@admin.com / test@test.com):
--   conversation (58 / 28 messages)  admin 7e407e09-3a8f-5961-b2fe-f55ecc045cbf   member e2998443-b2f1-4fe5-b38c-5219c02ed499
--   note with 38 / 1+ versions       admin 35eefd58-108e-435d-b481-1dbebc809dc2   member 3feea807-e4bf-4227-84ba-8affd6a12593
--   project (23 tasks / 2 tasks)     admin d78bf7fd-0021-4a64-beb2-37b103bb319e   member 05683620-762e-42f5-b31d-0083e65bec12
--   file organization (261 / 67 files) admin 7cd12da2-2213-4378-8fba-a9e2dc4ea657 member 8cb71c8b-5b49-4563-a5fe-d77ff600f8ee
--   agent with 64 versions           92c37a37-7630-4517-b2a2-b6f1d2427208 (admin seat only: a member reads the same rows)
-- Seats: admin = admin@admin.com (default seat); member = test@test.com (perf_subject.seat_email), as every twin.
-- Budgets: 300 ms p95 (budgets.json default); 1000 ms p95 for the four heavy aggregates (agx/wfx list scope
-- counts, conversation lane facets), whose measured warm cost was 380-510 ms on 2026-10-10. Two write doors
-- (a note version, a task bulk-create) run inside the probe's always-rolled-back subtransaction on admin-owned fixtures.
-- NOT door-watched on purpose: public.get_org_file_list on the two big admin file organizations (884d1ce8-...
-- 3.1 s, f9cb3e35-... 4.6 s, the 15.8k-file one times out) — 11 calls of 3-5 s would take ~40 s of the admin group's
-- 75 s cap; held for a third probe group (reported in PLAN.md). Not door-watched: public.get_cx_conversation_*
-- shared_with_me / conversation_files / get_tasks_for_entity / search_files@member (answer empty for the fixtures).
-- Inverse: migrations/inverse/perf_watch2_doors_a_chat_notes_files_tasks_workflows_down.sql.

with seat(email, uid, member, conv, note, proj, task, org) as (values
  ('admin@admin.com', '87a6e699-3622-4869-8843-d0867456c0dd', false, '7e407e09-3a8f-5961-b2fe-f55ecc045cbf', '35eefd58-108e-435d-b481-1dbebc809dc2', 'd78bf7fd-0021-4a64-beb2-37b103bb319e', '8a8f67a2-5444-43ab-9888-6d00ae4f22d2', '7cd12da2-2213-4378-8fba-a9e2dc4ea657'),
  ('test@test.com',   '4060701e-706a-4c76-b3ca-0bbc69fa5a14', true,  'e2998443-b2f1-4fe5-b38c-5219c02ed499', '3feea807-e4bf-4227-84ba-8affd6a12593', '05683620-762e-42f5-b31d-0083e65bec12', '08932f67-ac15-4802-8a81-accf945553c5', '8cb71c8b-5b49-4563-a5fe-d77ff600f8ee')),
d(slug, label, feature, budget, admin_only, subj) as (values
  ('door:public.agx_list_scoped', 'public.agx_list_scoped (agents browse, mine, 50 rows)', 'agents', 300, false,
   '{"schema":"public","function":"agx_list_scoped","argtypes":"text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer","args":{"p_scope":"mine","p_limit":50,"p_offset":0}}'),
  ('door:public.agx_list_scope_counts', 'public.agx_list_scope_counts (agents browse tab counts)', 'agents', 1000, false,
   '{"schema":"public","function":"agx_list_scope_counts","argtypes":"text, boolean, text, jsonb, uuid","args":{}}'),
  ('door:public.agx_get_version_history', 'public.agx_get_version_history (agent with 64 versions)', 'agents', 300, true,
   '{"schema":"public","function":"agx_get_version_history","argtypes":"uuid, integer, integer","args":{"p_agent_id":"92c37a37-7630-4517-b2a2-b6f1d2427208","p_limit":50,"p_offset":0}}'),
  ('door:public.get_cx_conversation_lane_facets', 'public.get_cx_conversation_lane_facets (chat history lanes)', 'chat', 1000, false,
   '{"schema":"public","function":"get_cx_conversation_lane_facets","argtypes":"","args":{}}'),
  ('door:public.get_cx_conversation_bundle', 'public.get_cx_conversation_bundle (open a conversation, 50 messages)', 'chat', 300, false,
   '{"schema":"public","function":"get_cx_conversation_bundle","argtypes":"uuid, integer, smallint","args":{"p_conversation_id":"@conv","p_message_limit":50}}'),
  ('door:public.get_note_versions', 'public.get_note_versions (note history)', 'notes', 300, false,
   '{"schema":"public","function":"get_note_versions","argtypes":"uuid","args":{"p_note_id":"@note"}}'),
  ('door:workbench.note_folder_counts', 'workbench.note_folder_counts (notes sidebar counts)', 'notes', 300, true,
   '{"schema":"workbench","function":"note_folder_counts","argtypes":"text","args":{"p_scope":"organization"}}'),
  ('door:public.create_note_version_manual', 'public.create_note_version_manual (save a note version, rolled back)', 'notes', 300, true,
   '{"schema":"public","function":"create_note_version_manual","argtypes":"uuid, text, text, text, text","args":{"p_note_id":"@note","p_content":"perf probe (rolled back)","p_label":"perf probe"},"expect_nonempty":false}'),
  ('door:public.get_user_file_tree', 'public.get_user_file_tree (files tree, 100 rows)', 'files', 300, false,
   '{"schema":"public","function":"get_user_file_tree","argtypes":"uuid, integer, integer, boolean, boolean, text","args":{"p_user_id":"@uid","p_limit":100,"p_offset":0}}'),
  ('door:public.get_org_file_list', 'public.get_org_file_list (organization files, one org)', 'files', 300, false,
   '{"schema":"public","function":"get_org_file_list","argtypes":"uuid, uuid","args":{"p_user_id":"@uid","p_org_id":"@org"}}'),
  ('door:public.get_project_references_detailed', 'public.get_project_references_detailed (project)', 'tasks', 300, false,
   '{"schema":"public","function":"get_project_references_detailed","argtypes":"uuid, integer","args":{"p_project_id":"@proj","p_sample_limit":5}}'),
  ('door:public.get_task_associations', 'public.get_task_associations (task)', 'tasks', 300, false,
   '{"schema":"public","function":"get_task_associations","argtypes":"uuid","args":{"p_task_id":"@task"}}'),
  ('door:public.create_tasks_bulk', 'public.create_tasks_bulk (one task in a project, rolled back)', 'tasks', 300, true,
   '{"schema":"public","function":"create_tasks_bulk","argtypes":"jsonb, uuid, uuid, uuid[], text, uuid, jsonb","args":{"p_items":[{"title":"perf probe (rolled back)"}],"p_project_id":"d78bf7fd-0021-4a64-beb2-37b103bb319e","p_organization_id":"884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f"},"expect_nonempty":false}'),
  ('door:public.wfx_list_scoped', 'public.wfx_list_scoped (workflows browse, mine, 50 rows)', 'workflows', 300, true,
   '{"schema":"public","function":"wfx_list_scoped","argtypes":"text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer","args":{"p_scope":"mine","p_limit":50,"p_offset":0}}'),
  ('door:public.wfx_list_scope_counts', 'public.wfx_list_scope_counts (workflows browse tab counts)', 'workflows', 1000, false,
   '{"schema":"public","function":"wfx_list_scope_counts","argtypes":"text, boolean, text, jsonb, uuid","args":{}}')),
-- Member twins only where the fixture answers non-empty for test@test.com (checked 2026-10-10).
twin_ok(slug) as (values
  ('door:public.agx_list_scoped'), ('door:public.agx_list_scope_counts'), ('door:public.get_cx_conversation_lane_facets'),
  ('door:public.get_cx_conversation_bundle'), ('door:public.get_note_versions'), ('door:public.get_user_file_tree'),
  ('door:public.get_org_file_list'), ('door:public.get_project_references_detailed'), ('door:public.get_task_associations'),
  ('door:public.wfx_list_scope_counts')),
resolved as (
  select d.slug || case when s.member then '@member' else '' end as slug,
         d.label || case when s.member then ' · member seat' else '' end as label,
         d.feature, d.budget,
         replace(replace(replace(replace(replace(d.subj, '@conv', s.conv), '@note', s.note), '@proj', s.proj), '@task', s.task),
                 '@uid', s.uid)::text as subj1, s.org, s.email, s.member
    from d cross join seat s
   where (not s.member) or (not d.admin_only and exists (select 1 from twin_ok t where t.slug = d.slug)))
select ops.perf_watch_declare(r.slug, 'door', r.label,
         (replace(r.subj1, '@org', r.org)::jsonb) || case when r.member then jsonb_build_object('seat_email', r.email) else '{}'::jsonb end,
         r.budget, 'p95', 900, 'PERF-WATCH-2', r.feature)
  from resolved r;
