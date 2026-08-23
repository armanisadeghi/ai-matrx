import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/canonical-flashcards", {
  titlePrefix: "Canonical Flashcards",
  title: "Demo",
  description:
    "Comparison and migration proof for one context-aware flashcard player.",
  letter: "Fc",
});

export default function CanonicalFlashcardsDemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
