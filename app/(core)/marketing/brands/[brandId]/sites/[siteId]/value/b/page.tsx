import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { ValueWorkbenchB } from "@/features/marketing/seo/value-system/variants/b/ValueWorkbenchB";

export default function ValueWorkbenchVariantBPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading keyword value workbench…" />}>
      <ValueWorkbenchB />
    </Suspense>
  );
}
