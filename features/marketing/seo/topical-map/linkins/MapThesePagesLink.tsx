"use client";

/**
 * "Map these pages" on Search Console insights (placement §7 #2): opens the
 * site's topical-map PAGES workspace, the convergence screen where a set of
 * pages gets a destination. The insight's own filter (threshold, dimension)
 * does not ride the URL yet — the pages workspace reads its filters from the
 * map store (CONTRACTS §3), and a URL contract for them is filed with the
 * coordinator (VERIFY-E.md § owed). Until then the link is honest about what
 * it opens: the site's pages on the map, unfiltered.
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
