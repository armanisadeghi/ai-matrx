// app/(core)/print/certificates/page.tsx
//
// Certificates & workbooks — one printable from the Print hub at `/print`.
// The frame owns the shell header and the body offset; the section owns the
// controls and calls the published `@ai-matrx/print` printer directly.

import { createRouteMetadata } from "@/utils/route-metadata";
import { PrintSectionFrame } from "@/features/print/components/PrintSectionFrame";
import { CertificateSection } from "@/features/print/sections/CertificateSection";

export const metadata = createRouteMetadata("/print", {
    titlePrefix: "Certificates & workbooks",
    title: "Print",
    description: "A completion certificate, and a workbook composed from the sections you choose.",
    letter: "Pt",
    canonicalPath: "/print/certificates",
});

export default function PrintCertificateRoute() {
    return (
        <PrintSectionFrame sectionId="certificates">
            <CertificateSection />
        </PrintSectionFrame>
    );
}
