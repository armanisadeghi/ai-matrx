"use client";

/**
 * "Built on map X" for the content plan's site list (placement §7 #5): the
 * map the site uses, named, as a door. No map → says so (a plan not built on
 * a map is a real state the list should show, never a blank cell). The brand
 * segment comes from the route's optional brand context, so the cell works on
 * the brand-scoped list and on the flat one alike.
 */

import Link from "next/link";
import { Network } from "lucide-react";

import { useMarketingBrandOptional } from "@/features/marketing/lib/brand-context";

import { topicalMapErrorText } from "../errors";
import { useTopicalMap } from "../hooks";
import { useSiteTopicalMapLink } from "./useSiteTopicalMapLink";

export function PlanSiteMapCell({ siteId }: { siteId: string }) {
  const brand = useMarketingBrandOptional();
  const link = useSiteTopicalMapLink(siteId, brand?.seg ?? null);
  // access-errors: ok — rendered verbatim.
  const map = useTopicalMap(link.mapId ?? "", link.status === "ready");

  if (link.status === "loading") return <span className="text-xs text-muted-foreground">…</span>;
  if (link.status === "error")
    return (
      <span role="alert" className="text-xs text-destructive" title={link.error}>
        {link.error}
      </span>
    );
  if (link.status === "none")
    return <span className="text-xs text-muted-foreground">No map</span>;
  if (map.isError)
    return (
      <span role="alert" className="text-xs text-destructive">
        {topicalMapErrorText(map.error)}
      </span>
    );
  return (
    <Link
      href={link.href("outline")}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex max-w-full items-center gap-1 text-xs hover:underline"
      title="Built on this topical map"
    >
      <Network className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{map.data?.name ?? "Topical map"}</span>
    </Link>
  );
}
