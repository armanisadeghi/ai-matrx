// app/(core)/print/branded-qr/page.tsx
//
// Branded QR codes — one printable from the Print hub at `/print`.
// The frame owns the shell header and the body offset; the section owns the
// controls and calls the published `@ai-matrx/print` printer directly.

import { createRouteMetadata } from "@/utils/route-metadata";
import { PrintSectionFrame } from "@/features/print/components/PrintSectionFrame";
import { StyledQrSection } from "@/features/print/sections/StyledQrSection";

export const metadata = createRouteMetadata("/print", {
    titlePrefix: "Branded QR codes",
    title: "Print",
    description: "A QR symbol in your colours with a logo in the middle, and an honest read on the scan margin left.",
    letter: "Pt",
    canonicalPath: "/print/branded-qr",
});

export default function PrintStyledQrRoute() {
    return (
        <PrintSectionFrame sectionId="branded-qr">
            <StyledQrSection />
        </PrintSectionFrame>
    );
}
