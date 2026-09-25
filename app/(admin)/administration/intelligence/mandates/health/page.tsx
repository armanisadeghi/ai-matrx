import { MandateHealthPage } from "@/features/mandates/code-references/MandateHealthPage";

export const metadata = {
  title: "Mandate health | Mandates | Intelligence",
  description: "Every open way a mandate is broken: where, how bad, and the fix.",
};

export default function IntelligenceMandateHealthPage() {
  return (
    <div className="flex h-[calc(100dvh-2.5rem)] min-h-0 flex-col overflow-hidden">
      <MandateHealthPage />
    </div>
  );
}
