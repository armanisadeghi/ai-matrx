// Find an element by id in the NEAREST document around `from`: walk up the
// ancestors and return the first match inside the smallest one that holds
// it. Several answers on one page all carry `user-content-fn-1`; a split
// document keeps its footnotes in a later block — both resolve correctly.

export function findInDocument(from: Element | null, id: string): HTMLElement | null {
  if (!from || !id) return null;
  const selector = `[id="${id.replace(/["\\]/g, "\\$&")}"]`;
  let scope: Element | null = from.parentElement;
  while (scope) {
    const hit = scope.querySelector<HTMLElement>(selector);
    if (hit && hit !== from) return hit;
    scope = scope.parentElement;
  }
  return null;
}

/** The root a document-wide scan (table of contents) reads: the marked root, else the page. */
export function documentRootOf(from: Element | null): Element | null {
  if (!from) return null;
  return from.closest("[data-matrx-doc-root]") ?? null;
}
