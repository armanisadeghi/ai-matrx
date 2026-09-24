-- LANE SC-3' COMPARE — the DATA the four-seat proof and the compare walk read, left COMMITTED on
-- the dev clone. The nightly clone refresh restores production over all of it.
--
-- THE USE CASE. Harborline Software is a six-person studio in Tacoma that builds field-service
-- apps for trade companies — the same shape as AI Matrx's own "Apps" scopes (Matrx Frontend: a
-- tech stack, non-negotiable dev standards, a repository, core principles). Its lead engineer
-- (admin@admin.com) keeps one scope per app so every coding agent knows the stack and the
-- standards. One client, Brightline Facilities (a commercial facilities-maintenance company —
-- Titanium's shape: a services firm whose tasks get tagged to its vendor's app), tags its pilot
-- task to Harborline's Dispatch app, so that tag crosses organizations exactly like Titanium's
-- task tagged to AI Matrx's Matrx Frontend. And Cedar Ridge Tutoring runs AP classes as scopes of
-- type Classes; one student (test@test.com) is admitted to AP Chemistry through a scope
-- membership and is NOT a member of the tutoring organization — the class-student seat.
--
-- SEATS (the proof's names): admin@admin.com = Priya Raman, Harborline's lead engineer, owner of
-- all three organizations; test@test.com = Jordan Ellis — a Brightline facilities coordinator
-- (member of Brightline only) who is also enrolled in Cedar Ridge's AP Chemistry evening class.
-- Every name, repository and date is synthesized.
--
-- CLONE ONLY: `\set expect 'clone'` makes the preamble refuse the main database and the branch.
-- Idempotent: every row carries a fixed id and is inserted `on conflict do nothing`, and every
-- value is written only when that cell holds no value yet.
-- Organizations carry settings.test_fixture = true and settings.fixture_lane = 'SC-3' — cleanup
-- finds them by that tag, never by name.

\set ON_ERROR_STOP on
\timing off
\set suite '_sc3_compare_fixture.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

do $sc3$
declare
  c_admin  constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com (Priya Raman)
  c_jordan constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com (Jordan Ellis)
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';

  o_harbor constant uuid := '77343ee5-3327-4b17-8d75-6f9624f06dbd';
  o_cedar  constant uuid := 'e683aef4-233b-4a35-a304-cbc9e579f90b';
  o_bright constant uuid := '2bb90c39-df0a-45ba-80b5-4d46695490f9';

  t_apps     constant uuid := 'ab7dcccb-6db3-4418-a956-aa7022169b69';
  t_problems constant uuid := '3d1511c0-4339-4760-b81e-2f7c01497efd';
  t_classes  constant uuid := '0250f203-c5bd-410e-a20d-045cf3423b28';

  i_stack     constant uuid := '1a71b37b-05ab-45e1-b997-d7e95709275f';
  i_standards constant uuid := '79ed7243-3c59-4a74-b9f6-f6dc15802db5';
  i_repo      constant uuid := '32887a46-d08f-4358-942c-61c02162002f';
  i_princ     constant uuid := '20afe22a-028d-4c87-b8a4-53fe7744b4f4';
  i_cadence   constant uuid := '51bc93eb-2b3a-4fa8-94bd-4e16c974b880';
  i_problem   constant uuid := '20746694-3dfa-4e9a-a79f-04738fc4b767';
  i_symptoms  constant uuid := '927ada8e-e62d-4cf8-8b63-5fc8bed12207';
  i_syllabus  constant uuid := 'c46bd586-8702-4e09-87cd-76ac2356c7e2';
  i_exams     constant uuid := '472ed824-5993-470e-b758-0270b20b4bd4';
  i_hours     constant uuid := '566a54fe-d056-4fa7-8096-905043850492';

  s_dispatch constant uuid := '5fd365ca-7d0e-4e1c-8b9b-a79131b38f20';
  s_field    constant uuid := '13389e65-1363-4c02-beaf-34663d462a8e';
  s_stale    constant uuid := 'd704de68-1d60-4e47-b331-b5c1be6e4686';
  s_chem     constant uuid := 'ecb6e60b-5c8b-4a7b-acc7-7c2c078242e9';
  s_bio      constant uuid := 'f4ca92cb-ee52-4a03-a344-dda159fe9bfd';

  p_pilot constant uuid := '21e7a5ef-3138-4056-adda-32a940a41fff';
  k_pilot constant uuid := '0e30ded1-5ac9-4424-9d7d-b3b01e32ef7c';

  v_fixture jsonb := jsonb_build_object('test_fixture', true, 'fixture_lane', 'SC-3',
                                        'fixture_note', 'SC-3 compare: four-seat proof data (dev clone only)');
begin
  perform set_config('app.actor_system', 'campaign-test/sc3-compare', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ── three organizations, Priya owns all three; Jordan is a Brightline member only ────────
  insert into iam.organizations (id, name, slug, abbreviation, created_by, settings) values
    (o_harbor, 'Harborline Software',    'harborline-software-sc3',  'HLS', c_admin, v_fixture),
    (o_cedar,  'Cedar Ridge Tutoring',   'cedar-ridge-tutoring-sc3', 'CRT', c_admin, v_fixture),
    (o_bright, 'Brightline Facilities',  'brightline-facilities-sc3','BLF', c_admin, v_fixture)
  on conflict (id) do nothing;
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (o_harbor, 'organization', o_harbor, c_admin,  'owner',  'active'),
    (o_cedar,  'organization', o_cedar,  c_admin,  'owner',  'active'),
    (o_bright, 'organization', o_bright, c_admin,  'owner',  'active'),
    (o_bright, 'organization', o_bright, c_jordan, 'member', 'active')
  on conflict (container_type, container_id, user_id) do nothing;
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  select 'custom', 'system_enabled', 'organization', o, o, 'true'::jsonb, 'SC-3 compare fixture'
    from unnest(array[o_harbor, o_cedar, o_bright]) o
   where not exists (select 1 from platform.knob_override k
                      where k.feature = 'custom' and k.key = 'system_enabled'
                        and k.scope_kind = 'organization' and k.scope_id = o);

  -- ── Harborline: Apps and Known Problems, in AI Matrx's own shape ─────────────────────────
  insert into context.scope_types (id, organization_id, label_singular, label_plural, icon, description, sort_order, slug, created_by) values
    (t_apps,     o_harbor, 'App',           'Apps',           'app-window', 'The apps we build and ship for clients', 1, 'apps',           c_admin),
    (t_problems, o_harbor, 'Known Problem', 'Known Problems', 'bug',        'Defects a coding agent must know about before it touches an app', 2, 'known-problems', c_admin)
  on conflict (id) do nothing;

  insert into context.context_items (id, scope_type_id, key, slug, display_name, description, value_type, fetch_hint, sensitivity, sort_order, created_by, allowed_scope_type_ids, allowed_reference_types) values
    (i_stack,     t_apps, 'tech_stack',                   'tech-stack',                   'Tech Stack',                   'Frameworks, runtimes and hosting this app is built on',        'string',    'on_demand', 'internal', 1, c_admin, null, null),
    (i_standards, t_apps, 'non_negotiable_dev_standards', 'non-negotiable-dev-standards', 'Non-Negotiable Dev Standards', 'Rules every change to this app follows, no exceptions',        'string',    'on_demand', 'internal', 2, c_admin, null, null),
    (i_repo,      t_apps, 'repository',                   'repository',                   'Repository',                   'Where the code lives',                                         'string',    'on_demand', 'internal', 3, c_admin, null, null),
    (i_princ,     t_apps, 'core_principles',              'core-principles',              'Core Principles',              'How the app is designed to behave',                            'string',    'on_demand', 'internal', 4, c_admin, null, null),
    (i_cadence,   t_apps, 'release_cadence',              'release-cadence',              'Release Cadence',              'How often this app ships to the client',                       'string',    'always',    'internal', 5, c_admin, null, null),
    (i_problem,   t_apps, 'open_known_problem',           'open-known-problem',           'Open Known Problem',           'The one known problem an agent must read before touching this app', 'reference', 'always', 'internal', 6, c_admin, array[t_problems], array['scope']),
    (i_symptoms,  t_problems, 'symptoms',                 'symptoms',                     'Symptoms',                     'What the person using the app sees',                           'string',    'always',    'internal', 1, c_admin, null, null)
  on conflict (id) do nothing;

  insert into context.scopes (id, organization_id, scope_type_id, name, description, slug, sort_order, created_by) values
    (s_dispatch, o_harbor, t_apps,     'Harborline Dispatch', 'The dispatch board and scheduling web app Brightline''s coordinators run their day on', 'harborline-dispatch', 1, c_admin),
    (s_field,    o_harbor, t_apps,     'Harborline Field',    'The technician mobile app: work orders, photos, signatures', 'harborline-field', 2, c_admin),
    (s_stale,    o_harbor, t_problems, 'Dispatch board goes stale after a reconnect', 'Realtime channel resubscribes but the board keeps the pre-disconnect snapshot', 'dispatch-board-goes-stale', 1, c_admin)
  on conflict (id) do nothing;

  -- ── Cedar Ridge Tutoring: two AP classes as scopes of type Classes ───────────────────────
  insert into context.scope_types (id, organization_id, label_singular, label_plural, icon, description, sort_order, slug, created_by) values
    (t_classes, o_cedar, 'Class', 'Classes', 'graduation-cap', 'Evening AP cohorts', 1, 'classes', c_admin)
  on conflict (id) do nothing;
  insert into context.context_items (id, scope_type_id, key, slug, display_name, description, value_type, fetch_hint, sensitivity, sort_order, created_by) values
    (i_syllabus, t_classes, 'syllabus_summary', 'syllabus-summary', 'Syllabus Summary', 'What the cohort covers, unit by unit', 'string', 'always', 'internal', 1, c_admin),
    (i_exams,    t_classes, 'exam_dates',       'exam-dates',       'Exam Dates',       'Unit tests and the AP exam',           'string', 'always', 'internal', 2, c_admin),
    (i_hours,    t_classes, 'office_hours',     'office-hours',     'Office Hours',     'When the instructor takes questions',  'string', 'always', 'internal', 3, c_admin)
  on conflict (id) do nothing;
  -- No `settings` on these two: a class's settings keys (access mode, join code) land as
  -- declared Fields only once SC-2' fixes the mover (attack H2); this seat proves ADMISSION,
  -- and the class's values are its three context items.
  insert into context.scopes (id, organization_id, scope_type_id, name, description, slug, sort_order, created_by) values
    (s_chem, o_cedar, t_classes, 'AP Chemistry — Fall Cohort', 'Tuesday and Thursday evenings, 6:30–8:30 pm, 14 students', 'ap-chemistry-fall', 1, c_admin),
    (s_bio,  o_cedar, t_classes, 'AP Biology — Fall Cohort',   'Monday and Wednesday evenings, 6:30–8:30 pm, 11 students', 'ap-biology-fall',   2, c_admin)
  on conflict (id) do nothing;
  -- Jordan is admitted to AP Chemistry through a scope membership — and to nothing else there.
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (o_cedar, 'scope', s_chem, c_jordan, 'member', 'active')
  on conflict (container_type, container_id, user_id) do nothing;

  -- ── Brightline: the pilot project and task, tagged to Harborline Dispatch ────────────────
  insert into workspace.projects (id, name, description, created_by, organization_id, slug, status) values
    (p_pilot, 'Dispatch board pilot — North County crew', 'Two-week pilot of Harborline Dispatch with the North County maintenance crew', c_admin, o_bright, 'dispatch-board-pilot-sc3', 'active')
  on conflict (id) do nothing;
  insert into workspace.tasks (id, title, description, project_id, status, due_date, organization_id, created_by) values
    (k_pilot, 'Run the North County crew on the new dispatch board for two weeks',
     'Coordinators schedule every North County work order in Harborline Dispatch; log anything the board gets wrong.',
     p_pilot, 'incomplete', date '2026-10-09', o_bright, c_admin)
  on conflict (id) do nothing;
  -- THE CROSS-ORGANIZATION TAG. The edge is Brightline's (the task's organization); its target
  -- is Harborline's scope — exactly the shape of Titanium's task tagged to Matrx Frontend.
  insert into platform.associations (source_type, source_id, target_type, target_id, organization_id, created_by)
  select 'task', k_pilot, 'scope', s_dispatch, o_bright, c_admin
   where not exists (select 1 from platform.associations a
                      where a.source_type = 'task' and a.source_id = k_pilot
                        and a.target_type = 'scope' and a.target_id = s_dispatch and a.deleted_at is null);
end $sc3$;

-- ── values, through the old side's ONE cell writer, only where the cell is still empty ─────
do $values$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  r record;
begin
  perform set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}', true);
  for r in
    select * from (values
      -- Harborline Dispatch — Tech Stack has TWO versions (the stack was upgraded in August)
      ('1a71b37b-05ab-45e1-b997-d7e95709275f'::uuid, '5fd365ca-7d0e-4e1c-8b9b-a79131b38f20'::uuid, 1,
       '**Web:** Next.js 15 (App Router) + React 19 + TypeScript 5.6 · **Data:** Postgres 16 on Supabase, Realtime for the board · **Hosting:** Vercel'),
      ('1a71b37b-05ab-45e1-b997-d7e95709275f', '5fd365ca-7d0e-4e1c-8b9b-a79131b38f20', 2,
       '**Web:** Next.js 16 (App Router) + React 19.2 + TypeScript 6 · **Data:** Postgres 17 on Supabase, Realtime broadcast for the board · **Maps:** Mapbox GL · **Hosting:** Vercel, background jobs on Inngest'),
      ('79ed7243-3c59-4a74-b9f6-f6dc15802db5', '5fd365ca-7d0e-4e1c-8b9b-a79131b38f20', 1,
       '- Every write carries the client organization explicitly; nothing guesses it.' || chr(10) ||
       '- No work order is ever hard-deleted; archive with a reason.' || chr(10) ||
       '- A board change is optimistic and reconciles against the server version; never last-writer-wins silently.' || chr(10) ||
       '- Every screen works one-handed on a 6-inch phone.'),
      ('32887a46-d08f-4358-942c-61c02162002f', '5fd365ca-7d0e-4e1c-8b9b-a79131b38f20', 1, 'https://git.harborline.dev/apps/dispatch'),
      ('20afe22a-028d-4c87-b8a4-53fe7744b4f4', '5fd365ca-7d0e-4e1c-8b9b-a79131b38f20', 1,
       '- The coordinator''s board is the source of truth for the day; the technician app mirrors it.' || chr(10) ||
       '- A job never silently disappears from the board — reassignments leave a trail.'),
      ('51bc93eb-2b3a-4fa8-94bd-4e16c974b880', '5fd365ca-7d0e-4e1c-8b9b-a79131b38f20', 1, 'Every other Tuesday, after Brightline''s coordinators sign off on the staging board'),
      -- Harborline Field
      ('1a71b37b-05ab-45e1-b997-d7e95709275f', '13389e65-1363-4c02-beaf-34663d462a8e', 1,
       '**Mobile:** Expo SDK 54 + React Native 0.81 + TypeScript 6 · **Offline:** WatermelonDB sync · **Data:** Supabase'),
      ('32887a46-d08f-4358-942c-61c02162002f', '13389e65-1363-4c02-beaf-34663d462a8e', 1, 'https://git.harborline.dev/apps/field'),
      ('51bc93eb-2b3a-4fa8-94bd-4e16c974b880', '13389e65-1363-4c02-beaf-34663d462a8e', 1, 'Store release monthly; over-the-air fixes weekly'),
      -- The known problem
      ('927ada8e-e62d-4cf8-8b63-5fc8bed12207', 'd704de68-1d60-4e47-b331-b5c1be6e4686', 1,
       'After a phone drops Wi-Fi for more than 30 seconds the board reconnects but keeps showing jobs that were reassigned in the meantime.'),
      -- AP Chemistry
      ('c46bd586-8702-4e09-87cd-76ac2356c7e2', 'ecb6e60b-5c8b-4a7b-acc7-7c2c078242e9', 1,
       'Unit 1 atomic structure · Unit 2 bonding · Unit 3 intermolecular forces · Unit 4 reactions · Unit 5 kinetics · Unit 6 thermodynamics · Unit 7 equilibrium · Unit 8 acids and bases · Unit 9 electrochemistry'),
      ('472ed824-5993-470e-b758-0270b20b4bd4', 'ecb6e60b-5c8b-4a7b-acc7-7c2c078242e9', 1, 'Unit 1–3 test Oct 15 · Unit 4–6 test Nov 19 · AP exam May 6, 2027'),
      ('566a54fe-d056-4fa7-8096-905043850492', 'ecb6e60b-5c8b-4a7b-acc7-7c2c078242e9', 1, 'Thursdays 5:45–6:25 pm, room 204, before class'),
      -- AP Biology (Jordan is NOT admitted here)
      ('c46bd586-8702-4e09-87cd-76ac2356c7e2', 'f4ca92cb-ee52-4a03-a344-dda159fe9bfd', 1,
       'Unit 1 chemistry of life · Unit 2 cells · Unit 3 energetics · Unit 4 cell communication · Unit 5 heredity · Unit 6 gene expression · Unit 7 evolution · Unit 8 ecology'),
      ('566a54fe-d056-4fa7-8096-905043850492', 'f4ca92cb-ee52-4a03-a344-dda159fe9bfd', 1, 'Wednesdays 5:45–6:25 pm, room 118')
    ) as v(item_id, scope_id, version, body)
    order by 2, 1, 3
  loop
    if not exists (select 1 from context.context_item_values x
                    where x.context_item_id = r.item_id and x.scope_id = r.scope_id and x.version >= r.version) then
      perform context.write_context_value(r.item_id, r.scope_id, r.body, p_source_type := 'manual', p_actor := c_admin);
    end if;
  end loop;

  -- THE REFERENCE: Harborline Dispatch's open known problem points at the stale-board scope.
  if not exists (select 1 from context.context_item_values x
                  where x.context_item_id = '20746694-3dfa-4e9a-a79f-04738fc4b767' and x.scope_id = '5fd365ca-7d0e-4e1c-8b9b-a79131b38f20') then
    insert into context.context_item_values (context_item_id, scope_id, version, is_current, value_reference_id, value_reference_type, source_type, authored_by)
    values ('20746694-3dfa-4e9a-a79f-04738fc4b767', '5fd365ca-7d0e-4e1c-8b9b-a79131b38f20', 1, true,
            'd704de68-1d60-4e47-b331-b5c1be6e4686', 'scope', 'manual', c_admin);
  end if;
end $values$;

select 'FIXTURE ' || k || ' ' || v from (values
  ('harborline', '77343ee5-3327-4b17-8d75-6f9624f06dbd'), ('cedar_ridge', 'e683aef4-233b-4a35-a304-cbc9e579f90b'),
  ('brightline', '2bb90c39-df0a-45ba-80b5-4d46695490f9'), ('dispatch', '5fd365ca-7d0e-4e1c-8b9b-a79131b38f20'),
  ('field', '13389e65-1363-4c02-beaf-34663d462a8e'), ('stale_board', 'd704de68-1d60-4e47-b331-b5c1be6e4686'),
  ('ap_chemistry', 'ecb6e60b-5c8b-4a7b-acc7-7c2c078242e9'), ('ap_biology', 'f4ca92cb-ee52-4a03-a344-dda159fe9bfd'),
  ('pilot_task', '0e30ded1-5ac9-4424-9d7d-b3b01e32ef7c')) x(k, v) order by k;
commit;
