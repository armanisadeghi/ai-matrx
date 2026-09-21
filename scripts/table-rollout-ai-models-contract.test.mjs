import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const source = (path) => readFileSync(new URL(path, root), "utf8");

for (const [label, path] of [
  ["Artifacts", "features/artifacts/components/CmsArtifactList.tsx"],
  ["Deprecated audit", "features/ai-models/components/DeprecatedModelsAudit.tsx"],
  ["Provider sync", "features/ai-models/components/ProviderSyncDashboard.tsx"],
]) {
  test(`${label} uses the canonical table rather than a raw table`, () => {
    const page = source(path);
    assert.match(page, /<MatrxDataTable/);
    assert.doesNotMatch(page, /<table/);
    assert.doesNotMatch(page, /false &&/);
    assert.match(page, /copy=\{false\}/);
    assert.match(page, /detail=\{\{ enabled: false \}\}/);
    assert.match(page, /window=\{\{ enabled: false \}\}/);
  });
}

test("Artifacts keeps canvas-first open and a modifier-clickable detail URL", () => {
  const page = source("features/artifacts/components/CmsArtifactList.tsx");
  assert.match(page, /const navigationPending = navigatingId !== null/);
  assert.match(page, /onRowOpen=\{\(artifact\) => \{ if \(!navigationPending\) handleOpen\(artifact\); \}\}/);
  assert.match(page, /getRowHref=\{\(artifact\) => `\/artifacts\/\$\{artifact\.id\}`\}/);
  assert.match(page, /answeredBy: "client"/);
  assert.match(page, /title="Edit content"/);
  assert.match(page, /pointer-events-none opacity-60/);
  assert.match(page, /navigatingId === artifact\.id.*Loader2/);
  assert.match(page, /disabled=\{navigationPending\}/);
  assert.doesNotMatch(page, /ArtifactRow/);
});

test("AI model tables retain settled usage and provider row actions", () => {
  const deprecated = source("features/ai-models/components/DeprecatedModelsAudit.tsx");
  const provider = source("features/ai-models/components/ProviderSyncDashboard.tsx");
  assert.match(deprecated, /entries\.every\(\(e\) => !e\.loading\)/);
  assert.match(deprecated, /handleBulkReplace/);
  assert.match(deprecated, /Promise\.allSettled/);
  assert.match(deprecated, /Couldn(?:.t|&apos;t) replace/);
  assert.match(deprecated, /title: "Deprecated models"/);
  assert.match(deprecated, /searchPlaceholder: "Search model name, identifier, or provider…"/);
  assert.match(deprecated, /mode: "controlled-local"/);
  assert.match(deprecated, /id: "deprecated-model-filters"/);
  assert.match(deprecated, /id: "identifier"/);
  assert.match(deprecated, /searchText: \(entry(?:: DeprecatedEntry)?\)/);
  assert.doesNotMatch(deprecated, /hidePagination/);
  assert.match(deprecated, /PopoverContent align="start" className="w-80 space-y-3"/);
  assert.match(provider, /ProviderSyncRowCopyForAiButton/);
  assert.match(provider, /Sync Now/);
  assert.match(provider, /selectedComparison/);
  assert.match(deprecated, /defaultSort=\{\{ id: "total", direction: "desc" \}\}/);
  assert.match(deprecated, /defaultSortDirection: "desc"/);
  assert.doesNotMatch(deprecated, /sortBy|sortDir|handleToggleSort/);
  assert.match(provider, /data=\{comparisons\}/);
  assert.match(provider, /defaultSort=\{\{ id: "released", direction: "desc" \}\}/);
  assert.match(provider, /sortValue: \(comparison\) => STATUS_SORT_ORDER\[comparison\.status\]/);
  assert.match(provider, /id: "input_price"/);
  assert.match(provider, /id: "output_price"/);
  assert.match(provider, /id: "cached_input_price"/);
  assert.match(provider, /id: "usage_basis"/);
  assert.match(provider, /id: "provider_input_price"/);
  assert.match(provider, /id: "provider_output_price"/);
  assert.match(provider, /id: "provider_cached_input_price"/);
  assert.match(provider, /function PriceValueCell/);
  assert.match(provider, /function ProviderPriceValueCell/);
  assert.doesNotMatch(provider, /sortKey|sortDir|toggleSort|sortedComparisons/);
});
