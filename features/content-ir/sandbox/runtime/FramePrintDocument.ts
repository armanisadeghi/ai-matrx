/**
 * Frame stand-in for `@ai-matrx/print/document` (Word / PDF export). The real
 * module bundles pdfmake and docx — megabytes of code that probe storage and
 * the network, none of which a sandbox frame may hold. Inside a Shape the copy
 * menu's Word/PDF downloads say so instead; on the page they work as usual.
 */

const REASON = "Word and PDF downloads open from the page, not inside a shape.";

export async function exportDocument(): Promise<never> {
    throw new Error(REASON);
}
