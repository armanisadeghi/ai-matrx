"use client";

/**
 * The Content section's HOME — the real front door (PLAN §6 E).
 *
 * The brand's maps as cards (topics, proposals waiting, empty topics, sites
 * using it with their pages on no topic, last change; diagnostics strip; share;
 * "site uses map"; "extend from the site"), and START A MAP rendered IN PLACE
 * at the top — the Notion-AI-bar shape over the podcast studio's tile grid —
 * never a separate route: the six route files under `content/map/[mapId]` are
 * the coordinator's, and a start screen inside the home needs none.
 *
 * Start mode is the URL (`?start=<kind|1>&research=<rs_topic>&site=<id>` and
 * R14's extender `?start=data&map=<id>&site=<id>&extend=1`), so every entry
 * point in the app — the brand card's "Start a map", the research output
 * card, the site row's "Extend from the site" — is a plain link built by
 * `startMapHref`, and a reload lands on the same mode.
 *
 * `home_single_map_opens_workspace` (knob): a brand with exactly one map goes
 * straight into it — on a COLD arrival only. The check is the map's own
 * workspace state (`selectMapLoadedAt`): once the person has been inside the
 * map this session, coming back to the home is a choice, and bouncing them
 * again would make the header's "back" link a trap.
 *
 * `/marketing/<brand>/content` was a `permanentRedirect` into the content plan
 * until this screen shipped (placement decision 2026-09-16). The plan keeps
 * every address it had and is linked from here as what a topic's page is
 * written in.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { BrainCircuit, ListTree, Network, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useBrandSites } from "@/features/marketing/data/hooks";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { useAppSelector } from "@/lib/redux/hooks";

import { useTopicalMaps } from "../hooks";
import { useTopicalMapKnobs } from "../knobs";
import { MapLinkProvider } from "../links";
import { MAP_AUTHOR_SOURCE_KINDS, type MapAuthorSourceKind } from "../map-author";
import { selectMapLoadedAt } from "../redux/selectors";
import { StartMapScreen } from "../start/StartMapScreen";
import { TopicalMapHomeCard } from "./TopicalMapHomeCard";
import { TopicalMapEmpty, TopicalMapFailed, TopicalMapLoading } from "./TopicalMapStates";

/**
 * The home in start mode — THE builder every entry point uses. Never
 * hand-build this query string elsewhere.
 */
export function startMapHref(
  brandSeg: string,
  options: {
    source?: MapAuthorSourceKind;
    researchTopicId?: string | null;
    siteId?: string | null;
    /** R14: the extender on an existing map (`data`, `propose`, locked). */
    extendMapId?: string | null;
  } = {},
): string {
  const params = new URLSearchParams();
  params.set("start", options.source ?? (options.extendMapId ? "data" : "1"));
  if (options.researchTopicId) params.set("research", options.researchTopicId);
  if (options.siteId) params.set("site", options.siteId);
  if (options.extendMapId) {
    params.set("map", options.extendMapId);
    params.set("extend", "1");
  }
  return `${marketingRoutes.brandTopicalMapHome(brandSeg)}?${params.toString()}`;
}

function readSourceKind(value: string | null): MapAuthorSourceKind | null {
  return value && (MAP_AUTHOR_SOURCE_KINDS as readonly string[]).includes(value)
    ? (value as MapAuthorSourceKind)
    : null;
}

