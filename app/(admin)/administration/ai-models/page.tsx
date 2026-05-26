import { Suspense } from "react";
import AiModelsContainer from "@/features/ai-models/components/AiModelsContainer";

export default function AiModelsPage() {
  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Loading…
          </div>
        }
      >
        <AiModelsContainer />
      </Suspense>
    </div>
  );
}
