"use client";

/**
 * Platform SEO vocabulary registry — the facets every tenant's keywords are
 * classified against, plus the band starter templates sites adopt from.
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md (D30).
 */

import { FacetRegistryAdmin } from "@/features/marketing/seo/value-system/registry/FacetRegistryAdmin";

export default function SeoFacetRegistryPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] overflow-hidden">
      <FacetRegistryAdmin />
    </div>
  );
}
