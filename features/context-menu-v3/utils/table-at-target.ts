// features/context-menu-v3/utils/table-at-target.ts
//
// THE TABLE A RIGHT-CLICK LANDED ON, with its shape kept (header + rows). A chat answer's menu is
// one menu over the whole answer, so "Save to a table" read the answer's text and opened on its
// FIRST shape — a bullet list above the table won, and the table the person right-clicked was
// never offered first. The shell hands the rich-document registry this reader (callbacks
// `tableAtTarget`); the one shape reader (`shapeTextOfNode`, records-ui) turns the clicked
// <table> back into table text, streamed or finished — it reads the rendered DOM.

import { shapeTextOfNode } from "@ai-matrx/records-ui/table-shape";

export function tableTextAtTarget(target: Element | null): string | null {
  const table = target?.closest("table");
  if (!table) return null;
  const text = shapeTextOfNode(table.cloneNode(true));
  return text.trim() ? text : null;
}
