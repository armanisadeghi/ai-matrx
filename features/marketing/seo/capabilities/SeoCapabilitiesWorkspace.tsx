"use client";

import Link from "next/link";
import { ArrowRight, Database, Gauge, SearchCheck } from "lucide-react";

import { CatalogueAnalysisPanel } from "@/features/marketing/components/analysis/CatalogueAnalysisPanel";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  useSiteAuditRollup,
  useSiteOverview,
} from "@/features/marketing/data/hooks";
import {
  siteSeoCapabilities,
  type SeoCapabilityGroup,
} from "@/features/marketing/seo/capabilities/capabilities";

const groupCopy: Record<
  SeoCapabilityGroup,
  { title: string; description: string; icon: typeof Gauge }
> = {
  snapshot: {
    title: "Snapshot audit",
    description:
      "Checks stored directly on each captured page. These appear as soon as pages are crawled; they are not the catalogue findings system.",
    icon: Gauge,
  },
  catalogue: {
    title: "Catalogue analysis",
    description:
      "Checks executed over stored evidence. Their results feed site scores, the priority queue, and the findings register.",
    icon: SearchCheck,
  },
  provider: {
    title: "Provider intelligence",
    description:
      "Measurements imported from external systems. Missing data here usually means a connection or collection gap, not a failed crawl check.",
    icon: Database,
  },
};

export function SeoCapabilitiesWorkspace() {
  const { site, sitePath } = useMarketingSite();
  const audit = useSiteAuditRollup(site.id);
  const overview = useSiteOverview(site.id);
  const capabilities = siteSeoCapabilities(sitePath);

  if (audit.isPending || overview.isPending) {
    return <LoadingSurface label="Loading SEO capabilities…" />;
  }
  if (audit.isError) {
    return (
      <QueryError error={audit.error} onRetry={() => void audit.refetch()} />
    );
  }
  if (overview.isError) {
    return (
      <QueryError
        error={overview.error}
        onRetry={() => void overview.refetch()}
      />
    );
  }

  const liveAudit = audit.data;
  const liveOverview = overview.data;
  const snapshotStatus = `${liveAudit.auditedPages.toLocaleString()} of ${liveAudit.totalPages.toLocaleString()} pages audited`;
  const providerStatus: Partial<Record<string, string>> = {
    "search-console": `${liveOverview.pagesInGsc.toLocaleString()} pages seen in Search Console`,
    "page-speed": "Open to see current measurement coverage",
    backlinks: "Open to see the latest provider snapshot",
    "rank-tracking": "Open to see tracked keyword coverage",
    "provider-connections": "Open to verify connection health",
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 lg:p-6">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {site.domain}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          SEO capabilities
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          One place to find what this site can measure, where each result lives,
          and which system produces it. Every capability below opens its working
          destination.
        </p>
      </header>

      {(["snapshot", "catalogue", "provider"] as const).map((group) => {
        const copy = groupCopy[group];
        const Icon = copy.icon;
        return (
          <section
            key={group}
            className="overflow-hidden rounded-lg border bg-card"
          >
            <div className="flex gap-3 border-b px-4 py-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <h2 className="text-sm font-semibold">{copy.title}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {copy.description}
                </p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3">
              {capabilities
                .filter((capability) => capability.group === group)
                .map((capability) => {
                  const status =
                    capability.key === "snapshot-audit"
                      ? snapshotStatus
                      : providerStatus[capability.key];
                  return (
                    <Link
                      key={capability.key}
                      href={capability.destination}
                      className="group flex min-h-36 flex-col border-b p-4 transition-colors hover:bg-muted/40 md:border-r"
                    >
                      <h3 className="text-sm font-medium group-hover:underline">
                        {capability.label}
                      </h3>
                      <p className="mt-1 flex-1 text-xs leading-5 text-muted-foreground">
                        {capability.description}
                      </p>
                      {status ? (
                        <p className="mt-2 text-[11px] font-medium text-foreground">
                          {status}
                        </p>
                      ) : null}
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                        {capability.evidenceLabel}
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  );
                })}
            </div>
          </section>
        );
      })}

      <CatalogueAnalysisPanel />
    </div>
  );
}
