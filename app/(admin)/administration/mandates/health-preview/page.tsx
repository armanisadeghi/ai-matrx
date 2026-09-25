import { MandateHealthPage } from "@/features/mandates/code-references/MandateHealthPage";

// Replacement for the findings on /administration/mandates/references plus
// code-vs-database drift, built beside it (the old page stays untouched until
// the swap — OPTIONS.md §2).
export const metadata = {
  title: "Mandate health | Mandates | Administration",
  description: "Every open way a mandate is broken: where, how bad, and the fix.",
};

export default function MandateHealthPreviewPage() {
  return (
    <div className="flex h-[calc(100dvh-2.5rem)] min-h-0 flex-col overflow-hidden">
      <MandateHealthPage />
    </div>
  );
}
