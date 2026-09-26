import { createRouteMetadata } from "@/utils/route-metadata";
import { StartHero } from "@/features/education/onboard/components/StartHero";
import { EDU_START_FROM_FILES } from "@/features/education/onboard/startRoutes";

export const metadata = createRouteMetadata("/education/start", {
  title: "Create a study kit",
  description:
    "Drop a PDF, paste your notes, or link a page — get flashcards, a grounded summary, and a mind map in one flow. Every card cited back to your own material.",
  letter: "Ed",
  canonicalPath: "/education/start",
});

export default async function EducationStartPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  // `?from=files` opens the door on "My files" (study a file you already own).
  const { from } = await searchParams;
  const startOnFiles = from === EDU_START_FROM_FILES;
  return (
    <div className="scroll-page-end-space h-full overflow-y-auto pb-safe">
      <StartHero initialMode={startOnFiles ? "files" : undefined} />
    </div>
  );
}
