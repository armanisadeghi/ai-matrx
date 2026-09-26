"use client";

/**
 * The brand workspace's Topical map section — the module-home card (placement
 * §4.2), sitting beside the per-site "Content plan" row action.
 *
 * Deliberately a whole card rather than another row action on a site: a map
 * belongs to a BRAND, not a site (`seo.topical_map.brand_id`; sites ATTACH to a
 * map through `web_site → seo_topical_map`, role `uses`). Hanging it off one
 * site's row would state the opposite.
 */

import Link from "next/link";
import { BrainCircuit } from "lucide-react";

import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { useTopicalMaps } from "../hooks";
import { topicalMapErrorText } from "../errors";
import { startMapHref } from "./TopicalMapHome";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

export function BrandTopicalMapCard({
  brandId,
  brandSeg,
  organizationId,
}: {
  brandId: string;
  brandSeg: string;
  organizationId: string;
}) {
  // access-errors: ok — the card renders the refusal verbatim below; these
  // seo.* functions write their refusals for the person reading them.
  const maps = useTopicalMaps({ organizationId, brandId });

  return (
    <SectionCard
      title="Topical map"
      action={{
        label: "Open Content",
        href: marketingRoutes.brandTopicalMapHome(brandSeg),
      }}
    >
      {maps.isPending ? (
        <p className="p-4 text-xs text-muted-foreground">
          Loading this brand&apos;s topical maps…
        </p>
      ) : maps.isError ? (
        <ErrorNotice size="inline" className="p-4 text-xs" message={topicalMapErrorText(maps.error)} />
      ) : maps.data.length === 0 ? (
        <div className="grid gap-2 p-4">
          <p className="text-xs text-muted-foreground">
            No topical map yet. The map decides which pages this brand should have
            and where they live; the content plan writes the ones it calls for.
          </p>
          {/* Placement §7 #4 — "Generate map" when there is none. */}
          <Link
            href={startMapHref(brandSeg, { source: "data" })}
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <BrainCircuit className="h-4 w-4" aria-hidden />
            Start a map from this brand&apos;s data
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {maps.data.map((map) => (
            <li key={map.id}>
              <Link
                href={marketingRoutes.brandTopicalMap(brandSeg, map.id)}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-muted/50"
              >
                <span className="min-w-0 truncate">{map.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {map.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
