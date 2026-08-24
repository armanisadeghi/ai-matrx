import { Suspense } from "react";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";
import { GuidelinesWorkbench } from "@/features/marketing/seo/value-system/guidelines/GuidelinesWorkbench";

export default function ValueGuidelinesPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading business guidelines…" />}>
      <GuidelinesWorkbench />
    </Suspense>
  );
}
