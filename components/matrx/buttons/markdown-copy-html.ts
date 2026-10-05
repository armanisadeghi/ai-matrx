// The formatted (text/html) flavor of a rich-content copy, loaded at click time.
// Its own module so a host without the HTML renderer can swap it: the kind
// sandbox frame aliases this to a plain-text-only stand-in, which keeps
// KaTeX and the markdown→HTML pipeline out of the frame bundle.

/** The formatted HTML for a copy, or `undefined` when this host writes plain text only. */
export function formattedCopyHtml(markdown: string): Promise<string> | undefined {
  return import("@ai-matrx/print/markdown").then(({ markdownToHtml }) => markdownToHtml(markdown));
}
