"use client";

/**
 * "Map these pages" on Search Console insights (placement §7 #2): opens the
 * site's topical-map PAGES workspace, the convergence screen where a set of
 * pages gets a destination.
 *
 * 🚨 IT DELIBERATELY CARRIES NO FILTER, AND THAT IS THE HONEST ANSWER, NOT AN
 * OMISSION. The workspace now reads `?topic=`, `?disposition=`, `?state=` and
 * `?onNoTopic=` from the URL (`views/pages/pageFilterParams.ts`), so a link-in
 * that knows which pages the person came for says so. This one does not know:
 * every insight it sits beside — traffic quality, shifts, SEO juice, CTR gaps,
 * cannibalization, declining, rising, by location — is a reading of SEARCH
 * traffic, and none of them corresponds to a destination, a disposition, a
 * decision state or "on no topic". Pre-filtering on one anyway would hide rows
 * on a decision the person never made, and they would hunt for a page the
 * filter removed. So the link opens the site's pages, unfiltered, and says so.
 */

import Link from "next/link";
import { Network } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useSiteTopicalMapLink } from "./useSiteTopicalMapLink";

export function MapThesePagesLink({
  siteId,
  brandSeg,
}: {
  siteId: string;
  brandSeg: string | null;
}) {
  const link = useSiteTopicalMapLink(siteId, brandSeg);
  if (link.status !== "ready") return null;
  return (
    <Button asChild variant="outline" size="sm" className="h-7 gap-1 text-xs">
      <Link href={link.href("pages")} title="Open this site's pages on the topical map to decide where each one goes">
        <Network className="h-3.5 w-3.5" aria-hidden />
        Map these pages
      </Link>
    </Button>
  );
}
