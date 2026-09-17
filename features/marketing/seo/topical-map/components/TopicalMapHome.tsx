"use client";

/**
 * The Content section's HOME — this brand's topical maps.
 *
 * `/marketing/<brand>/content` was a `permanentRedirect` into the content plan
 * until this screen shipped (placement decision 2026-09-16). The plan keeps
 * every address it had and is linked from here as what a topic's page is
 * written in.
 */

import Link from "next/link";
import { ListTree, Network } from "lucide-react";

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { useTopicalMaps } from "../hooks";
import {
  TopicalMapEmpty,
  TopicalMapFailed,
  TopicalMapLoading,
} from "./TopicalMapStates";

export function TopicalMapHome() {
  const brand = useMarketingBrand();
  const maps = useTopicalMaps({
    organizationId: brand.organizationId,
    brandId: brand.id,
  });

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-textured">
      <div className="mx-auto grid max-w-5xl gap-4 p-4 pt-[calc(var(--shell-header-h)+1rem)] sm:p-6 sm:pt-[calc(var(--shell-header-h)+1.5rem)]">
        <section className="rounded-xl border border-border bg-card p-5">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Network className="h-5 w-5" aria-hidden />
            Content
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The topical map decides which pages {brand.name} should have and
            where they live. The content plan below is where a page the map
            calls for actually gets written.
          </p>
          <Link
            href={marketingRoutes.brandContentPlan(brand.seg)}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <ListTree className="h-4 w-4" aria-hidden />
            Open the content plan
          </Link>
        </section>

        {maps.isPending ? (
          <TopicalMapLoading what={`${brand.name}'s topical maps`} />
        ) : maps.isError ? (
          <TopicalMapFailed what={`${brand.name}'s topical maps`} error={maps.error} />
        ) : maps.data.length === 0 ? (
          <TopicalMapEmpty
            title={`${brand.name} has no topical map yet`}
            detail="A map is generated from the brand's description, business facts and locations. Nothing has been created for this brand, so there is nothing to open."
            action={
              <Link
                href={marketingRoutes.brandIdentity(brand.seg)}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Review the brand profile a map would be built from
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {maps.data.map((map) => (
              <li key={map.id}>
                <Link
                  href={marketingRoutes.brandTopicalMap(brand.seg, map.id)}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{map.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {map.description ?? "No description"}
                    </span>
                  </span>
                  <span className="shrink-0 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {map.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
