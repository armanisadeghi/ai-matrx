/**
 * Markdown Print Utility — host seam only.
 *
 * Everything that used to live here (a private `removeThinkingContent`, a
 * private markdown→HTML converter, and a private serif print stylesheet) now
 * ships in `@ai-matrx/print/markdown` as the "article" skin — this file had
 * become the third copy of the same converter in this repo. The package owns
 * the conversion, the document composition, the print window, and the
 * popup-blocked download fallback; this module supplies the two things the
 * package cannot know: where this app puts a toast, and how this app draws a
 * diagram (mermaid → SVG, printed as a picture instead of its source).
 *
 * Fix conversion or styling in the package (SAME-SESSION LAW), never here.
 */

import { printMarkdown, printMarkdownWhenReady } from "@ai-matrx/print/markdown";
import type { PrintOutcome } from "@ai-matrx/print/core";
import { notifyPrintOutcome } from "@/lib/print/print-outcome-toast";

const HAS_MERMAID = /^\s*(?:`{3,}|~{3,})\s*mermaid\b/m;

export function printMarkdownContent(
    markdown: string,
    title = "AI Response",
): PrintOutcome | Promise<PrintOutcome> {
    if (!HAS_MERMAID.test(markdown)) {
        const outcome = printMarkdown(markdown, { skin: "article", title });
        // Popup blocked → the package downloaded the print file; SAY so — a
        // silent fallback reads as "print did nothing" (QA F8, 2026-08-30).
        notifyPrintOutcome(outcome);
        return outcome;
    }
    // Diagrams draw first; the window opens now (inside the click) and shows
    // "Preparing…" until they are ready (verifier round 2: the studio printed
    // every diagram as source).
    return printMarkdownWhenReady(markdown, {
        skin: "article",
        title,
        prepare: async () => {
            let drawn: { pictures: Map<string, string>; failed: number };
            try {
                const { drawMermaidForPrint } = await import("@/components/mermaid/print-render");
                drawn = await drawMermaidForPrint(markdown);
            } catch (error) {
                // The diagram engine could not load: print the source, and say so.
                console.error("[print] diagrams could not be drawn", error);
                const { toast } = await import("@/lib/toast");
                toast.warning("Diagrams could not be drawn, so they print as source.");
                return {};
            }
            const { pictures, failed } = drawn;
            if (failed > 0) {
                const { toast } = await import("@/lib/toast");
                toast.warning(
                    `${failed} diagram${failed === 1 ? "" : "s"} could not be drawn and print${failed === 1 ? "s" : ""} as source.`,
                );
            }
            return {
                renderFence: (language: string, code: string) => {
                    if (language !== "mermaid") return null;
                    const svg = pictures.get(code);
                    return svg ? { svg, alt: "Diagram" } : null;
                },
            };
        },
    }).then((outcome) => {
        notifyPrintOutcome(outcome);
        return outcome;
    });
}
