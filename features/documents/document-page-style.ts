/**
 * The ONE page geometry every Matrx cloud document is laid out with.
 *
 * Univer lays a document out inside `documentStyle.pageSize`. With no pageSize
 * the docs renderer has no page box at all: text never wraps (it runs off the
 * right edge) and the vertical extent is unbounded, so the docs viewport
 * reports nothing to scroll — the wheel is swallowed and the page sits frozen
 * at the top. Every writer of a Univer snapshot MUST stamp this style.
 *
 * Consumers: `DocumentEditor` (new empty doc), `markdown-to-univer-doc`
 * (markdown import), and `sanitizeUniverDocSnapshot` (recovery for snapshots
 * that reached storage without it — notably `origin='agent'` writes).
 */
import type { IDocumentData } from "@univerjs/core";

type DocumentStyle = NonNullable<IDocumentData["documentStyle"]>;

/** A4 at 72dpi, in points. */
export const DEFAULT_DOCUMENT_PAGE_STYLE: DocumentStyle = {
  pageSize: { width: 595, height: 842 },
  marginTop: 72,
  marginBottom: 72,
  marginLeft: 90,
  marginRight: 90,
};

/** Fresh copy — Univer mutates the style it is handed. */
export function defaultDocumentPageStyle(): DocumentStyle {
  return {
    ...DEFAULT_DOCUMENT_PAGE_STYLE,
    pageSize: { ...DEFAULT_DOCUMENT_PAGE_STYLE.pageSize },
  };
}
