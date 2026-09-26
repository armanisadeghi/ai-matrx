import { Suspense } from "react";
import { SchemaSummaryPage } from "@/features/administration/canonicalization/components/SchemaSummaryPage";

export default function CanonicalizationBySchemaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          Loading summary by schema…
        </div>
      }
    >
      <SchemaSummaryPage />
    </Suspense>
  );
}
