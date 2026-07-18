-- ============================================================================
-- content_ir_register_candidate_kinds.sql
--
-- Registers the 7 crosswalk "unregistered shape candidates" as kinds:
--
--   chart · map · stats · diff              (ts-owned, client-splitter blocks)
--   search_results · fetch_results ·
--   categorization_result                   (python-owned, server data events)
--
-- NON-BREAKING BY LAW (Arman ruling, 2026-07-15 adoption push): registration
-- gives these blocks identity/validation/coverage ONLY. Nothing about how they
-- render or stream changes; NO kind_surface rows are added — the client four
-- arrive via the markdown splitter (```chart / ```map / ```stats / ```diff
-- fences) and the server three arrive as typed data events, exactly as before.
-- All 7 seed INACTIVE: none can pass the dual gate's render leg (no compiled
-- KindDefinition bridge produces serverData for them — their renderers consume
-- the raw block content, not kind-route serverData), and activation without a
-- proven kind route would be a lie. Activation stays owned by `shape:activate`.
--
-- Schema provenance (byte-honest, validated before this file was written):
--   * chart/map/stats/diff: KindSchema authored from the SHIPPED parsers
--     (chart-spec.ts parseChartSpec, MapBlock parseMap, StatsBlock parseStats,
--     DiffBlock parseDiff); emitted_block_schema / emitted_json_schema are
--     CONVERTER-EMITTED (kindSchemaToJsonSchema over kindSchemaToStorage) —
--     never hand-written. Repeatable-JSON list fields whose items the parsers
--     accept with wide synonym tolerance (chart.data/series, map.markers,
--     stats.stats) are `json[]` with the item contract in the description —
--     honest to the tolerant parsers, no fabricated nested kinds.
--   * search_results/fetch_results/categorization_result: verbatim
--     Model.model_json_schema() from matrx_connect.context.data_types
--     (SearchResultsData / FetchResultsData / CategorizationResultData);
--     data[] and emitted_block_schema stay NULL per the python-owned precedent
--     (http_response et al). The wire `type` discriminator is part of the
--     schema; `__kind` is stripped by the gate on validation.
--   * Every canonical example passed the PRODUCTION structural leg
--     (validateStructuralLeg, ajv Draft2020-12) against its live
--     emitted_json_schema, with a negative control confirmed to FAIL. The
--     chart example additionally parses through the real parseChartSpec.
--
-- RELATED RULING (encoded in the crosswalk + aidream envelope.py, not here):
-- `table` stays scalar_generic FOREVER — markdown-first + click-to-convert
-- (ratified 2026-07-15); it is deliberately NOT in this migration.
--
-- Version-bump trap: platform._touch_row bumps kind_definition.version on any
-- UPDATE, stranding version-bound kind_example rows. This file therefore
-- performs NO UPDATEs — it is insert-only (guarded INSERT ... WHERE NOT
-- EXISTS), and the example inserts read kd.version in the same transaction,
-- so a fresh apply pins each canonical example at its definition's version.
--
-- Idempotent: re-apply is a no-op (never flips is_active, never bumps version).
-- ============================================================================

BEGIN;

-- ── 1. kind_definition: ts-owned client four ────────────────────────────────

