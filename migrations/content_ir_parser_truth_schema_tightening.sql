-- ============================================================================
-- content_ir_parser_truth_schema_tightening.sql
--
-- Aligns the four ts-owned candidate-kind schemas (chart / diff / stats / map,
-- registered by content_ir_register_candidate_kinds.sql) with their SHIPPED
-- parsers' real behavior — the schemas were stricter than the parsers in one
-- place and looser in three:
--
--   * chart — `type` was REQUIRED but parseChartSpec (chart-spec.ts) accepts a
--     missing type (defaults to "bar") and also reads a `chartType` alias key.
--     `type` drops out of required (json + block schema); its description now
--     documents the default and the alias. The alias stays description-only:
--     the KindSchema vocabulary has no cheap alias construct, and the schema
--     is non-strict (no additionalProperties:false) so a `chartType` payload
--     already validates. `data` additionally gains minItems:1 — the parser
--     rejects an empty rows array.
--   * diff — the schema required NOTHING, but parseDiff (DiffBlock.tsx)
--     rejects a payload with none of the before/after keys. A top-level anyOf
--     now requires at least one of the parser-accepted keys
--     (old/before/original/left | new/after/updated/modified/right).
--   * stats — `stats` gains minItems:1 (parseStats rejects an empty array).
--   * map — `markers` gains minItems:1 (parseMap needs >= 1 resolvable point).
--
-- HAND-TIGHTENED ON TOP OF THE CONVERTER OUTPUT (documented deviation from
-- the register migration's "converter-emitted, never hand-written" rule):
-- minItems and the diff cross-field anyOf are parser-truth constraints the
-- KindSchema field vocabulary cannot express (json[] has no minItems; there is
-- no cross-field construct). The doctor / dual gate consume
-- emitted_json_schema via ajv directly and never recompute it from `data`, so
-- the extra constraints are safe and honest. chart's `data` (KindSchema) is
-- updated in the same statement so the field model agrees on `type` being
-- optional.
--
-- Version-bump trap: platform._touch_row bumps kind_definition.version on
-- each UPDATE (one UPDATE per kind ⇒ exactly one bump), stranding the
-- version-bound canonical kind_example rows. After applying, re-bind them
-- with `pnpm shape:revalidate --apply` (real ajv re-validation — every one of
-- the four canonical examples passes the tightened schemas) and verify
-- kind_version = the new definition version with validation_status='passed'.
--
-- Idempotent: every UPDATE is guarded on the pre-fix schema shape; re-apply
-- is a no-op (no double version bumps).
--
-- NOTE (correction to the register migration's header): that file is
-- insert-only — its "freshness UPDATEs" paragraph described a draft that was
-- cut before landing; the header has been fixed in-place (ledger checksum
-- updated in the same change).
-- ============================================================================

BEGIN;

-- ── chart: `type` optional (default bar, chartType alias), data minItems 1 ──

UPDATE content_ir.kind_definition
SET
  emitted_json_schema = $mtx${"type":"object","properties":{"type":{"anyOf":[{"type":"string","enum":["bar","line","area","pie","scatter"]},{"type":"string"}],"description":"Chart form. Optional - defaults to bar when omitted; the renderer also accepts a `chartType` alias key and synonyms (column, histogram, spline, donut, bubble, ...)."},"title":{"type":"string","description":"Header label above the chart."},"x":{"type":"string","description":"Category field name for cartesian charts (bar/line/area/scatter); inferred from the first string field when omitted."},"y":{"type":"array","items":{"type":"string"},"description":"Numeric series field names to plot; inferred from numeric fields when omitted. The renderer also accepts a single string."},"series":{"type":"array","items":{},"description":"Optional per-series metadata objects { key, label?, color? } overriding labels/palette."},"data":{"type":"array","items":{},"minItems":1,"description":"The rows: a non-empty array of objects keyed by the x/series field names. Pie rows use { label, value }."},"stacked":{"type":"boolean","description":"Stack the series (bar/area)."}},"required":["data"]}$mtx$::jsonb,
  emitted_block_schema = $mtx${"type":"object","properties":{"type":{"anyOf":[{"type":"string","enum":["bar","line","area","pie","scatter"]},{"type":"string"}],"description":"Chart form. Optional - defaults to bar when omitted; the renderer also accepts a `chartType` alias key and synonyms (column, histogram, spline, donut, bubble, ...)."},"title":{"type":"string","description":"Header label above the chart."},"x":{"type":"string","description":"Category field name for cartesian charts (bar/line/area/scatter); inferred from the first string field when omitted."},"y":{"type":"array","items":{"type":"string"},"description":"Numeric series field names to plot; inferred from numeric fields when omitted. The renderer also accepts a single string."},"series":{"type":"array","items":{},"description":"Optional per-series metadata objects { key, label?, color? } overriding labels/palette."},"data":{"type":"array","items":{},"minItems":1,"description":"The rows: a non-empty array of objects keyed by the x/series field names. Pie rows use { label, value }."},"stacked":{"type":"boolean","description":"Stack the series (bar/area)."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","enum":["chart"]}},"required":["__kind","data"]}$mtx$::jsonb,
  data = $mtx$[{"name":"type","description":"Chart form. Optional - defaults to bar when omitted; the renderer also accepts a `chartType` alias key and synonyms (column, histogram, spline, donut, bubble, ...).","type":"enum","values":["bar","line","area","pie","scatter"],"open":true},{"name":"title","description":"Header label above the chart.","type":"string"},{"name":"x","description":"Category field name for cartesian charts (bar/line/area/scatter); inferred from the first string field when omitted.","type":"string"},{"name":"y","description":"Numeric series field names to plot; inferred from numeric fields when omitted. The renderer also accepts a single string.","type":"string[]"},{"name":"series","description":"Optional per-series metadata objects { key, label?, color? } overriding labels/palette.","type":"json[]"},{"name":"data","required":true,"description":"The rows: a non-empty array of objects keyed by the x/series field names. Pie rows use { label, value }.","type":"json[]"},{"name":"stacked","description":"Stack the series (bar/area).","type":"boolean"}]$mtx$::jsonb
WHERE kind = 'chart'
  AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND deleted_at IS NULL
  AND emitted_json_schema->'required' ? 'type';

-- ── diff: at least one parser-accepted before/after key must be present ─────

UPDATE content_ir.kind_definition
SET
  emitted_json_schema = emitted_json_schema
    || $mtx${"anyOf":[{"required":["old"]},{"required":["new"]},{"required":["before"]},{"required":["after"]},{"required":["original"]},{"required":["updated"]},{"required":["modified"]},{"required":["left"]},{"required":["right"]}]}$mtx$::jsonb,
  emitted_block_schema = emitted_block_schema
    || $mtx${"anyOf":[{"required":["old"]},{"required":["new"]},{"required":["before"]},{"required":["after"]},{"required":["original"]},{"required":["updated"]},{"required":["modified"]},{"required":["left"]},{"required":["right"]}]}$mtx$::jsonb
WHERE kind = 'diff'
  AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND deleted_at IS NULL
  AND NOT (emitted_json_schema ? 'anyOf');

-- ── stats: stats array must be non-empty ────────────────────────────────────

UPDATE content_ir.kind_definition
SET
  emitted_json_schema = jsonb_set(emitted_json_schema, '{properties,stats,minItems}', '1'),
  emitted_block_schema = jsonb_set(emitted_block_schema, '{properties,stats,minItems}', '1')
WHERE kind = 'stats'
  AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND deleted_at IS NULL
  AND emitted_json_schema #> '{properties,stats,minItems}' IS NULL;

-- ── map: markers array must be non-empty ────────────────────────────────────

UPDATE content_ir.kind_definition
SET
  emitted_json_schema = jsonb_set(emitted_json_schema, '{properties,markers,minItems}', '1'),
  emitted_block_schema = jsonb_set(emitted_block_schema, '{properties,markers,minItems}', '1')
WHERE kind = 'map'
  AND organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND deleted_at IS NULL
  AND emitted_json_schema #> '{properties,markers,minItems}' IS NULL;

COMMIT;
