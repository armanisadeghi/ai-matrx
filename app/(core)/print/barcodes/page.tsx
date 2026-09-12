// app/(core)/print/barcodes/page.tsx
//
// Barcodes — one printable from the Print hub at `/print`.
// The frame owns the shell header and the body offset; the section owns the
// controls and calls the published `@ai-matrx/print` printer directly.

import { createRouteMetadata } from "@/utils/route-metadata";
import { PrintSectionFrame } from "@/features/print/components/PrintSectionFrame";
import { BarcodeSection } from "@/features/print/sections/BarcodeSection";

export const metadata = createRouteMetadata("/print", {
    titlePrefix: "Barcodes",
    title: "Print",
    description: "Code 128, EAN, UPC and friends, rendered to the widths a scanner expects.",
    letter: "Pt",
    canonicalPath: "/print/barcodes",
});

export default function PrintBarcodeRoute() {
    return (
        <PrintSectionFrame sectionId="barcodes">
            <BarcodeSection />
        </PrintSectionFrame>
    );
}
