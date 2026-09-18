import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("data routes put assistant runway on the real list-page scrollers", async () => {
  const [layout, listPage, createPage] = await Promise.all([
    source("app/(core)/data/layout.tsx"),
    source("app/(core)/data/page.tsx"),
    source("app/(core)/data/create/page.tsx"),
  ]);

  assert.doesNotMatch(
    layout,
    /scroll-page-end-space[^\n]*h-full[^\n]*overflow-y-auto/,
    "the shared data wrapper must not shrink every nested full-height workspace",
  );
  assert.match(
    listPage,
    /scroll-page-end-space[^\n]*h-full[^\n]*overflow-y-auto/,
    "the data list's actual scroll owner needs the shared runway",
  );
  assert.match(
    createPage,
    /scroll-page-end-space[^\n]*h-full[^\n]*overflow-y-auto/,
    "the create page's actual scroll owner needs the shared runway",
  );
});

test("the data assistant is limited to its natural-height routes", async () => {
  const [layout, launcher] = await Promise.all([
    source("app/(core)/data/layout.tsx"),
    source(
      "features/agents/components/ambient-assistant/ScrollAssistantLauncher.tsx",
    ),
  ]);

  assert.match(
    layout,
    /includePathnames=\{\["\/data", "\/data\/create"\]\}/,
    "the full-height dataset editor must opt out of the floating composer",
  );
  assert.match(launcher, /includePathnames\?: readonly string\[\]/);
  assert.match(launcher, /includePathnames\.includes\(pathname\)/);
  assert.match(launcher, /if \(!isIncludedPath \|\| isMobile/);
});
