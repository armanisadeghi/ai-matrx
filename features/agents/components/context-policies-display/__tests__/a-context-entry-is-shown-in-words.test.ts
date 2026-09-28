// A CONTEXT ENTRY IS SHOWN IN WORDS, NEVER BY ITS KEY (lane HANDOVER, 2026-09-28).
//
// Cedar Ridge Physical Therapy pressed its table's agent button ("Draft a home-exercise reminder")
// on a patient. The run's composer listed what the agent was handed as "table_id  table_name
// table_colu…  row_id". Every surface now names an entry through `contextEntryLabel`; the guard
// below fails on any agents surface that falls back to a raw key again.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { contextEntryLabel } from "../contextEntryLabel";

it("a written label wins; otherwise the key is read aloud", () => {
  expect(contextEntryLabel({ key: "table_columns" })).toBe("Table Columns");
  expect(contextEntryLabel({ key: "row_id", label: "  " })).toBe("Row ID");
  expect(contextEntryLabel({ key: "row_id", label: "This patient" })).toBe("This patient");
  expect(contextEntryLabel({ key: "row_id", label: "This patient" }, "The visit")).toBe("The visit");
});

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") yield* files(path);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) yield path;
  }
}

it("no agents surface names a context entry by its raw key", () => {
  // CONTEXT_LABEL_ROOT_UNDER_TEST points the guard at a copy of an older tree, to prove it fails.
  const root = process.env.CONTEXT_LABEL_ROOT_UNDER_TEST ?? join(__dirname, "..", "..", "..");
  const fallback = /label\?\.trim\(\)\s*\|\|\s*(e|entry)\.key\b/;
  const offenders = [...files(root)].filter((f) => fallback.test(readFileSync(f, "utf8")));
  expect(offenders.map((f) => f.slice(root.length + 1))).toEqual([]);
});
