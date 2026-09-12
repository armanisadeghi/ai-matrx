import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const routeLayout = readFileSync(
  new URL("../../../../app/(core)/notes/layout.tsx", import.meta.url),
  "utf8",
);
const editorCore = readFileSync(new URL("../NoteEditorCore.tsx", import.meta.url), "utf8");

test("Notes reserves assistant clearance on terminal content scrollers, not the route shell", () => {
  assert.doesNotMatch(
    routeLayout,
    /scroll-page-end-space notes-root/,
    "the full-height route shell must not become a padded second scroll region",
  );
  assert.match(
    editorCore,
    /const bottomPad = embedded \? "pb-6" : "pb-\[85dvh\]"/,
    "full-page editor and preview owners must reserve enough room to clear the dock",
  );
  assert.match(editorCore, /"h-full overflow-y-auto max-w-3xl/);
});
