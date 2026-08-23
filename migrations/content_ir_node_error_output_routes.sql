-- content_ir_node_error_output_routes.sql
--
-- ERRORS ARE KINDS — KINDS_EVERYWHERE_PLAN.md §10d-B3.
-- Ledger: docs/KIND_COMPONENT_LEDGER.md.
--
-- `node_error` (category runtime) and its nested `field_problem` (category
-- data) were registered by `scripts/publish_kind_catalog.py aidream.kinds.runtime`
-- (aidream, 2026-08-23) when `matrx_graph.types.result.NodeError` became a
-- KindModel. Publication left both INACTIVE for the documented reason: a kind
-- with no active role='output' kind_component row cannot pass the render gate.
-- This migration registers that row.
--
-- ROUTE DECISION — the explicit basic route, for now, and it is deliberately
-- NOT the finish line. B3's stated goal is that a failure renders through a
-- REAL component instead of a raw dump, so a bespoke failure view is the
-- warranted upgrade (the in-flight runtime-wrapper views are its natural
-- home — a `node_outcome` with `status='failed'` nests this under `error`).
-- Registering the floor first is the ledger's own precedent
-- (content_ir_workflow_result_output_routes.sql): the resolver then answers
-- `by:'db'` — "basic route chosen on purpose" — instead of `by:'generic',
-- unverified:true`, and the two kinds activate.
--
-- Canonical examples: both were authored and validated by the publisher
-- against the live emitted_json_schema at the current version, so this
-- migration authors none.
--
-- Does NOT touch metadata.maturity — a basic route is not a promotion.
-- Idempotent, data-only (no DDL). Safe to re-apply.

begin;

insert into content_ir.kind_component (
  kind_definition_id, platform, role, component_key,
  source, config, is_default, is_active, sort_order, organization_id, metadata
)
select
  kd.id, 'web', 'output', 'generic_structured',
  'bundled', '{}'::jsonb, true, true, 100, kd.organization_id,
  jsonb_build_object(
    'note',
    'Explicit basic route (KINDS_EVERYWHERE_PLAN §10d-B3, 2026-08-23): registered so a node failure never reaches the reader by silent fallback. A bespoke failure view is the warranted UPGRADE of this same row.'
  )
from content_ir.kind_definition kd
where kd.deleted_at is null
  and kd.kind in ('node_error', 'field_problem')
on conflict (kind_definition_id, platform, role)
  where (is_default and deleted_at is null)
do update set
  component_key = excluded.component_key,
  source        = excluded.source,
  config        = excluded.config,
  is_active     = excluded.is_active,
  metadata      = excluded.metadata,
  updated_at    = now();

commit;
