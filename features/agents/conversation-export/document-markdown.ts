// document-markdown — the text a conversation hands to the ONE document
// exporter (`@ai-matrx/print/document`). Two things the package cannot do on
// its own today are done here, on the markdown, before the call:
//
//   1. Kind envelopes are storage plumbing: `<artifact …>| table |</artifact>`
//      is unwrapped to its body (the shared `unwrapKindEnvelopes` projection),
//      so the package parses a REAL table.
//   2. Math. The package has no math node, and raw `$$…$$` is not an answer.
//      Display formulas become a picture (KaTeX drawn to PNG in the browser —
//      the image fallback Word, PDF and HTML all carry); inline formulas become
//      readable text (`a² + b²`-style, the shared `mathToReadable`). Code is
//      never touched — the boundaries come from the one math dialect.
//
// When the package grows a math node (RC-B10 owns it), step 2 moves there.

import { unwrapKindEnvelopes, mathToReadable } from "@/lib/markdown/plain-text";
import { splitMathSpans } from "@/components/markdown-core/math-normalizer";

export interface PrepareDocumentOptions {
  /** Draw a display formula; returns a PNG/JPEG data URL, or null when it cannot. */
  renderDisplayMath?: (tex: string) => Promise<string | null>;
}

function escapeInline(text: string): string {
  return text.replace(/([\\`*_[\]<>|])/g, "\\$1");
}

export async function prepareDocumentMarkdown(
  markdown: string,
  options: PrepareDocumentOptions = {},
): Promise<string> {
  const pieces = splitMathSpans(unwrapKindEnvelopes(markdown));
  const out: string[] = [];
  for (const piece of pieces) {
    if (piece.kind !== "math") {
      out.push(piece.text);
      continue;
    }
    const tex = piece.tex ?? "";
    const readable = escapeInline(mathToReadable(tex));
    if (!piece.display) {
      out.push(readable);
      continue;
    }
    let url: string | null = null;
    try {
      url = options.renderDisplayMath ? await options.renderDisplayMath(tex) : null;
    } catch (err) {
      console.error("[document-markdown] could not draw a formula", err);
    }
    const alt = readable.replace(/[[\]]/g, "");
    out.push(url ? `![${alt}](${url})` : `*${readable}*`);
  }
  return out.join("");
}
