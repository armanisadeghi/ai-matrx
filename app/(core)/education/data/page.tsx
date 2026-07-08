import { createRouteMetadata } from "@/utils/route-metadata";
import { DataOwnershipPage } from "@/features/education/onboard/components/DataOwnershipPage";

export const metadata = createRouteMetadata("/education/data", {
  title: "Your data",
  description:
    "Own your study material. Export any deck as JSON, Markdown, Anki, or CSV — or your whole library at once. Import from Quizlet, Anki, and CSV. No lock-in, ever.",
  letter: "Ed",
  canonicalPath: "/education/data",
});

export default function EducationDataPage() {
  return <DataOwnershipPage />;
}
