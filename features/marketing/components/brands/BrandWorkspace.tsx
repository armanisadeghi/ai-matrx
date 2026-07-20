"use client";

import Link from "next/link";
import {
  AtSign,
  ExternalLink,
  Globe2,
  Images,
  Inbox,
  MapPin,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import {
  useBrand,
  useBrandAssets,
  useBrandProperties,
  useBrandSites,
  useBusinessFacts,
  usePendingDiscoveredCount,
} from "@/features/marketing/data/hooks";
import {
  LoadingSurface,
  QueryError,
  SectionCard,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  SiteConnectionChips,
  SiteIdentityMark,
} from "@/features/marketing/components/shared/SiteConnectionChips";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { isJsonRecord } from "@/features/marketing/types";
import type { BrandAsset, BusinessFact } from "@/features/marketing/types";

function factValueText(fact: BusinessFact): string {
  if (isJsonRecord(fact.value)) {
    const candidate = fact.value.url ?? fact.value.text ?? fact.value.value;
    if (typeof candidate === "string" && candidate) return candidate;
    return JSON.stringify(fact.value);
  }
  return String(fact.value ?? "");
}

function assetPreviewUrl(asset: BrandAsset): string | null {
  return asset.source_url &&
    /\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(asset.source_url)
    ? asset.source_url
    : null;
}

export function BrandWorkspace({ brandId }: { brandId: string }) {
  const brand = useBrand(brandId);
  const sites = useBrandSites(brandId);
  const properties = useBrandProperties(brandId);
  const assets = useBrandAssets(brandId);
  const facts = useBusinessFacts(brandId);
  const pending = usePendingDiscoveredCount(brandId);

  if (brand.isLoading) {
    return (
      <>
        <RouteHeader
          left={
            <ChevronLeftTapButton
              href={marketingRoutes.brands()}
              ariaLabel="All brands"
            />
          }
        />
        <LoadingSurface label="Loading brand…" />
      </>
    );
  }
  if (brand.isError || !brand.data) {
    return (
      <>
        <RouteHeader
          left={
            <ChevronLeftTapButton
              href={marketingRoutes.brands()}
              ariaLabel="All brands"
            />
          }
        />
        <QueryError
          error={brand.error ?? new Error("Brand not found")}
          onRetry={() => void brand.refetch()}
        />
      </>
    );
  }

  const current = brand.data;
  const websiteSites = sites.data ?? [];
  const socialProperties = (properties.data ?? []).filter(
    (property) => property.kind !== "website",
  );
  const primarySiteDiscovery = websiteSites[0]
    ? marketingRoutes.site(brandId, websiteSites[0].id, "/discovery")
    : null;

  return (
    <>
      <RouteHeader
        left={
          <div className="flex items-center gap-2">
            <ChevronLeftTapButton
              href={marketingRoutes.brands()}
              ariaLabel="All brands"
            />
            <h1 className="truncate text-sm font-medium text-foreground">
              {current.name}
            </h1>
          </div>
        }
      />
      <main className="h-dvh overflow-y-auto bg-textured p-3 pt-[calc(var(--shell-header-h)+0.5rem)] sm:p-4 sm:pt-[calc(var(--shell-header-h)+0.75rem)]">
        <div className="grid w-full gap-3">
          <section className="flex flex-wrap items-start gap-4 rounded-lg border border-border bg-card p-4">
            <SiteIdentityMark site={current} size={56} />
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                {current.name}
              </h2>
              {current.website_url ? (
                <a
                  href={current.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
                >
                  <span className="truncate">{current.website_url}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
                </a>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge value={current.status} />
                {current.industry ? (
                  <Badge variant="outline">{current.industry}</Badge>
                ) : null}
              </div>
              {current.description ? (
                <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">
                  {current.description}
                </p>
              ) : null}
            </div>
            {pending.data ? (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
              >
                <Link href={primarySiteDiscovery ?? marketingRoutes.brands()}>
                  <Inbox className="h-3.5 w-3.5" />
                  {pending.data.toLocaleString()} to review
                </Link>
              </Button>
            ) : null}
          </section>

          <SectionCard
            title="Websites"
            action={{ label: "Add site", href: marketingRoutes.newSite() }}
          >
            {websiteSites.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">
                No website property yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {websiteSites.map((site) => (
                  <li
                    key={site.id}
                    className="flex flex-wrap items-center gap-3 px-3 py-2"
                  >
                    <SiteIdentityMark site={site} size={28} />
                    <div className="min-w-0 flex-1 basis-48">
                      <Link
                        href={marketingRoutes.site(brandId, site.id)}
                        className="block truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {site.name}
                      </Link>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {site.domain}
                      </p>
                    </div>
                    <SiteConnectionChips site={site} />
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                    >
                      <Link href={marketingRoutes.site(brandId, site.id)}>
                        Open
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <div className="grid gap-3 lg:grid-cols-2">
            <SectionCard title="Social profiles & other properties">
              {socialProperties.length === 0 ? (
                <div className="flex flex-col items-start gap-2 p-4">
                  <p className="text-xs text-muted-foreground">
                    No social properties yet. Site initialization discovers
                    profile links; confirming them will register the property
                    here.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {socialProperties.map((property) => (
                    <li
                      key={property.id}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <AtSign className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium capitalize text-foreground">
                          {property.kind.replace(/_/g, " ")}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {property.url || property.handle || "—"}
                        </p>
                      </div>
                      {property.url ? (
                        <a
                          href={property.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Business facts">
              {(facts.data ?? []).length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">
                  No confirmed facts yet. Review the discovery inbox to confirm
                  phones, emails, addresses, and taglines.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {(facts.data ?? []).map((fact) => (
                    <li
                      key={fact.id}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {fact.label || fact.kind.replace(/_/g, " ")}
                        </p>
                        <p className="truncate text-sm text-foreground">
                          {factValueText(fact)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Brand assets">
            {(assets.data ?? []).length === 0 ? (
              <div className="flex min-h-28 flex-col items-center justify-center gap-2 p-4 text-center">
                <Images className="h-6 w-6 text-muted-foreground" />
                <p className="max-w-md text-xs text-muted-foreground">
                  No confirmed assets yet. Initialize a site, then confirm
                  logos, favicons, and imagery from its discovery inbox — they
                  become the brand's asset library here.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4 lg:grid-cols-6">
                {(assets.data ?? []).map((asset) => {
                  const preview = assetPreviewUrl(asset);
                  return (
                    <li
                      key={asset.id}
                      className="overflow-hidden rounded-md border border-border bg-muted/20"
                    >
                      <div className="flex aspect-square items-center justify-center bg-card p-2">
                        {preview ? (
                          // Confirmed assets reference the brand's own public URLs.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={preview}
                            alt={asset.title ?? asset.kind}
                            className="max-h-full max-w-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <Globe2 className="h-6 w-6 text-muted-foreground/50" />
                        )}
                      </div>
                      <p className="truncate border-t border-border px-2 py-1 text-[10px] font-medium capitalize text-muted-foreground">
                        {asset.kind.replace(/_/g, " ")}
                        {asset.title ? ` · ${asset.title}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>
      </main>
    </>
  );
}
