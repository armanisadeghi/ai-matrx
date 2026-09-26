"use client";

/**
 * START A MAP without a brand in the URL — the door the research output card
 * opens (`/marketing/topical-maps/start?research=<rs_topic>`; a research topic
 * belongs to an organization, not a brand, so the card cannot know the brand).
 *
 * The person picks the brand; the moment one is chosen the SAME start screen
 * the Content home renders appears, under a `MapLinkProvider` for that brand
 * so every door the result produces is the brand's own. A link to the brand's
 * Content home sits beside the picker so nobody is stranded on a flat door.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BrandPicker } from "@/features/marketing/components/brands/BrandPicker";
import { useBrand } from "@/features/marketing/data/hooks";
import { marketingSeg } from "@/features/marketing/lib/keys";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { useAppSelector } from "@/lib/redux/hooks";
import { extractErrorMessage } from "@/utils/errors";

import { TopicalMapLoading } from "../components/TopicalMapStates";
import { MapLinkProvider } from "../links";
import { MAP_AUTHOR_SOURCE_KINDS, type MapAuthorSourceKind } from "../map-author";
import { StartMapScreen } from "../start/StartMapScreen";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { AGENT_ICON } from "@/components/icons/domain-icons";

export function TopicalMapStartDoor() {
  const search = useSearchParams();
  const research = search.get("research");
  const sourceParam = search.get("source");
  const source: MapAuthorSourceKind | null =
    sourceParam && (MAP_AUTHOR_SOURCE_KINDS as readonly string[]).includes(sourceParam)
      ? (sourceParam as MapAuthorSourceKind)
      : research
        ? "existing_research"
        : null;

  const organizationId = useAppSelector(selectActiveOrganizationId);
  const [brandId, setBrandId] = useState<string | null>(null);
  // access-errors: ok — the refusal is rendered verbatim below.
  const brand = useBrand(brandId ?? "");

  const brandValue =
    brandId && brand.data
      ? {
          id: brand.data.id,
          slug: brand.data.slug,
          name: brand.data.name,
          organizationId: brand.data.organization_id,
          seg: marketingSeg(brand.data),
        }
      : null;

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-textured">
      <div className="grid w-full gap-4 p-4 pt-[calc(var(--shell-header-h)+1rem)] sm:p-6 sm:pt-[calc(var(--shell-header-h)+1.5rem)]">
        <section className="rounded-xl border border-border bg-card p-5">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <AGENT_ICON className="h-5 w-5" aria-hidden />
            Start a topical map
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A map belongs to a brand. Pick the brand this map is for
            {research ? " — the finished research you came from is already selected as the source." : "."}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <BrandPicker organizationId={organizationId ?? null} value={brandId} onChange={setBrandId} />
            {brandValue ? (
              <Button asChild variant="outline" size="sm">
                <Link href={marketingRoutes.brandTopicalMapHome(brandValue.seg)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Open {brandValue.name}&apos;s Content home
                </Link>
              </Button>
            ) : null}
          </div>
          {brandId && brand.isError ? (
            <ErrorNotice size="inline" className="mt-2 text-sm" message={extractErrorMessage(brand.error)} />
          ) : null}
        </section>

        {brandId && brand.isPending ? <TopicalMapLoading what="the brand" /> : null}
        {brandValue ? (
          <MapLinkProvider brand={brandValue}>
            <section className="rounded-xl border border-primary/30 bg-card p-4 sm:p-5">
              <StartMapScreen
                brand={{
                  id: brandValue.id,
                  name: brandValue.name,
                  organizationId: brandValue.organizationId,
                }}
                initialSourceKind={source}
                initialResearchTopicId={research}
              />
            </section>
          </MapLinkProvider>
        ) : null}
      </div>
    </div>
  );
}
