/**
 * Markdown Print Utility — host seam only.
 *
 * Everything that used to live here (a private `removeThinkingContent`, a
 * private markdown→HTML converter, and a private serif print stylesheet) now
 * ships in `@ai-matrx/print/markdown` as the "article" skin — this file had
 * become the third copy of the same converter in this repo. The package owns
 * the conversion, the document composition, the print window, and the
 * popup-blocked download fallback; this module supplies the ONE thing the
 * package cannot know: where this app puts a toast.
 *
 * Fix conversion or styling in the package (SAME-SESSION LAW), never here.
 */

import { printMarkdown } from "@ai-matrx/print/markdown";
import type { PrintOutcome } from "@ai-matrx/print/core";
import { notifyPrintOutcome } from "@/lib/print/print-outcome-toast";

export function printMarkdownContent(
    markdown: string,
    title = "AI Response",
): PrintOutcome {
    const outcome = printMarkdown(markdown, { skin: "article", title });
    // Popup blocked → the package downloaded the print file; SAY so — a
    // silent fallback reads as "print did nothing" (QA F8, 2026-08-30).
    notifyPrintOutcome(outcome);
    return outcome;
}
