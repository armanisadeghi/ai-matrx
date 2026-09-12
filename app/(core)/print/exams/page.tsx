// app/(core)/print/exams/page.tsx
//
// Practice tests & bubble sheets — one printable from the Print hub at `/print`.
// The frame owns the shell header and the body offset; the section owns the
// controls and calls the published `@ai-matrx/print` printer directly.

import { createRouteMetadata } from "@/utils/route-metadata";
import { PrintSectionFrame } from "@/features/print/components/PrintSectionFrame";
import { ExamSection } from "@/features/print/sections/ExamSection";

export const metadata = createRouteMetadata("/print", {
    titlePrefix: "Practice tests & bubble sheets",
    title: "Print",
    description: "A practice test, its scannable bubble answer form, and the answer key as three separate documents.",
    letter: "Pt",
    canonicalPath: "/print/exams",
});

export default function PrintExamRoute() {
    return (
        <PrintSectionFrame sectionId="exams">
            <ExamSection />
        </PrintSectionFrame>
    );
}
