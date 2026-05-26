import { Suspense } from "react";
import DeprecatedModelsAuditPage from "@/features/ai-models/components/DeprecatedModelsAuditPage";

export default function DeprecatedAuditPage() {
  return (
    <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Loading…
          </div>
        }
      >
        <DeprecatedModelsAuditPage />
      </Suspense>
    </div>
  );
}
