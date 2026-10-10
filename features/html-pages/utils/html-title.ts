/**
 * The page-title read, on its own so a shell-reachable caller (the canvas host's
 * artifact kinds) never statically pulls `html-preview-utils`, which imports the
 * whole `@ai-matrx/print/markdown` pipeline (unified / remark / rehype / parse5 /
 * KaTeX). `html-preview-utils` re-exports it, so existing callers are unchanged.
 */

/**
 * Extract the title from HTML content by finding the first h1 or h2
 */
export function extractTitleFromHTML(htmlContent: string): string {
  try {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlContent;

    const h1 = tempDiv.querySelector("h1");
    if (h1 && h1.textContent?.trim()) {
      return h1.textContent.trim();
    }

    const h2 = tempDiv.querySelector("h2");
    if (h2 && h2.textContent?.trim()) {
      return h2.textContent.trim();
    }

    return "";
  } catch (error) {
    console.error("Error extracting title from HTML:", error);
    return "";
  }
}
