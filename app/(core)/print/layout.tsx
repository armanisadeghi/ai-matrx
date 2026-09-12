// app/(core)/print/layout.tsx
//
// Static metadata for the Print hub and every printable under it.
//
// The guest/member branch deliberately lives on `page.tsx`, not here: the
// section pages (`/print/qr`, `/print/labels`, …) run entirely in the browser
// against the `@ai-matrx/print` package, so a signed-out visitor can use them
// for real. Only the hub's front door and `/print/order` (which talks to the
// authenticated print-on-demand API) branch on auth.

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/print", {
    title: "Print",
    description:
        "Everything you can put on paper — flashcard decks, cheat sheets, practice tests with bubble sheets, certificates, label sheets, QR codes, barcodes, documents and booklets — plus printed books ordered and shipped.",
    letter: "Pt",
    canonicalPath: "/print",
    keywords: ["print", "PDF", "labels", "QR codes", "flashcards", "booklet", "print on demand"],
});

export default function PrintLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
