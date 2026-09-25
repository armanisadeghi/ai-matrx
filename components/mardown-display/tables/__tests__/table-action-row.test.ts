/**
 * verify-RC-B9 F6: a table's action row overflowed the content column on
 * desktop (buttons pushed off the left edge, unreachable) because it wrapped
 * only on mobile. Every table action row uses ONE class that always wraps, and
 * the column-visibility button carries a name for screen readers.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { tableActionRowClass } from "../table-action-row";

const ROOT = path.resolve(__dirname, "../../../..");
const HOSTS = [
  "components/mardown-display/tables/MarkdownTable.tsx",
  "components/mardown-display/blocks/table/StreamingTableRenderer.tsx",
];

it("always wraps, on every width", () => {
  expect(tableActionRowClass(false)).toMatch(/\bflex-wrap\b/);
  expect(tableActionRowClass(true)).toMatch(/\bflex-wrap\b/);
  expect(tableActionRowClass(false)).toMatch(/\bmin-w-0\b/);
});

it.each(HOSTS)("%s uses the one row class and names its icon-only buttons", (file) => {
  const src = readFileSync(path.join(ROOT, file), "utf8");
  expect(src).toContain("tableActionRowClass(");
  expect(src).not.toMatch(/isMobile \? "flex-wrap justify-start" : "justify-end"/);
  if (src.includes("<Columns3")) expect(src).toMatch(/aria-label="Choose visible columns"/);
});
