import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

// 2026-10-04: /data is the record store (moved from data-v2). Its pages are full-height app
// screens with their own page assistant, so the layout adds no wrapper and no floating composer.
test("the /data layout mounts the record-store pages as they are", async () => {
  const layout = await source("app/(core)/data/layout.tsx");
  assert.doesNotMatch(layout, /scroll-page-end-space/, "no shared runway shrinks a full-height page");
  assert.doesNotMatch(layout, /ScrollAssistantLauncher/, "no floating composer over the grid");
  assert.match(layout, /TablesLanding/, "a signed-out visitor still gets the Tables landing");
});
