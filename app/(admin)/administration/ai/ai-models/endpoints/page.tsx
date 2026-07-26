import { Suspense } from "react";
import EndpointsApisContainer from "@/features/ai-models/components/endpoints/EndpointsApisContainer";

export default function AiEndpointsPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Loading…
          </div>
        }
      >
        <EndpointsApisContainer />
      </Suspense>
    </div>
  );
}
