import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { ValueWorkbenchA } from "@/features/marketing/seo/value-system/variants/a/ValueWorkbenchA";

export default function ValueWorkbenchVariantAPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading keyword value workbench…" />}>
      <ValueWorkbenchA />
    </Suspense>
  );
}
