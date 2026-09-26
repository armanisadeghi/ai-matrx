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

// ui-change-inventory row 9 (2026-09-26): nine labelled outline buttons wrapped
// to two lines at chat width and five on a phone. The row is an icon toolbar:
// labels hidden (still the accessible name + tooltip), except Save / Cancel.
it("is a compact icon toolbar that keeps only marked labels", () => {
  for (const mobile of [false, true]) {
    const cls = tableActionRowClass(mobile);
    expect(cls).toContain("[&_button:not([data-keep-label])]:text-[0px]");
    expect(cls).toContain("[&_button:not([data-keep-label])]:h-7");
  }
});

it.each(HOSTS)("%s uses the one row class and names its icon-only buttons", (file) => {
  const src = readFileSync(path.join(ROOT, file), "utf8");
  expect(src).toContain("tableActionRowClass(");
  expect(src).toContain("ref={actionRowRef}");
  expect(src.match(/data-keep-label=""/g)?.length).toBe(2);
  expect(src).not.toMatch(/isMobile \? "flex-wrap justify-start" : "justify-end"/);
  if (src.includes("<Columns3")) expect(src).toMatch(/aria-label="Choose visible columns"/);
});
