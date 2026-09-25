import { UnconvertedCallsPage } from "@/features/mandates/code-references/UnconvertedCallsPage";

export const metadata = {
  title: "Unconverted AI calls | Mandates | Intelligence",
  description: "Every place in our code that calls an AI provider directly instead of through a mandate.",
};

export default function IntelligenceUnconvertedAiCallsPage() {
  return (
    <div className="flex h-[calc(100dvh-2.5rem)] min-h-0 flex-col overflow-hidden">
      <UnconvertedCallsPage />
    </div>
  );
}
