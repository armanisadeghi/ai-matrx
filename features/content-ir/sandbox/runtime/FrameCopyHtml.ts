/**
 * Frame stand-in for `@/components/matrx/buttons/markdown-copy-html`.
 *
 * The formatted (text/html) copy flavor needs the markdown→HTML pipeline and
 * KaTeX — a large renderer the frame does not carry. In the frame a Copy click
 * writes the plain flavor only (markdown, or readable text per the flavor);
 * the host page's copy keeps the formatted flavor.
 */
export function formattedCopyHtml(_markdown: string): Promise<string> | undefined {
  void _markdown;
  return undefined;
}
