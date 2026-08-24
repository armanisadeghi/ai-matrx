"use client";

/**
 * Brand keyword-value settings — what this brand's sites use unless a site
 * overrides it. Third rung of the ladder (KI-046):
 * platform → organization → brand → site.
 */

import { useParams } from "next/navigation";
import { AutonomyModesEditor } from "@/features/marketing/seo/value-system/settings/AutonomyModesEditor";
import { ValueSettingsEditor } from "@/features/marketing/seo/value-system/settings/ValueSettingsEditor";

export default function BrandValueSettingsPage() {
  const params = useParams();
  const brandId = typeof params.brandId === "string" ? params.brandId : null;
  if (!brandId) return null;
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <ValueSettingsEditor scope="brand" id={brandId} />
        <AutonomyModesEditor scope="brand" id={brandId} />
      </div>
    </div>
  );
}
