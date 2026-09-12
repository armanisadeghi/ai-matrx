// app/(core)/print/qr/page.tsx
//
// QR codes — one printable from the Print hub at `/print`.
// The frame owns the shell header and the body offset; the section owns the
// controls and calls the published `@ai-matrx/print` printer directly.

import { createRouteMetadata } from "@/utils/route-metadata";
import { PrintSectionFrame } from "@/features/print/components/PrintSectionFrame";
import { QrSection } from "@/features/print/sections/QrSection";

export const metadata = createRouteMetadata("/print", {
    titlePrefix: "QR codes",
    title: "Print",
    description: "Generate a QR symbol at a chosen size and error-correction level, with its real byte capacity shown.",
    letter: "Pt",
    canonicalPath: "/print/qr",
});

export default function PrintQrRoute() {
    return (
        <PrintSectionFrame sectionId="qr">
            <QrSection />
        </PrintSectionFrame>
    );
}
