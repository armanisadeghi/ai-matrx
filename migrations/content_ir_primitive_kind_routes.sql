-- content_ir_primitive_kind_routes.sql
--
-- Army: FE kind component routes — the PRIMITIVE kinds
-- (docs/KIND_COMPONENT_LEDGER.md, claim `copy-D`).
--
-- Eight active, non-contract-artifact kinds had NO `(kind, 'web', 'output')`
-- row in content_ir.kind_component, so every one of them reached the generic
-- viewer by SILENT FALLBACK — `applyIrKindRoute` → `routeToGeneric`, marker
-- `by:'generic', unverified:true`:
--
--   boolean · number · text · string_list · json     (bare scalars / arrays)
--   items · value · table_rows                       (archetype objects)
--
-- These are the workflow I/O primitives emitted by the Python engine
-- (`authoring_owner = 'python'`). REUSE was checked first and there is
-- nothing to reuse: no component in the repo renders "a number", "a string",
-- or the `{archetype, value}` / `{archetype, items}` / `TableLookupOutput`
-- envelopes. Nor should there be — a bespoke renderer for a boolean is the
-- opposite of the reuse-first rule. The platform ALREADY has the right
-- renderer for exactly this: `StructuredValueView`, reached through
-- `generic_structured` (components/mardown-display/blocks/generic/
-- GenericStructuredBlock.tsx).
--
-- So this migration does ONE thing per kind: registers
--   (kind, 'web', 'output') -> 'generic_structured', source='bundled'
-- making the route EXPLICIT — a decision on the record, resolved by the
-- registry (marker `by:'db'`), instead of a fallback nobody chose. Same
-- pixels, honest provenance. Precedent, followed exactly:
-- migrations/content_ir_generic_structured_roots.sql.
--
-- NOT DONE here, deliberately:
--   * kind_example — all eight already carry a canonical example with
--     validation_status='passed'; nothing to author.
--   * kind_definition.is_active — untouched. Activation is the dual gate's
--     verdict, owned by `content_ir.set_kind_activation`.
--   * metadata.maturity — untouched. Registering a basic FE route does NOT
--     promote maturity (KINDS_EVERYWHERE_PLAN.md §7.8); `verified` is the
--     verification pass's to award, and only after a real end-to-end render.
--
-- Idempotent: re-running is safe (conflict inferred on the real partial
-- unique index kind_component_default_unique).

BEGIN;

INSERT INTO content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source,
   config, is_default, is_active, sort_order, organization_id)
SELECT d.id, 'web', 'output', 'generic_structured', 'bundled',
       '{}'::jsonb, true, true, 100, d.organization_id
FROM content_ir.kind_definition d
WHERE d.kind IN ('boolean', 'number', 'text', 'string_list', 'json',
                 'items', 'value', 'table_rows')
  AND d.is_active
  AND d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM content_ir.kind_component c
    WHERE c.kind_definition_id = d.id
      AND c.platform = 'web' AND c.role = 'output'
      AND c.deleted_at IS NULL
  );

COMMIT;
