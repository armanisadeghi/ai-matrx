-- content_ir_markdown_kind_route.sql
--
-- Army: FE kind component routes — the `markdown` kind
-- (docs/KIND_COMPONENT_LEDGER.md, claim `army-fe-wd2`).
-- Ledgered in public._schema_migrations (source 'matrx-frontend').
--
-- `markdown` (`{ text: string }`, family `primitive`, maturity `distilled`) is
-- the kind the agent output contract folds prose into — 99% of every agent
-- result is `content = [one markdown instance]`
-- (common-docs/systems/content-ir-system/KINDS_EVERYWHERE_PLAN.md §6). It had
-- NO `(kind, 'web', 'output')` row, so it reached the generic viewer by SILENT
-- FALLBACK (`applyIrKindRoute` -> `routeToGeneric`, marker `by:'generic',
-- unverified:true`) and a reader got the field label "Text" above their own
-- document, markdown source unrendered.
--
-- REUSE, not invention. WORKFLOW_KINDS_DESIGN.md §4 names the component:
-- "The `markdown` kind's active web component IS MarkdownStream — the proven
-- renderer." Arman's two-path render law ("official declared kind component,
-- or streaming markdown — that's it") collapses into ONE path by making the
-- second path a kind. So this registers
--   ('markdown', 'web', 'output') -> 'markdown_stream'
-- whose dispatch entry (block-dispatch.tsx) is a thin adapter that reads
-- `text` off the envelope and hands it to the SAME MarkdownStream engine that
-- renders every streamed assistant message
-- (components/mardown-display/blocks/markdown/MarkdownKindBlock.tsx).
--
-- Also registers the D1 input floor row ('generic_structured'), the gap copy-C
-- found: the compiled input floor only reaches COMPILED kinds, and `markdown`
-- lives only in the DB, so `/shapes/markdown/test` refused. `markdown` is
-- family `primitive`, NOT one of the data-only machine-contract families
-- (`workflow_io`/`tool_io`/`action_io`/`agent_io`) that `decideKindInputPath`
-- refuses on `dataOnly` — a human can honestly author a block of prose, so the
-- row is a floor, not a registry defect.
--
-- NOT DONE here, deliberately:
--   * kind_example — one canonical example already exists at
--     validation_status='passed'; nothing to author.
--   * kind_definition.is_active — UNTOUCHED. This kind is inactive today, and
--     after this migration it PASSES both legs of the dual gate
--     (`content_ir.evaluate_kind_activation` -> would_activate = true:
--     structural leg from the canonical example, render leg from the row
--     below). Flipping the flag is still a separate, governed act
--     (`content_ir.set_kind_activation`, `shape:activate`), exactly as every
--     other kind migration in this directory records. Nothing about the route
--     needs it: the FE kind registry does NOT filter on `is_active`
--     (schema-source-kind-tables.ts says so in its own contract), and
--     `applyIrKindRoute` reads the COMPONENT row's `is_active`, never the
--     definition's — so the route below renders whether or not the kind is
--     activated.
--   * metadata.maturity — untouched. Registering an FE route does NOT promote
--     maturity (KINDS_EVERYWHERE_PLAN.md §7.8); it stays `distilled`.
--
-- Idempotent: conflict inferred on the partial unique index over
-- (kind_definition_id, platform, role) where (is_default and deleted_at is null).

begin;

insert into content_ir.kind_component (
  kind_definition_id, platform, role, component_key,
  source, config, is_default, is_active, sort_order, organization_id
)
select
  kd.id, 'web', 'output', 'markdown_stream',
  'bundled', '{}'::jsonb, true, true, 100, kd.organization_id
from content_ir.kind_definition kd
where kd.kind = 'markdown'
  and kd.deleted_at is null
on conflict (kind_definition_id, platform, role)
  where (is_default and deleted_at is null)
do update set
  component_key = excluded.component_key,
  source        = excluded.source,
  config        = excluded.config,
  is_active     = excluded.is_active,
  updated_at    = now();

insert into content_ir.kind_component (
  kind_definition_id, platform, role, component_key,
  source, config, is_default, is_active, sort_order, organization_id
)
select
  kd.id, 'web', 'input', 'generic_structured',
  'bundled', '{}'::jsonb, true, true, 100, kd.organization_id
from content_ir.kind_definition kd
where kd.kind = 'markdown'
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
