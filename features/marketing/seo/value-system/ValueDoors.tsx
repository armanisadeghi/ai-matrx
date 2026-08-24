"use client";

/**
 * Doors that belong to the Keyword Value family but sit outside its own
 * sub-nav (`site-subviews.ts` lists the surfaces that ARE this section) —
 * rendered on every one of its routes so they can't be lost.
 *
 *  • BUSINESS GUIDELINES — its real sub-view is `value:guidelines`; this is a
 *    shortcut so the door reaches it from anywhere in the family, not a
 *    second editor. Until 2026-08-25 (KI-036) it lived only in the retired
 *    `?view=classification` workspace ("Teach classes"), which folded into
 *    the Keyword Workbench.
 *  • BRAND IDENTITY — every alias the brand rung matches is a `brand_identity`
 *    matcher on the platform "Brand" value (`traffic_class:brand`); this
 *    deep-links straight into THE MATCHER EDITOR (KI-008) on that value,
 *    which also folded in from the same retired workspace.
 *  • FACET REGISTRY — `/administration/knowledge/seo-facets`. The PLATFORM
 *    plane: facts that must mean the same thing for every tenant, or no
 *    cross-site learning can exist. Super-admin only, and hidden — not
 *    disabled — for everyone else, because a door a person can never open is
 *    noise on their screen.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, BookOpenCheck, Library } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { getFacetDimensionCatalog } from "@/features/marketing/seo/value-system/dimensions/data";
import { dimensionValueHref } from "@/features/marketing/seo/value-system/reason-links";

export function ValueDoors({
  brandId,
  siteId,
}: {
  brandId: string | null | undefined;
  siteId: string;
}) {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);

  // Same query key DimensionManager uses — the catalog is almost always
  // already cached by the time either screen mounts.
  const catalog = useQuery({
    queryKey: ["marketing", "seo", "facet-dimensions", siteId],
    queryFn: ({ signal }) => getFacetDimensionCatalog(siteId, signal),
    staleTime: 60_000,
  });
  const brandValue = catalog.data
    ?.find((dimension) => dimension.slug === "traffic_class")
    ?.values.find((value) => value.key === "brand");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link
        href={marketingRoutes.site(brandId, siteId, "/value/guidelines")}
        className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="The prose this site's expert wrote about what it sells and who it serves. Every AI classification and valuation run reads it first."
      >
        <BookOpenCheck className="h-3 w-3" />
        Business guidelines
      </Link>
      {brandValue ? (
        <Link
          href={dimensionValueHref(
            { brandId, siteId },
            "traffic_class",
            brandValue.value_id,
            "1",
          )}
          className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Every name, misspelling and legal form that classifies a search as your brand — edited as matchers on the Brand value."
        >
          <BadgeCheck className="h-3 w-3" />
          Brand identity
        </Link>
      ) : null}
      {isSuperAdmin ? (
        <Link
          href="/administration/knowledge/seo-facets"
          className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Platform facet registry — the universal vocabularies every tenant shares. Super admins only."
        >
          <Library className="h-3 w-3" />
          Facet registry
        </Link>
      ) : null}
    </div>
  );
}
