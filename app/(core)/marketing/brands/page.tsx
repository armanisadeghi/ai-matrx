import { Suspense } from "react";
import { BrandsPortfolio } from "@/features/marketing/components/brands/BrandsPortfolio";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingBrandsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading brands…" />}>
      <BrandsPortfolio />
    </Suspense>
  );
}
