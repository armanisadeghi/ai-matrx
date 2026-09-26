"use client";

/**
 * "Topical map" for a site's Quick-work card (placement §7 #3): opens the
 * site's map on its PAGES screen — where a crawl's pages get placed — or,
 * when the site uses no map, the brand's Content home in start mode, so the
 * button always leads somewhere true. A refusal renders the function's own
 * sentence instead of a button that would 42501 on click.
 */

import Link from "next/link";
import { Loader2, Network } from "lucide-react";

import { Button } from "@/components/ui/button";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { startMapHref } from "../components/TopicalMapHome";
import { useSiteTopicalMapLink } from "./useSiteTopicalMapLink";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function SiteTopicalMapButton({
  siteId,
  brandSeg,
  className,
}: {
  siteId: string;
  /** The brand's path segment when the host has one; null on the flat site shim. */
  brandSeg: string | null;
  className?: string;
}) {
  const link = useSiteTopicalMapLink(siteId, brandSeg);

  if (link.status === "error") {
    return (
      <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive">
        Topical map: {link.error}
        <ErrorAlchemyMenu className="ml-auto" />
      </p>
    );
  }
  if (link.status === "loading") {
    return (
      <Button variant="outline" className={className} disabled>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Finding this site&apos;s map…
      </Button>
    );
  }
  if (link.status === "ready") {
    return (
      <Button asChild variant="outline" className={className}>
        <Link href={link.href("pages")} title="Place this site's pages on the map's topics">
          <Network className="h-4 w-4" aria-hidden />
          Topical map — place the pages
        </Link>
      </Button>
    );
  }
  // No map on this site.
  const href = brandSeg
    ? startMapHref(brandSeg, { source: "data", siteId })
    : marketingRoutes.topicalMapStart({ source: "data" });
  return (
    <Button asChild variant="outline" className={className}>
      <Link href={href} title="This site uses no topical map yet — start one from its data">
        <Network className="h-4 w-4" aria-hidden />
        Start a topical map
      </Link>
    </Button>
  );
}

/** The same decision as a plain href for hosts that take a link, not a button. */
export function siteTopicalMapFallbackHref(brandSeg: string | null): string {
  return brandSeg
    ? marketingRoutes.brandTopicalMapHome(brandSeg)
    : marketingRoutes.topicalMapStart({ source: "data" });
}
