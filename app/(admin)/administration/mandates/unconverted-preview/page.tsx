import { UnconvertedCallsPage } from "@/features/mandates/code-references/UnconvertedCallsPage";

// Replacement for the conversion list on /administration/mandates/references,
// built beside it (the old page stays untouched until the swap — OPTIONS.md §2).
export const metadata = {
  title: "Unconverted AI calls | Mandates | Administration",
  description: "Every place in our code that calls an AI provider directly instead of through a mandate.",
};

export default function UnconvertedAiCallsPreviewPage() {
  return (
    <div className="flex h-[calc(100dvh-2.5rem)] min-h-0 flex-col overflow-hidden">
      <UnconvertedCallsPage />
    </div>
  );
}
