"use client";

/**
 * Brand settings — the keyword-value defaults and autonomy modes this client's
 * sites inherit unless a site overrides them. Third rung of the ladder
 * (KI-046): platform → organization → brand → site.
 *
 * The brand UUID comes from the route context, never from the param: the
 * segment in the URL is an address and is usually a key.
 */

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { AutonomyModesEditor } from "@/features/marketing/seo/value-system/settings/AutonomyModesEditor";
import { ValueSettingsEditor } from "@/features/marketing/seo/value-system/settings/ValueSettingsEditor";

export default function BrandSettingsPage() {
  const brand = useMarketingBrand();
  return (
    <div className="h-full overflow-y-auto p-4 pt-[calc(var(--shell-header-h)+1rem)]">
      <div className="mx-auto max-w-4xl space-y-4">
        <ValueSettingsEditor scope="brand" id={brand.id} />
        <AutonomyModesEditor scope="brand" id={brand.id} />
      </div>
    </div>
  );
}
