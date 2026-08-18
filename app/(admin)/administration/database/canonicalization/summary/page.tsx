import { Suspense } from "react";
import { SummaryPage } from "@/features/administration/canonicalization/components/SummaryPage";

export default function CanonicalizationSummaryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          Loading summary…
        </div>
      }
    >
      <SummaryPage />
    </Suspense>
  );
}
