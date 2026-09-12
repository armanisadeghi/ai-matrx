// app/(core)/print/documents/page.tsx
//
// Markdown to print or PDF — one printable from the Print hub at `/print`.
// The frame owns the shell header and the body offset; the section owns the
// controls and calls the published `@ai-matrx/print` printer directly.

import { createRouteMetadata } from "@/utils/route-metadata";
import { PrintSectionFrame } from "@/features/print/components/PrintSectionFrame";
import { MarkdownPdfSection } from "@/features/print/sections/MarkdownPdfSection";

export const metadata = createRouteMetadata("/print", {
    titlePrefix: "Markdown to print or PDF",
    title: "Print",
    description: "Turn written content into a styled printed document or a downloaded PDF.",
    letter: "Pt",
    canonicalPath: "/print/documents",
});

export default function PrintMarkdownPdfRoute() {
    return (
        <PrintSectionFrame sectionId="documents">
            <MarkdownPdfSection />
        </PrintSectionFrame>
    );
}
