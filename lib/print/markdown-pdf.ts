/**
 * Host wiring for `@ai-matrx/print`'s markdownToPdfBlob.
 *
 * This module is a SEAM and nothing else: it fully consumes the package and
 * only supplies the two app-owned pieces the package asks its caller for —
 * the markdown→HTML converter and the WordPress stylesheet. No print logic
 * lives here. Everything heavy stays behind dynamic imports so the chat
 * "Save as → PDF Document" action pays for jsPDF/html2canvas only on use.
 */

export async function markdownToPdfBlob(markdown: string): Promise<Blob> {
  const [{ markdownToPdfBlob: renderMarkdownToPdfBlob }, { convertMarkdownToHtml }, { loadWordPressCSS }] =
    await Promise.all([
      import("@ai-matrx/print/pdf"),
      import("@/features/html-pages/utils/html-preview-utils"),
      import("@/features/html-pages/css/wordpress-styles"),
    ]);

  return renderMarkdownToPdfBlob(markdown, {
    convertToHtml: convertMarkdownToHtml,
    loadCss: loadWordPressCSS,
  });
}
