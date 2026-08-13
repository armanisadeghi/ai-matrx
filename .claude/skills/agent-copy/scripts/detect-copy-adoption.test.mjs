import assert from "node:assert/strict";
import test from "node:test";

import { classifySource } from "./detect-copy-adoption.mjs";

function status(file, source) {
  return classifySource(file, source)[0]?.status;
}

test("direct table copy config is compliant", () => {
  assert.equal(
    status(
      "features/example/Table.tsx",
      "<MatrxDataTable data={rows} copy={copy} />",
    ),
    "compliant",
  );
});

test("existing whole-list and row AI controls are equivalent", () => {
  assert.equal(
    status(
      "features/example/Table.tsx",
      '<><CopyButtons human={human} agent={agent} /><MatrxDataTable toolbar={toolbar} />{ id: "copy-ai", label: "Copy for AI" }</>',
    ),
    "equivalent-controls",
  );
});

test("a live table with an existing toolbar is auto-approved", () => {
  assert.equal(
    status(
      "features/example/Table.tsx",
      "<MatrxDataTable data={rows} toolbar={{ search: true }} />",
    ),
    "auto-approved",
  );
});

test("a table without a toolbar stays review-only", () => {
  assert.equal(
    status("features/example/Table.tsx", "<MatrxDataTable data={rows} />"),
    "review",
  );
});

test("tests and demos are excluded", () => {
  assert.equal(
    status(
      "features/example/Table.test.tsx",
      "<MatrxDataTable data={rows} toolbar={toolbar} />",
    ),
    "excluded",
  );
});

test("the canonical table implementation is excluded", () => {
  assert.equal(
    status(
      "components/official/matrx-data-table/MatrxDataTable.tsx",
      "<MatrxDataTable data={rows} />",
    ),
    "excluded",
  );
});
