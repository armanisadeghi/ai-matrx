// The @ai-matrx/print/markdown seam of the rich-content copy. Its own module so
// a host without the print pipeline can swap it: the kind sandbox frame aliases
// this file to a stand-in (FrameCopyHtml), which keeps KaTeX — pulled in for
// side effects by print/markdown — and the markdown→HTML renderer out of the
// frame bundle.
export { removeThinkingContent } from "@ai-matrx/print/markdown";

/** The formatted HTML for a copy (loaded at click time), or `undefined` when this host writes plain text only. */
export function formattedCopyHtml(markdown: string): Promise<string> | undefined {
  return import("@ai-matrx/print/markdown").then(({ markdownToHtml }) => markdownToHtml(markdown));
}