WITH def(kind, label, data, block_schema, json_schema, description) AS (
  VALUES
    (
      'chart', 'Chart',
      $mtx$[{"name":"type","required":true,"description":"Chart form. The renderer also accepts synonyms (column, histogram, spline, donut, bubble, ...) and defaults to bar.","type":"enum","values":["bar","line","area","pie","scatter"],"open":true},{"name":"title","description":"Header label above the chart.","type":"string"},{"name":"x","description":"Category field name for cartesian charts (bar/line/area/scatter); inferred from the first string field when omitted.","type":"string"},{"name":"y","description":"Numeric series field names to plot; inferred from numeric fields when omitted. The renderer also accepts a single string.","type":"string[]"},{"name":"series","description":"Optional per-series metadata objects { key, label?, color? } overriding labels/palette.","type":"json[]"},{"name":"data","required":true,"description":"The rows: a non-empty array of objects keyed by the x/series field names. Pie rows use { label, value }.","type":"json[]"},{"name":"stacked","description":"Stack the series (bar/area).","type":"boolean"}]$mtx$::jsonb,
      $mtx${"type":"object","properties":{"type":{"anyOf":[{"type":"string","enum":["bar","line","area","pie","scatter"]},{"type":"string"}],"description":"Chart form. The renderer also accepts synonyms (column, histogram, spline, donut, bubble, ...) and defaults to bar."},"title":{"type":"string","description":"Header label above the chart."},"x":{"type":"string","description":"Category field name for cartesian charts (bar/line/area/scatter); inferred from the first string field when omitted."},"y":{"type":"array","items":{"type":"string"},"description":"Numeric series field names to plot; inferred from numeric fields when omitted. The renderer also accepts a single string."},"series":{"type":"array","items":{},"description":"Optional per-series metadata objects { key, label?, color? } overriding labels/palette."},"data":{"type":"array","items":{},"description":"The rows: a non-empty array of objects keyed by the x/series field names. Pie rows use { label, value }."},"stacked":{"type":"boolean","description":"Stack the series (bar/area)."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","enum":["chart"]}},"required":["__kind","type","data"]}$mtx$::jsonb,
      $mtx${"type":"object","properties":{"type":{"anyOf":[{"type":"string","enum":["bar","line","area","pie","scatter"]},{"type":"string"}],"description":"Chart form. The renderer also accepts synonyms (column, histogram, spline, donut, bubble, ...) and defaults to bar."},"title":{"type":"string","description":"Header label above the chart."},"x":{"type":"string","description":"Category field name for cartesian charts (bar/line/area/scatter); inferred from the first string field when omitted."},"y":{"type":"array","items":{"type":"string"},"description":"Numeric series field names to plot; inferred from numeric fields when omitted. The renderer also accepts a single string."},"series":{"type":"array","items":{},"description":"Optional per-series metadata objects { key, label?, color? } overriding labels/palette."},"data":{"type":"array","items":{},"description":"The rows: a non-empty array of objects keyed by the x/series field names. Pie rows use { label, value }."},"stacked":{"type":"boolean","description":"Stack the series (bar/area)."}},"required":["type","data"]}$mtx$::jsonb,
      'Data chart (recharts) from a small JSON spec: type + rows, optional x/y/series/stacked. Arrives via the ```chart fence through the markdown splitter and renders with ChartBlock. Registered for identity/validation/coverage only — no __kind detection surface (splitter-owned arrival, non-breaking adoption ruling 2026-07-15).'
    ),
    (
      'map', 'Map',
      $mtx$[{"name":"title","description":"Header label above the map.","type":"string"},{"name":"center","description":"[lat, lng] initial center; auto-fit to markers when omitted.","type":"number[]"},{"name":"zoom","description":"Initial zoom level.","type":"number"},{"name":"markers","required":true,"description":"Marker objects { lat, lng, label?, description? }. The renderer also accepts a `places` alias and lat/latitude, lng/lon/longitude, coordinates:[lat,lng] synonyms; at least one resolvable {lat,lng} point is required.","type":"json[]"}]$mtx$::jsonb,
      $mtx${"type":"object","properties":{"title":{"type":"string","description":"Header label above the map."},"center":{"type":"array","items":{"type":"number"},"description":"[lat, lng] initial center; auto-fit to markers when omitted."},"zoom":{"type":"number","description":"Initial zoom level."},"markers":{"type":"array","items":{},"description":"Marker objects { lat, lng, label?, description? }. The renderer also accepts a `places` alias and lat/latitude, lng/lon/longitude, coordinates:[lat,lng] synonyms; at least one resolvable {lat,lng} point is required."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","enum":["map"]}},"required":["__kind","markers"]}$mtx$::jsonb,
      $mtx${"type":"object","properties":{"title":{"type":"string","description":"Header label above the map."},"center":{"type":"array","items":{"type":"number"},"description":"[lat, lng] initial center; auto-fit to markers when omitted."},"zoom":{"type":"number","description":"Initial zoom level."},"markers":{"type":"array","items":{},"description":"Marker objects { lat, lng, label?, description? }. The renderer also accepts a `places` alias and lat/latitude, lng/lon/longitude, coordinates:[lat,lng] synonyms; at least one resolvable {lat,lng} point is required."}},"required":["markers"]}$mtx$::jsonb,
      'Interactive Leaflet map from a JSON spec of markers/places (itineraries, store locators). Arrives via the ```map fence through the markdown splitter and renders with MapBlock. Registered for identity/validation/coverage only — no __kind detection surface (splitter-owned arrival, non-breaking adoption ruling 2026-07-15).'
    ),
    (
      'stats', 'Stats',
      $mtx$[{"name":"title","description":"Header label above the KPI grid.","type":"string"},{"name":"stats","required":true,"description":"Non-empty array of metric objects { label, value, change?, trend?('up'|'down'|'flat'), hint? }. trend is inferred from a signed change when omitted; label/name and value/amount/count synonyms accepted.","type":"json[]"}]$mtx$::jsonb,
      $mtx${"type":"object","properties":{"title":{"type":"string","description":"Header label above the KPI grid."},"stats":{"type":"array","items":{},"description":"Non-empty array of metric objects { label, value, change?, trend?('up'|'down'|'flat'), hint? }. trend is inferred from a signed change when omitted; label/name and value/amount/count synonyms accepted."},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","enum":["stats"]}},"required":["__kind","stats"]}$mtx$::jsonb,
      $mtx${"type":"object","properties":{"title":{"type":"string","description":"Header label above the KPI grid."},"stats":{"type":"array","items":{},"description":"Non-empty array of metric objects { label, value, change?, trend?('up'|'down'|'flat'), hint? }. trend is inferred from a signed change when omitted; label/name and value/amount/count synonyms accepted."}},"required":["stats"]}$mtx$::jsonb,
      'KPI / headline-metric cards from a JSON spec of stats (big value, label, colored up/down delta). Arrives via the ```stats fence through the markdown splitter and renders with StatsBlock. Registered for identity/validation/coverage only — no __kind detection surface (splitter-owned arrival, non-breaking adoption ruling 2026-07-15).'
    ),
    (
      'diff', 'Diff',
      $mtx$[{"name":"title","description":"Header label above the diff.","type":"string"},{"name":"old","description":"The before text. At least one of old/new must be non-empty; the renderer also accepts before/original/left synonyms.","type":"string"},{"name":"new","description":"The after text. At least one of old/new must be non-empty; the renderer also accepts after/updated/modified/right synonyms.","type":"string"},{"name":"split","description":"Side-by-side (true, default) vs unified view.","default":true,"type":"boolean"}]$mtx$::jsonb,
      $mtx${"type":"object","properties":{"title":{"type":"string","description":"Header label above the diff."},"old":{"type":"string","description":"The before text. At least one of old/new must be non-empty; the renderer also accepts before/original/left synonyms."},"new":{"type":"string","description":"The after text. At least one of old/new must be non-empty; the renderer also accepts after/updated/modified/right synonyms."},"split":{"type":"boolean","description":"Side-by-side (true, default) vs unified view.","default":true},"__kind":{"type":"string","description":"Block discriminator for render pipeline.","enum":["diff"]}},"required":["__kind"]}$mtx$::jsonb,
      $mtx${"type":"object","properties":{"title":{"type":"string","description":"Header label above the diff."},"old":{"type":"string","description":"The before text. At least one of old/new must be non-empty; the renderer also accepts before/original/left synonyms."},"new":{"type":"string","description":"The after text. At least one of old/new must be non-empty; the renderer also accepts after/updated/modified/right synonyms."},"split":{"type":"boolean","description":"Side-by-side (true, default) vs unified view.","default":true}},"required":[]}$mtx$::jsonb,
      'Before/after text diff from a JSON spec { old, new, title?, split? } (edits, refactors, revisions). Arrives via the ```diff fence through the markdown splitter and renders with DiffBlock. Registered for identity/validation/coverage only — no __kind detection surface (splitter-owned arrival, non-breaking adoption ruling 2026-07-15).'
    )
)
INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema,
   is_active, visibility, organization_id, metadata)
SELECT
  d.kind, d.label, 'ts', d.data, d.block_schema, d.json_schema,
  false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
  jsonb_build_object('category', 'pure', 'description', d.description)
FROM def d
WHERE NOT EXISTS (
  SELECT 1 FROM content_ir.kind_definition kd
  WHERE kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND kd.kind = d.kind AND kd.deleted_at IS NULL
);

-- ── 2. kind_definition: python-owned server three ───────────────────────────

WITH def(kind, label, json_schema, description) AS (
  VALUES
    (
      'search_results', 'Search Results',
      $mtx${"$defs":{"SearchResultItem":{"additionalProperties":true,"description":"One result entry from a web search.","properties":{"published":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"title":"Published"},"snippet":{"default":"","title":"Snippet","type":"string"},"source":{"anyOf":[{"type":"string"},{"type":"null"}],"default":null,"title":"Source"},"title":{"default":"","title":"Title","type":"string"},"url":{"default":"","title":"Url","type":"string"}},"title":"SearchResultItem","type":"object"}},"additionalProperties":false,"properties":{"metadata":{"additionalProperties":true,"title":"Metadata","type":"object"},"results":{"items":{"$ref":"#/$defs/SearchResultItem"},"title":"Results","type":"array"},"type":{"const":"search_results","default":"search_results","title":"Type","type":"string"}},"title":"SearchResultsData","type":"object"}$mtx$::jsonb,
      'Web search results data event (matrx_connect SearchResultsData: metadata + results[{url,title,snippet,published?,source?}]). Schema is the verbatim pydantic model_json_schema(). Rendered by the FE search-results data-event block; registered for identity/validation/coverage only — arrival stays the typed data-event path (non-breaking adoption ruling 2026-07-15).'
    ),
    (
      'fetch_results', 'Fetch Results',
      $mtx${"$defs":{"FetchResultItem":{"additionalProperties":true,"properties":{"content":{"default":"","title":"Content","type":"string"},"status":{"default":"","title":"Status","type":"string"},"title":{"default":"","title":"Title","type":"string"},"url":{"default":"","title":"Url","type":"string"}},"title":"FetchResultItem","type":"object"}},"additionalProperties":false,"properties":{"metadata":{"additionalProperties":true,"title":"Metadata","type":"object"},"results":{"items":{"$ref":"#/$defs/FetchResultItem"},"title":"Results","type":"array"},"type":{"const":"fetch_results","default":"fetch_results","title":"Type","type":"string"}},"title":"FetchResultsData","type":"object"}$mtx$::jsonb,
      'URL fetch results data event (matrx_connect FetchResultsData: metadata + results[{url,title,content,status}]). Schema is the verbatim pydantic model_json_schema(). Rendered by the FE fetch-results data-event block; registered for identity/validation/coverage only — arrival stays the typed data-event path (non-breaking adoption ruling 2026-07-15).'
    ),
    (
      'categorization_result', 'Categorization Result',
      $mtx${"additionalProperties":false,"properties":{"category":{"title":"Category","type":"string"},"description":{"default":"","title":"Description","type":"string"},"dry_run":{"default":false,"title":"Dry Run","type":"boolean"},"metadata":{"additionalProperties":true,"title":"Metadata","type":"object"},"prompt_id":{"title":"Prompt Id","type":"string"},"tags":{"items":{"type":"string"},"title":"Tags","type":"array"},"type":{"const":"categorization_result","default":"categorization_result","title":"Type","type":"string"}},"required":["prompt_id","category"],"title":"CategorizationResultData","type":"object"}$mtx$::jsonb,
      'Prompt categorization result data event (matrx_connect CategorizationResultData: prompt_id + category + tags/description/dry_run/metadata). Schema is the verbatim pydantic model_json_schema(). Rendered by the FE categorization data-event block; registered for identity/validation/coverage only — arrival stays the typed data-event path (non-breaking adoption ruling 2026-07-15).'
    )
)
INSERT INTO content_ir.kind_definition
  (kind, label, authoring_owner, data, emitted_block_schema, emitted_json_schema,
   is_active, visibility, organization_id, metadata)
SELECT
  d.kind, d.label, 'python', NULL, NULL, d.json_schema,
  false, 'public', '39c38960-d30c-4840-b0c1-c9960de95582',
  jsonb_build_object('category', 'pure', 'description', d.description)
FROM def d
WHERE NOT EXISTS (
  SELECT 1 FROM content_ir.kind_definition kd
  WHERE kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
    AND kd.kind = d.kind AND kd.deleted_at IS NULL
);

-- ── 3. Canonical examples (R4) — one per kind, REAL-validated ───────────────

WITH sample(kind, label, data) AS (
  VALUES
    ('chart', 'Canonical example — grouped bar chart',
     $mtx${"__kind":"chart","type":"bar","title":"Quarterly revenue","x":"quarter","y":["revenue","profit"],"data":[{"quarter":"Q1","revenue":120,"profit":30},{"quarter":"Q2","revenue":150,"profit":42},{"quarter":"Q3","revenue":170,"profit":55},{"quarter":"Q4","revenue":210,"profit":61}],"stacked":false}$mtx$::jsonb),
    ('map', 'Canonical example — marker itinerary',
     $mtx${"__kind":"map","title":"Portland coffee crawl","center":[45.5231,-122.6765],"zoom":13,"markers":[{"lat":45.5202,"lng":-122.6742,"label":"Stumptown","description":"Original downtown roastery."},{"lat":45.5266,"lng":-122.6819,"label":"Barista","description":"Pearl District pour-over bar."}]}$mtx$::jsonb),
    ('stats', 'Canonical example — KPI grid',
     $mtx${"__kind":"stats","title":"July pipeline","stats":[{"label":"MRR","value":"$48.2K","change":"+12%","trend":"up"},{"label":"Active users","value":"1,204","change":"+86","trend":"up"},{"label":"Churn","value":"2.1%","change":"-0.4%","trend":"down","hint":"Rolling 30 days"}]}$mtx$::jsonb),
    ('diff', 'Canonical example — copy edit',
     $mtx${"__kind":"diff","title":"Tighten the intro","old":"Our platform is a tool that can help teams to be more productive.","new":"Matrx makes teams faster.","split":true}$mtx$::jsonb),
    ('search_results', 'Canonical example — two web results',
     $mtx${"__kind":"search_results","type":"search_results","metadata":{"query":"postgres row level security best practices","provider":"brave"},"results":[{"url":"https://supabase.com/docs/guides/auth/row-level-security","title":"Row Level Security | Supabase Docs","snippet":"Secure your data using Postgres Row Level Security.","published":null,"source":"supabase.com"},{"url":"https://www.postgresql.org/docs/current/ddl-rowsecurity.html","title":"PostgreSQL: Documentation: Row Security Policies","snippet":"Tables can have row security policies that restrict rows visible or modifiable per user.","published":"2025-11-20","source":"postgresql.org"}]}$mtx$::jsonb),
    ('fetch_results', 'Canonical example — one fetched page',
     $mtx${"__kind":"fetch_results","type":"fetch_results","metadata":{"requested":1},"results":[{"url":"https://example.com/pricing","title":"Pricing — Example","content":"# Pricing\n\nStarter: $9/mo. Team: $29/mo. Enterprise: contact us.","status":"success"}]}$mtx$::jsonb),
    ('categorization_result', 'Canonical example — prompt categorized',
     $mtx${"__kind":"categorization_result","type":"categorization_result","prompt_id":"b7f6a1e2-4c3d-4f5a-9b8c-1d2e3f4a5b6c","category":"marketing_copy","tags":["landing-page","b2b"],"description":"Prompt asks for landing-page hero copy for a B2B SaaS product.","dry_run":false,"metadata":{"model":"categorizer-v2"}}$mtx$::jsonb)
)
INSERT INTO content_ir.kind_example
  (kind_definition_id, kind_version, data, label, source, is_canonical,
   validation_status, validated_at, organization_id)
SELECT
  kd.id, kd.version, s.data, s.label, 'authored', true, 'passed', now(),
  '39c38960-d30c-4840-b0c1-c9960de95582'
FROM sample s
JOIN content_ir.kind_definition kd
  ON kd.kind = s.kind
 AND kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
 AND kd.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM content_ir.kind_example e
  WHERE e.kind_definition_id = kd.id AND e.is_canonical AND e.deleted_at IS NULL
);

COMMIT;
