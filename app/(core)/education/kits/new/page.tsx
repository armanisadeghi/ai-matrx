// /education/kits/new — THE one page that creates a study kit (the agents
// pattern: list → New → one create route → the kit page). Two ways in: build
// with AI from material, or bundle saved study aids. `?source=<fileId>` pre-picks
// that file; a link naming an existing kit forwards to the kit page.
import { createRouteMetadata } from "@/utils/route-metadata";
import { StartHero } from "@/features/education/onboard/components/StartHero";

export const metadata = createRouteMetadata("/education/kits/new", {
  title: "Create a study kit",
  description:
    "Drop a PDF, paste your notes, or link a page — get flashcards, a grounded summary, and a mind map in one flow. Or bundle study aids you already saved.",
  letter: "Ed",
  canonicalPath: "/education/kits/new",
});

export default function NewStudyKitPage() {
  return (
    <div className="scroll-page-end-space h-full overflow-y-auto bg-textured">
      <StartHero />
    </div>
  );
}
