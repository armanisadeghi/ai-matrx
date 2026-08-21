import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { ValueWorkbenchD } from "@/features/marketing/seo/value-system/variants/d/ValueWorkbenchD";

export default function ValueWorkbenchVariantDPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading keyword value workbench…" />}>
      <ValueWorkbenchD />
    </Suspense>
  );
}
