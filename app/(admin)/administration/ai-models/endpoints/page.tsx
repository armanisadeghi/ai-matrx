import { Suspense } from "react";
import ServicesContainer from "@/features/ai-models/components/services/ServicesContainer";

export default function AiServicesPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Loading…
          </div>
        }
      >
        <ServicesContainer />
      </Suspense>
    </div>
  );
}
