"use client";

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";

import { StrategyBriefWorkspace } from "./StrategyBriefWorkspace";

/** Brand-scoped host: the brand layout already resolved the brand. */
export function BrandStrategyRoom() {
  const brand = useMarketingBrand();
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <StrategyBriefWorkspace
        scope="brand"
        id={brand.id}
        brandId={brand.id}
        brandSeg={brand.seg}
        organizationId={brand.organizationId}
      />
    </div>
  );
}
