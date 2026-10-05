/**
 * Frame stand-in for `@/components/matrx/buttons/markdown-copy-html`.
 *
 * The real seam re-exports @ai-matrx/print/markdown, which imports KaTeX for
 * side effects (~300 KB) and the markdown→HTML renderer. In the frame a Copy
 * click writes the plain flavor only (markdown, or readable text per the
 * flavor); the host page's copy keeps the formatted flavor.
 */

/** Same contract as print's `removeThinkingContent`: drop <thinking>/<think>/<reasoning> blocks. */
export function removeThinkingContent(content: string): string {
  if (!content) return "";
  const hide = (_m: string, before: string, after: string) =>
    before.length >= 2 || after.length >= 2 ? "\n\n" : "\n";
  return content
    .replace(/(\n*)<thinking>[\s\S]*?<\/thinking>(\n*)/gi, hide)
    .replace(/(\n*)<think>[\s\S]*?<\/think>(\n*)/gi, hide)
    .replace(/(\n*)<reasoning>[\s\S]*?<\/reasoning>(\n*)/gi, hide)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formattedCopyHtml(_markdown: string): Promise<string> | undefined {
  void _markdown;
  return undefined;
}
