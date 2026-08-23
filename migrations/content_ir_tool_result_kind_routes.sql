-- content_ir_tool_result_kind_routes.sql
--
-- Registers the (kind, 'web', 'output') route for the 12 kinds minted by the
-- aidream TOOLS FAMILY SWEEP (aidream/docs/workflow/KIND_TOOL_LEDGER.md,
-- batches 1-2), unblocking their activation.
--
--   tool_bundle_listing                                  (43 bundle:list_* tools)
--   file_read_result · file_write_result                 (fs_read, fs_write)
--   directory_listing / directory_entry                  (fs_list)
--   file_search_results / file_search_match              (fs_search)
--   file_edit_result                                     (fs_edit)
--   file_patch_result / file_edit_applied / file_edit_failure   (fs_patch)
--   directory_create_result                              (fs_mkdir)
--
-- WHY generic_structured, EXPLICITLY (ledger rule 4). Every one of these is
-- maturity='placeholder': a tool result whose OUTER structure is captured
-- honestly and completely. The repo does own file-tree components
-- (features/files/components/core/FileTree, features/code/views/explorer) —
-- searched and rejected on purpose: they render cloud-file ROWS keyed by
-- file_id from the files domain, not a tool's `{path, entries[]}` payload, so
-- pointing them here would be a new integration wearing a reuse costume. The
-- generic structured renderer displays these five-to-eight-key shapes
-- correctly today; a bespoke view is the DISTILLATION pass's call, and it is an
-- UPGRADE of component_key on these same rows, not a second registration.
--
-- What matters is that the route is REGISTERED, not inferred: the resolver then
-- answers by:'db' instead of falling through applyIrKindRoute -> routeToGeneric
-- with marker by:'generic', unverified:true. No kind reaches a reader by silent
-- fallback.
--
-- Maturity is NOT touched (ledger rule 9) and neither is is_active: activation
-- is the dual gate's verdict, run separately after this lands. All 12 already
-- pass the structural leg (canonical example, validation_status='passed') and
-- fail ONLY the render leg, so this migration is the whole unblock.
--
-- Precedent copied exactly: migrations/content_ir_generic_structured_roots.sql.
-- Idempotent: conflicts are inferred on the real partial unique index
-- kind_component_default_unique.

begin;

insert into content_ir.kind_component (
  kind_definition_id, platform, role, component_key,
  source, config, is_default, is_active, sort_order, organization_id
)
select
  kd.id, 'web', 'output', 'generic_structured',
  'bundled', '{}'::jsonb, true, true, 100, kd.organization_id
from content_ir.kind_definition kd
where kd.kind in (
    'tool_bundle_listing',
    'file_read_result',
    'file_write_result',
    'directory_listing',
    'directory_entry',
    'file_search_results',
    'file_search_match',
    'file_edit_result',
    'file_patch_result',
    'file_edit_applied',
    'file_edit_failure',
    'directory_create_result'
  )
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
