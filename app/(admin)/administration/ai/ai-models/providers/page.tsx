import { Suspense } from "react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import ProvidersContainer from "@/features/ai-models/components/providers/ProvidersContainer";

export default function AiProvidersPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <SuspenseLoader
              centered={false}
              message="Loading model providers…"
            />
          </div>
        }
      >
        <ProvidersContainer />
      </Suspense>
    </div>
  );
}
