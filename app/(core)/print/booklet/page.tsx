// app/(core)/print/booklet/page.tsx
//
// Booklet imposition — one printable from the Print hub at `/print`.
// The frame owns the shell header and the body offset; the section owns the
// controls and calls the published `@ai-matrx/print` printer directly.

import { createRouteMetadata } from "@/utils/route-metadata";
import { PrintSectionFrame } from "@/features/print/components/PrintSectionFrame";
import { BookletSection } from "@/features/print/sections/BookletSection";

export const metadata = createRouteMetadata("/print", {
    titlePrefix: "Booklet imposition",
    title: "Print",
    description: "Reorder pages for saddle stitch so a folded stack reads in order.",
    letter: "Pt",
    canonicalPath: "/print/booklet",
});

export default function PrintBookletRoute() {
    return (
        <PrintSectionFrame sectionId="booklet">
            <BookletSection />
        </PrintSectionFrame>
    );
}
