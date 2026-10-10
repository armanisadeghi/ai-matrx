// features/context-menu-v3/utils/table-at-target.ts
//
// THE TABLE A RIGHT-CLICK LANDED ON, with its shape kept (header + rows). A chat answer's menu is
// one menu over the whole answer, so "Save to a table" read the answer's text and opened on its
// FIRST shape — a bullet list above the table won, and the table the person right-clicked was
// never offered first. The shell hands the rich-document registry this reader (callbacks
// `tableAtTarget`); the one shape reader (`shapeTextOfNode`, records-ui) turns the clicked
// <table> back into table text, streamed or finished — it reads the rendered DOM.

// The shape reader is imported only when a right-click lands on a <table> (the shell calls
// `preloadTableShape` from its open path), never with the page: a menu is opened on ~1 in 149
// page loads and most opens are not on a table.
type ShapeReader = (node: Node) => string;
let shapeReader: ShapeReader | null = null;
let shapeLoad: Promise<unknown> | null = null;

export function preloadTableShape(): Promise<unknown> {
  shapeLoad ??= import("@ai-matrx/records-ui/table-shape")
    .then((m) => {
      shapeReader = m.shapeTextOfNode as ShapeReader;
    })
    .catch((error: unknown) => {
      shapeLoad = null;
      console.error("[ContextMenuV3] could not load the table shape reader", error);
    });
  return shapeLoad;
}

/** Sync; null until the reader has loaded (a click on a table starts the load at open). */
export function tableTextAtTarget(target: Element | null): string | null {
  const table = target?.closest("table");
  if (!table || !shapeReader) return null;
  const text = shapeReader(table.cloneNode(true));
  return text.trim() ? text : null;
}
