"use client";

/**
 * "Your industry defaults are ready — review & accept."
 *
 * P13 says the platform is opinionated from day one; Arman's ruling (R-B,
 * 2026-08-22) says the opinion is STAGED, never written behind the expert's
 * back: when a site's org has opted into an industry (iam.org_industries) that
 * has a ratified pack the site has not adopted, every Keyword Value screen
 * carries this one line to the review screen. Accept is one click there —
 * still day one — and nothing is forced: "Not now" hides it for this browser
 * and the packs screen still lists the pack.
 *
 * Catalog ordering (`org_match`) and the adopted state are server truth.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, ChevronRight, X } from "lucide-react";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import {
  getStarterPackAdoptions,
  getStarterPackCatalog,
  starterPackAdoptionsQueryKey,
  starterPackCatalogQueryKey,
} from "../data";
import { packReviewHref } from "../lib";

function dismissKey(siteId: string, packId: string) {
  return `seo-pack-ready-dismissed:${siteId}:${packId}`;
}

function readDismissed(siteId: string, packId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(dismissKey(siteId, packId)) === "1";
  } catch {
    return false;
  }
}

export function ReadyDefaultsBanner() {
  const { site, brandId } = useMarketingSite();
  const siteId = site.id;
  const organizationId = site.organization_id ?? null;
  const [dismissedNow, setDismissedNow] = useState<string | null>(null);

  const catalog = useQuery({
    queryKey: [...starterPackCatalogQueryKey, organizationId ?? "none"],
    queryFn: ({ signal }) => getStarterPackCatalog(null, organizationId, signal),
    staleTime: 5 * 60_000,
    enabled: Boolean(organizationId),
  });
  const adoptions = useQuery({
    queryKey: starterPackAdoptionsQueryKey(siteId),
    queryFn: ({ signal }) => getStarterPackAdoptions(siteId, signal),
    staleTime: 60_000,
  });

  if (!catalog.data || !adoptions.data) return null;
  const adoptedIds = new Set(adoptions.data.map((a) => a.pack_id));
  const ready = catalog.data.find(
    (p) =>
      p.org_match &&
      p.status === "ratified" &&
      !adoptedIds.has(p.id) &&
      dismissedNow !== p.id &&
      !readDismissed(siteId, p.id),
  );
  if (!ready) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(dismissKey(siteId, ready.id), "1");
    } catch {
      /* storage unavailable — the banner simply returns next visit */
    }
    setDismissedNow(ready.id);
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-info/40 bg-info/10 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center">
        <BadgeCheck className="mt-px h-4 w-4 shrink-0 text-info sm:mt-0" aria-hidden />
        <p className="min-w-0 flex-1 text-xs text-foreground">
          <span className="font-semibold">Your industry defaults are ready.</span>{" "}
          <span className="text-muted-foreground">
            {ready.name} — {ready.meaning_count} answers, {ready.topic_count} topic worths,{" "}
            {ready.value_band_count + ready.geo_band_count} bands — expert-ratified for{" "}
            {ready.industry_name ?? ready.industry}. Nothing is applied until you look and
            accept; take all of it or just the parts you want.
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={packReviewHref(brandId, siteId, ready.id)}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:flex-none sm:py-1"
        >
          Review &amp; accept
          <ChevronRight className="h-3 w-3" aria-hidden />
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex-none sm:py-1"
          title="Hide this on this browser. The pack stays listed under Industry packs."
        >
          <X className="h-3 w-3" aria-hidden />
          Not now
        </button>
      </div>
    </div>
  );
}
