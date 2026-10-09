// Self-test for check-server-trace-scope: it must flag each leak class it exists for, and pass a clean trace.
import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { inspectTraces, MAX_SOURCE_FILES } from "./check-server-trace-scope.mjs";

const root = "/repo";
const file = join(root, ".next/server/app/x/page.js.nft.json");
const rel = (p) => "../../../../" + p; // from .next/server/app/x/ back to the repo root

test("a clean trace passes", () => {
  assert.deepEqual(inspectTraces([{ file, files: [rel("node_modules/react/index.js"), rel(".next/server/chunks/a.js")] }], root), []);
});
test("migrations, docs, CLI scripts, typescript and eslint are flagged", () => {
  for (const p of ["migrations/a.sql", "docs/a.md", "scripts/findings/registry.mjs", "node_modules/typescript/lib/typescript.js", "node_modules/.pnpm/eslint@9.0.0/node_modules/eslint/lib/api.js"]) {
    assert.equal(inspectTraces([{ file, files: [rel(p)] }], root).length, 1, p);
  }
});
test("JSON data under scripts/ is allowed (the page reads data, not the CLI)", () => {
  assert.deepEqual(inspectTraces([{ file, files: [rel("scripts/findings/accept-rules.json")] }], root), []);
});
test("a whole source folder traced by a dynamic fs root is flagged", () => {
  const files = Array.from({ length: MAX_SOURCE_FILES + 1 }, (_, i) => rel(`app/(admin)/administration/p${i}/page.tsx`));
  assert.equal(inspectTraces([{ file, files }], root).length, 1);
});
