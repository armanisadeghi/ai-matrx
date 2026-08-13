import { Suspense } from "react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import EndpointsApisContainer from "@/features/ai-models/components/endpoints/EndpointsApisContainer";

export default function AiEndpointsPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <SuspenseLoader
              centered={false}
              message="Loading model endpoints…"
            />
          </div>
        }
      >
        <EndpointsApisContainer />
      </Suspense>
    </div>
  );
}
