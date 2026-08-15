-- sharing_registry_route_truth_d138.sql
--
-- FOUND_DEFECTS D138 — `platform.shareable_resource_registry.url_path_template`
-- was a SECOND route authority that had drifted from the real `app/` tree. Every
-- stale template is a link that 404s a real user on the org sharing surfaces
-- (OrgResourceDetail, ContainerResourceSheet, OrgShareReviewCard) and in
-- `resolve_share_token`'s payload.
--
-- Audited 2026-08-14 against the live App Router tree (1,011 route leaves).
-- 24 of 73 active rows resolved to no route at all.
--
-- Two kinds of correction, and no third:
--   1. A REAL route exists → point the template at it.
--   2. No route exists → set the template to '' (empty). An empty template is
--      the registry saying "this record has no signed-in destination", which the
--      surfaces render as an honest ABSENCE of a link. Inventing a plausible URL
--      is what created this defect; a 404 is strictly worse than no link.
--
-- `canvas_item` deliberately stays route-less: `/canvas/{id}` has no route and
-- the canonical canvas route is undecided (D137, Arman's call). It is emptied,
-- not repointed, and `canvas_item` still carries no `hrefFor` in the entity
-- registry on purpose.
--
-- Going forward the ENTITY REGISTRY (`features/scopes/registry/entityRegistry.ts`)
-- is the single route authority; this column stays only as the fallback for
-- tokens the entity registry does not cover, and for the share-link payload.
--
-- Idempotent: every statement is a value-set UPDATE keyed on resource_type.

begin;

-- ── 1. Real route found — repoint ───────────────────────────────────────────
-- token          old template                     real App Router route
-- app            /apps/{id}                       app/(core)/agent-apps/[id]
-- scope          /scopes/{id}                     app/(core)/scopes/s/[scopeId]
-- transcript     /transcripts/{id}                /transcripts/processor?focus=  (matches entityRegistry)
-- wc_claim       /legal/wc/{id}                   app/(core)/legal/ca-wc/pd-ratings-calculator/[claimId]
-- data_store     /rag/data-stores/{id}            /rag/data-stores?store_id=     (DataStoresPage reads ?store_id)
-- code_file      /code/files/{id}                 /code?tab=code-file:{id}       (matches entityRegistry)
update platform.shareable_resource_registry as r
set url_path_template = v.tpl
from (values
  ('app',        '/agent-apps/{id}'),
  ('scope',      '/scopes/s/{id}'),
  ('transcript', '/transcripts/processor?focus={id}'),
  ('wc_claim',   '/legal/ca-wc/pd-ratings-calculator/{id}'),
  ('data_store', '/rag/data-stores?store_id={id}'),
  ('code_file',  '/code?tab=code-file:{id}')
) as v(resource_type, tpl)
where r.resource_type = v.resource_type
  and r.url_path_template is distinct from v.tpl;

-- ── 2. No route exists — empty the template (honest absence, not a 404) ─────
-- agent_card                    /agents/card/{id}                     no app/(core)/agents/card segment
-- batch_provider_batch          /administration/.../batches/{id}      kg-cost has only page.tsx
-- canvas_item                   /canvas/{id}                          D137 — route undecided
-- code_folder                   /code/folders/{id}                    app/(core)/code has only page.tsx
-- code_repository               /code/repos/{id}                      idem
-- fc_card                       /education/flashcards/card/{id}       cards open inside their set
-- feature_doc                   /admin/docs/{slug}                    real viewer is keyed by PATH, not id
-- quiz_session                  /quizzes/{id}                         /education/quizzes/[id] is `assessment`
-- research_template             /research/templates/{id}              admin tab only, not URL-addressable
-- scope_association_suggestion  /scopes/suggestions/{id}              no route
-- scope_item_value_suggestion   /scopes/item-suggestions/{id}         no route
-- seo_keyword                   /seo/keywords/{id}                    no id-only keyword route
-- skill                         /skills/{id}                          admin list only
-- user_analysis_preference      /settings/analysis                    no such settings route
-- wf_node_data_slot             /workflows/{id}                       no /workflows route in this app
-- workflow                      /workflows/{id}                       workflow-studio is a separate client
-- workflow_run                  /runs/{id}                            no route
-- workflow_template             /workflows/templates/{id}             no route
-- workflow_trigger              /workflows/{id}/triggers/{id}          no route (and unexpressible: two ids)
update platform.shareable_resource_registry
set url_path_template = ''
where resource_type in (
  'agent_card',
  'batch_provider_batch',
  'canvas_item',
  'code_folder',
  'code_repository',
  'fc_card',
  'feature_doc',
  'quiz_session',
  'research_template',
  'scope_association_suggestion',
  'scope_item_value_suggestion',
  'seo_keyword',
  'skill',
  'user_analysis_preference',
  'wf_node_data_slot',
  'workflow',
  'workflow_run',
  'workflow_template',
  'workflow_trigger'
)
and url_path_template <> '';

comment on column platform.shareable_resource_registry.url_path_template is
  'FALLBACK signed-in destination for a shared record, NOT the route authority. '
  'The canonical route source is the frontend entity registry '
  '(features/scopes/registry/entityRegistry.ts -> getEntityInfo(token).hrefFor); '
  'this column is consulted only for tokens that registry does not cover, and by '
  'resolve_share_token. An EMPTY string means the record has no signed-in '
  'destination — surfaces must render no link rather than guess one. Never invent '
  'a plausible-looking path: that is exactly what produced FOUND_DEFECTS D138 '
  '(24 of 73 active rows pointed at routes that do not exist, 2026-08-14).';

commit;