export function TopicalMapHome() {
  const brand = useMarketingBrand();
  const router = useRouter();
  const search = useSearchParams();
  const startParam = search.get("start");
  const startMode = startParam !== null;
  const startSource = readSourceKind(startParam);
  const research = search.get("research");
  const site = search.get("site");
  const extendMapId = search.get("extend") === "1" ? search.get("map") : null;

  const maps = useTopicalMaps({ organizationId: brand.organizationId, brandId: brand.id });
  const sites = useBrandSites(brand.id);
  const knobs = useTopicalMapKnobs();

  const onlyMapId = maps.data?.length === 1 ? (maps.data[0]?.id ?? "") : "";
  const onlyMapLoadedAt = useAppSelector(selectMapLoadedAt(onlyMapId));
  const bounce =
    !startMode &&
    onlyMapId !== "" &&
    knobs.knobs?.home_single_map_opens_workspace === true &&
    onlyMapLoadedAt === null;
  useEffect(() => {
    if (bounce) router.replace(marketingRoutes.brandTopicalMap(brand.seg, onlyMapId));
  }, [bounce, router, brand.seg, onlyMapId]);

  const homeHref = marketingRoutes.brandTopicalMapHome(brand.seg);
  const extendMap = extendMapId ? (maps.data ?? []).find((m) => m.id === extendMapId) ?? null : null;

  return (
    <MapLinkProvider brand={brand}>
      <div className="h-full overflow-y-auto overflow-x-hidden bg-textured">
        <div className="mx-auto grid max-w-5xl gap-4 p-4 pt-[calc(var(--shell-header-h)+1rem)] sm:p-6 sm:pt-[calc(var(--shell-header-h)+1.5rem)]">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 text-lg font-semibold">
                  <Network className="h-5 w-5" aria-hidden />
                  Content
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  The topical map decides which pages {brand.name} should have and where they
                  live. The content plan is where a page the map calls for actually gets written.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={marketingRoutes.brandContentPlan(brand.seg)}>
                    <ListTree className="h-4 w-4" aria-hidden />
                    Content plan
                  </Link>
                </Button>
                {startMode ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={homeHref}>
                      <X className="h-4 w-4" aria-hidden />
                      Close
                    </Link>
                  </Button>
                ) : (
                  <Button asChild size="sm">
                    <Link href={startMapHref(brand.seg)}>
                      <BrainCircuit className="h-4 w-4" aria-hidden />
                      Start a map
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </section>

          {startMode ? (
            <section className="rounded-xl border border-primary/30 bg-card p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <BrainCircuit className="h-4 w-4" aria-hidden />
                {extendMap
                  ? `Extend ${extendMap.name} from the site`
                  : extendMapId
                    ? "Extend the map from the site"
                    : `Start a map for ${brand.name}`}
              </h2>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                {extendMapId
                  ? "The author reads the site's crawl, keywords and content plan against the map as it stands and proposes what is missing. New topics land as proposals — nothing goes live until you accept it."
                  : "Pick where the map starts from. The author never invents an offering the source does not support; add emphasis for what matters most."}
              </p>
              {extendMapId && maps.isPending ? (
                <TopicalMapLoading what="the map to extend" />
              ) : (
                <StartMapScreen
                  brand={{ id: brand.id, name: brand.name, organizationId: brand.organizationId }}
                  initialSourceKind={extendMapId ? "data" : startSource}
                  initialResearchTopicId={research}
                  initialSiteId={site}
                  mapId={extendMapId}
                  mapName={extendMap?.name ?? null}
                  forcedChangeMode={extendMapId ? "propose" : null}
                  lockSourceKind={Boolean(extendMapId)}
                />
              )}
            </section>
          ) : null}

          {maps.isPending ? (
            <TopicalMapLoading what={`${brand.name}'s topical maps`} />
          ) : maps.isError ? (
            <TopicalMapFailed what={`${brand.name}'s topical maps`} error={maps.error} />
          ) : maps.data.length === 0 ? (
            startMode ? null : (
              <TopicalMapEmpty
                title={`${brand.name} has no topical map yet`}
                detail="A map is built from the brand's description, business facts, locations and its sites' data — or from documents, a description, a web page, or research. Nothing exists for this brand yet."
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link href={startMapHref(brand.seg, { source: "data" })}>
                        <BrainCircuit className="h-4 w-4" aria-hidden />
                        Start a map from this brand&apos;s data
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={marketingRoutes.brandIdentity(brand.seg)}>
                        Review the brand profile it would read
                      </Link>
                    </Button>
                  </div>
                }
              />
            )
          ) : (
            <div className="grid gap-4">
              {maps.data.map((map) => (
                <TopicalMapHomeCard
                  key={map.id}
                  map={map}
                  brandSites={sites.data ?? null}
                  extendHref={(mapId, siteId) =>
                    startMapHref(brand.seg, { extendMapId: mapId, siteId })
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </MapLinkProvider>
  );
}
