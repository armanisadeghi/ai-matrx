// app/(core)/print/zpl/page.tsx
//
// ZPL export — one printable from the Print hub at `/print`.
// The frame owns the shell header and the body offset; the section owns the
// controls and calls the published `@ai-matrx/print` printer directly.

import { createRouteMetadata } from "@/utils/route-metadata";
import { PrintSectionFrame } from "@/features/print/components/PrintSectionFrame";
import { ZplSection } from "@/features/print/sections/ZplSection";

export const metadata = createRouteMetadata("/print", {
    titlePrefix: "ZPL export",
    title: "Print",
    description: "Raw ZPL for a Zebra-class thermal printer, for when the browser print dialog is not the path.",
    letter: "Pt",
    canonicalPath: "/print/zpl",
});

export default function PrintZplRoute() {
    return (
        <PrintSectionFrame sectionId="zpl">
            <ZplSection />
        </PrintSectionFrame>
    );
}
