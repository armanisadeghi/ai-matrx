import { Suspense } from "react";

import { StructureWorkspace } from "@/features/marketing/components/structure/StructureWorkspace";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

/** The same site tree, walked one level at a time in columns. */
export default function MarketingSiteStructureColumnsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading site structure…" />}>
      <StructureWorkspace view="columns" />
    </Suspense>
  );
}
