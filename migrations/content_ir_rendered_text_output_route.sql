-- content_ir_rendered_text_output_route.sql
--
-- KINDS EVERYWHERE — the explicit basic route for `rendered_text`
-- (claims ledger: docs/KIND_COMPONENT_LEDGER.md, copy-E).
--
-- Scope note, so nobody re-derives this: this file used to cover eight
-- engine-result kinds. Seven of them (`branch_result`, `bulk_result`,
-- `criteria_gate_result`, `gather_result`, `map_result`, `operation_result`,
-- `workflow_run_result`) were registered CONCURRENTLY by another agent in
-- `content_ir_workflow_result_output_routes.sql`. Two migrations doing the same
-- thing is duplication even when both are idempotent, so this one was reduced
-- to the single kind that file does not cover. `rendered_text` was picked by
-- MEASURED live traffic: 16 `node_completed` events in `workflow.node_events`
-- over 30 days with no (kind, 'web', 'output') row — it reached the reader only
-- by SILENT fallback (`applyIrKindRoute` -> `routeToGeneric`, marker
-- `by:'generic', unverified:true, reason:'no-component'`).
--
-- REUSE-FIRST VERDICT (Inventory Law): searched the compiled bootstrap
-- (features/content-ir/registry/system-kinds.ts + system-components.ts), every
-- registered `legacyBlockType` facet, and the block dispatch registry. Nothing
-- renders `{ text, rendered, truncated }`.
--
-- KNOWN UPGRADE PATH (deliberate, not an oversight): `rendered_text.text` IS
-- markdown, so a dedicated component streaming it through `MarkdownStream` —
-- with `rendered` / `truncated` as chrome — is a real improvement over the JSON
-- tree view. This migration does not block it: swapping `component_key` on this
-- same row is the whole change.
--
-- MATURITY IS NOT TOUCHED, and neither is `kind_definition.is_active` —
-- activation is the dual gate's verdict, owned centrally (`shape:activate`).
--
-- The canonical `kind_example` already exists (verified live before writing
-- this file), so unlike the `content_ir_generic_structured_roots.sql` precedent
-- this migration authors none and only registers the resolver row.
--
-- Idempotent: re-running is safe (conflict inferred on the real partial unique
-- index `kind_component_default_unique`).

begin;

-- Resolver row (R1): (kind, web, output) -> generic_structured.
-- `source = 'bundled'` because the component ships compiled with the app.
-- `is_active = true` is truthful: the generic viewer really IS this kind's web
-- output component today. It is NOT a claim that a bespoke renderer exists —
-- `GenericStructuredBlock` still says "no custom view yet" out loud, because it
-- keys that note on `marker.reason`, not on which resolver tier answered.
insert into content_ir.kind_component (
  kind_definition_id, platform, role, component_key,
  source, config, is_default, is_active, sort_order, organization_id
)
select
  kd.id, 'web', 'output', 'generic_structured',
  'bundled', '{}'::jsonb, true, true, 100, kd.organization_id
from content_ir.kind_definition kd
where kd.kind = 'rendered_text'
  and kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.deleted_at is null
on conflict (kind_definition_id, platform, role)
  where (is_default and deleted_at is null)
do update set
  component_key = excluded.component_key,
  source        = excluded.source,
  config        = excluded.config,
  is_active     = excluded.is_active,
  updated_at    = now();

commit;
