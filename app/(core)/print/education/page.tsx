// app/(core)/print/education/page.tsx
//
// Cheat sheets, glossaries & study calendars — one printable from the Print hub at `/print`.
// The frame owns the shell header and the body offset; the section owns the
// controls and calls the published `@ai-matrx/print` printer directly.

import { createRouteMetadata } from "@/utils/route-metadata";
import { PrintSectionFrame } from "@/features/print/components/PrintSectionFrame";
import { EducationSection } from "@/features/print/sections/EducationSection";

export const metadata = createRouteMetadata("/print", {
    titlePrefix: "Cheat sheets, glossaries & study calendars",
    title: "Print",
    description: "A one-page formula sheet, a two-column glossary, or a dated study calendar.",
    letter: "Pt",
    canonicalPath: "/print/education",
});

export default function PrintEducationRoute() {
    return (
        <PrintSectionFrame sectionId="education">
            <EducationSection />
        </PrintSectionFrame>
    );
}
