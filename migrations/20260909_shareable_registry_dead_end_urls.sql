-- 20260909_shareable_registry_dead_end_urls.sql
--
-- platform.shareable_resource_registry.url_path_template is a DB-owned route
-- authority. It drifts from the `app/` tree silently, because nothing connects
-- the column to the filesystem — the failure mode FOUND_DEFECTS D138 recorded
-- and `utils/permissions/__tests__/registry.routes.test.ts` exists to catch.
--
-- That guard only ever saw the TS MIRROR, so it could only catch drift that had
-- already been mirrored. A census of the LIVE table against the route tree on
-- 2026-09-09 found 15 rows advertising a URL that resolves to no route at all —
-- every one of them rendered as a link on the org sharing surfaces, i.e. a 404
-- in a real user's face.
--
-- The registry's own documented rule has exactly two lawful repairs, and this
-- migration applies each where it belongs:
--   1. the route exists under a different path  -> correct the template;
--   2. the route does not exist                 -> set the template to ''.
-- '' is the registry saying "this record has no signed-in destination";
-- getResourceSharePath() then returns null and the surface renders NO link.
-- Inventing a plausible-looking path to make a link appear is the defect itself,
-- so nothing below guesses at a detail route that was never built.

begin;

-- (1) The route exists, under a different path.

-- Vision Interview lives under the Masterwork module and always has:
-- app/(core)/masterwork/vision-interview/[sessionId]/page.tsx. `/vision-interview/{id}`
-- has never been a route. Every producer in the app already builds the real one
-- (features/vision-interview/browse/listConfig.tsx, NewInterviewExperience.tsx, …).
update platform.shareable_resource_registry
   set url_path_template = '/masterwork/vision-interview/{id}'
 where resource_type = 'interview_session';

-- Knowledge absorbed the RAG surfaces (`wip: consolidate knowledge and RAG
-- surfaces`, f4668b6d01). Both paths still resolve, so neither was a dead end —
-- but the TS mirror moved to /knowledge and the DB never did, which is half the
-- TS<->DB parity breakage this commit closes. Canonical is /knowledge.
update platform.shareable_resource_registry
   set url_path_template = '/knowledge/repositories?repo={id}'
 where resource_type = 'code_repository';

update platform.shareable_resource_registry
   set url_path_template = '/knowledge/data-stores?store_id={id}'
 where resource_type = 'data_store';

-- (2) The route does not exist. No link is the honest render.
--
-- Verified absent from the whole `app/` tree on 2026-09-09 (not moved, not
-- renamed, not behind a route group — simply never built):
--   /browser/profiles/*                  no `browser` segment exists at all
--   /administration/custom-objects/*     no `custom-objects` directory exists
--   /esign/*                             no `esign` directory exists
--   /hr/assets/{id}                      only the list page `/hr/assets` exists
--   /hr/hiring/candidates|interviews|requisitions/{id}   only `/hr/hiring` exists
--   /hr/onboarding/templates/{id}        only the list page `/hr/onboarding`
--   /hr/training/{id}                    only the list page `/hr/training`
--   /hr/settings/exit-surveys/{id}       only the list page
--   /flashcards/{id}, /ai/prompts/**     retired surfaces (rows already inactive)
--
-- The list page is deliberately NOT substituted for the detail route: a link
-- that lands on a list does not show the record the share was for, which is the
-- same lie as a 404 wearing a nicer face.
update platform.shareable_resource_registry
   set url_path_template = ''
 where resource_type in (
   'browser_profile',
   'custom_entity_definition',
   'custom_record',
   'esign_campaign',
   'esign_envelope',
   'hr_asset',
   'hr_candidate',
   'hr_checklist_template',
   'hr_course',
   'hr_interview',
   'hr_requisition',
   'hr_survey',
   'flashcard_data',
   'prompt',
   'prompt_actions'
 );

commit;
