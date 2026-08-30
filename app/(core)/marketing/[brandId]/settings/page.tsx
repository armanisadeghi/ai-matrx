"use client";

/**
 * Brand settings — the keyword-value defaults and autonomy modes this client's
 * sites inherit unless a site overrides them. Third rung of the ladder
 * (KI-046): platform → organization → brand → site.
 *
 * The brand UUID comes from the route context, never from the param: the
 * segment in the URL is an address and is usually a key.
 */

import { useQueryClient } from "@tanstack/react-query";

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { MarketingAddressCard } from "@/features/marketing/components/settings/MarketingAddressCard";
import { useBrand } from "@/features/marketing/data/hooks";
import { renameBrandSlug } from "@/features/marketing/data/service";
import { AutonomyModesEditor } from "@/features/marketing/seo/value-system/settings/AutonomyModesEditor";
import { ValueSettingsEditor } from "@/features/marketing/seo/value-system/settings/ValueSettingsEditor";

export default function BrandSettingsPage() {
  const brand = useMarketingBrand();
  const queryClient = useQueryClient();
  // The row (not the route context) carries the alias list this card shows.
  const brandRow = useBrand(brand.id);
  return (
    <div className="h-full overflow-y-auto p-4 pt-[calc(var(--shell-header-h)+1rem)]">
      <div className="mx-auto max-w-4xl space-y-4">
        <MarketingAddressCard
          title="Brand address"
          description="This brand's address in the app. Every page under this client sits below it."
          addressPrefix="/marketing/"
          currentKey={brand.seg}
          previousKeys={brandRow.data?.previous_slugs ?? []}
          rename={(nextKey) => renameBrandSlug(brand.id, nextKey)}
          onRenamed={() => {
            void queryClient.invalidateQueries({ queryKey: ["marketing"] });
          }}
        />
        <ValueSettingsEditor scope="brand" id={brand.id} />
        <AutonomyModesEditor scope="brand" id={brand.id} />
      </div>
    </div>
  );
}
