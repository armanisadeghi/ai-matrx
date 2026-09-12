// app/(core)/print/flashcards/page.tsx
//
// Flashcard decks — one printable from the Print hub at `/print`.
// The frame owns the shell header and the body offset; the section owns the
// controls and calls the published `@ai-matrx/print` printer directly.

import { createRouteMetadata } from "@/utils/route-metadata";
import { PrintSectionFrame } from "@/features/print/components/PrintSectionFrame";
import { FlashcardsSection } from "@/features/print/sections/FlashcardsSection";

export const metadata = createRouteMetadata("/print", {
    titlePrefix: "Flashcard decks",
    title: "Print",
    description: "Print a deck as cut-apart cards \u2014 duplex-mirrored or stacked, with show-through countermeasures.",
    letter: "Pt",
    canonicalPath: "/print/flashcards",
});

export default function PrintFlashcardsRoute() {
    return (
        <PrintSectionFrame sectionId="flashcards">
            <FlashcardsSection />
        </PrintSectionFrame>
    );
}
