import { Suspense } from "react";
import { TableImpactPanel } from "@/features/administration/canonicalization/components/TableImpactPanel";

export default function CanonicalizationTableImpactPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          Loading table impact…
        </div>
      }
    >
      <TableImpactPanel />
    </Suspense>
  );
}
