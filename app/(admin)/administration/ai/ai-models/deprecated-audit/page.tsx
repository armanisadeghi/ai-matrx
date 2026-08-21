import { Suspense } from "react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import DeprecatedModelsAuditPage from "@/features/ai-models/components/DeprecatedModelsAuditPage";

export default function DeprecatedAuditPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <SuspenseLoader
              centered={false}
              message="Loading deprecated-model audit…"
            />
          </div>
        }
      >
        <DeprecatedModelsAuditPage />
      </Suspense>
    </div>
  );
}
