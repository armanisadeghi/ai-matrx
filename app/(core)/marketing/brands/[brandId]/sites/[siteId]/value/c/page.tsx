import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { ValueWorkbenchC } from "@/features/marketing/seo/value-system/variants/c/ValueWorkbenchC";

export default function ValueWorkbenchVariantCPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading keyword value workbench…" />}>
      <ValueWorkbenchC />
    </Suspense>
  );
}
