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
    assert.match(page, /copy=\{false\}/);
    assert.match(page, /detail=\{\{ enabled: false \}\}/);
    assert.match(page, /window=\{\{ enabled: false \}\}/);
  });
}

test("Artifacts keeps canvas-first open and a modifier-clickable detail URL", () => {
  const page = source("features/artifacts/components/CmsArtifactList.tsx");
  assert.match(page, /onRowOpen=\{handleOpen\}/);
  assert.match(page, /getRowHref=\{\(artifact\) => `\/artifacts\/\$\{artifact\.id\}`\}/);
  assert.match(page, /answeredBy: "client"/);
});

test("AI model tables retain settled usage and provider row actions", () => {
  const deprecated = source("features/ai-models/components/DeprecatedModelsAudit.tsx");
  const provider = source("features/ai-models/components/ProviderSyncDashboard.tsx");
  assert.match(deprecated, /entries\.every\(\(e\) => !e\.loading\)/);
  assert.match(deprecated, /handleBulkReplace/);
  assert.match(deprecated, /Promise\.allSettled/);
  assert.match(provider, /ProviderSyncRowCopyForAiButton/);
  assert.match(provider, /Sync Now/);
  assert.match(provider, /selectedComparison/);
});
