import { Suspense } from "react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import TranslationGrid from "@/features/ai-models/translation/components/TranslationGrid";

export default function AiSettingsTranslationPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <SuspenseLoader centered={false} message="Loading settings translation…" />
          </div>
        }
      >
        <TranslationGrid />
      </Suspense>
    </div>
  );
}
