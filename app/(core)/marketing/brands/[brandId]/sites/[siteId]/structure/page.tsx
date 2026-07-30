import { Suspense } from "react";
import { StructureWorkspace } from "@/features/marketing/components/structure/StructureWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingSiteStructurePage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading site structure…" />}>
      <StructureWorkspace />
    </Suspense>
  );
}
