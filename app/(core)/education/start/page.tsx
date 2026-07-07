import { createRouteMetadata } from "@/utils/route-metadata";
import { StartHero } from "@/features/education/onboard/components/StartHero";

export const metadata = createRouteMetadata("/education/start", {
  title: "Create a study kit",
  description:
    "Drop a PDF, paste your notes, or link a page — get flashcards, a grounded summary, and a mind map in one flow. Every card cited back to your own material.",
  letter: "Ed",
  canonicalPath: "/education/start",
});

export default function EducationStartPage() {
  return <StartHero />;
}
