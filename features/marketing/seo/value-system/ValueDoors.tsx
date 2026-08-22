"use client";

/**
 * The two doors that belong to the Keyword Value family but do not live inside
 * it — rendered on every one of its routes so neither can be lost again.
 *
 * WHY THEY ARE NOT SUB-VIEWS. The site header's sub-nav (registered in
 * `site-subviews.ts`) lists the five surfaces that ARE this section:
 * Workbench · Dimensions · Rules & Geo · Topics · Starter Packs. These two are
 * somewhere else entirely and must keep their real homes:
 *
 *  • BUSINESS GUIDELINES — the prose doctrine every AI run for this site reads
 *    first. It is AUTHORED in the classification workbench
 *    (`…/keywords?view=classification`) and shown read-only here. Two editors
 *    for one document is exactly how documents drift, so this is a door, never
 *    a second editor.
 *  • FACET REGISTRY — `/administration/knowledge/seo-facets`. The PLATFORM
 *    plane: facts that must mean the same thing for every tenant, or no
 *    cross-site learning can exist. Super-admin only, and hidden — not
 *    disabled — for everyone else, because a door a person can never open is
 *    noise on their screen.
 */

import Link from "next/link";
import { BookOpenCheck, Library } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export function ValueDoors({
  brandId,
  siteId,
}: {
  brandId: string | null | undefined;
  siteId: string;
}) {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link
        href={`${marketingRoutes.site(brandId, siteId, "/keywords")}?view=classification`}
        className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="The prose this site's expert wrote about what it sells and who it serves. Every AI classification and valuation run reads it first. Authored in the classification workbench — the one place it is edited."
      >
        <BookOpenCheck className="h-3 w-3" />
        Business guidelines
      </Link>
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
