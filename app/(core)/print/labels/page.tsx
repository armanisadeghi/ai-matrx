// app/(core)/print/labels/page.tsx
//
// Label sheets & roll stock — one printable from the Print hub at `/print`.
// The frame owns the shell header and the body offset; the section owns the
// controls and calls the published `@ai-matrx/print` printer directly.

import { createRouteMetadata } from "@/utils/route-metadata";
import { PrintSectionFrame } from "@/features/print/components/PrintSectionFrame";
import { LabelsSection } from "@/features/print/sections/LabelsSection";

export const metadata = createRouteMetadata("/print", {
    titlePrefix: "Label sheets & roll stock",
    title: "Print",
    description: "Avery sheets and continuous roll labels laid out inch-exact, with a calibration page.",
    letter: "Pt",
    canonicalPath: "/print/labels",
});

export default function PrintLabelsRoute() {
    return (
        <PrintSectionFrame sectionId="labels">
            <LabelsSection />
        </PrintSectionFrame>
    );
}
