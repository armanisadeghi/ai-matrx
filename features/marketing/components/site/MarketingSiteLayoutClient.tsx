"use client";

import { createContext, useContext } from "react";
import { useParams, usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CircleDollarSign,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Gauge,
  Grid3x3,
  Inbox,
  Link2,
  Map,
  Plug,
  ScanSearch,
  Settings,
  ShieldCheck,
} from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { useSite, useSiteOptions } from "@/features/marketing/data/hooks";
import type { MarketingSite } from "@/features/marketing/types";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { marketingRoutes } from "@/features/marketing/lib/routes";

interface MarketingSiteContextValue {
  site: MarketingSite;
  /** Canonical brand-first base path for this site (no trailing slash). */
  sitePath: string;
}

const MarketingSiteContext = createContext<MarketingSiteContextValue | null>(
  null,
);

export function useMarketingSite() {
  const value = useContext(MarketingSiteContext);
  if (!value)
    throw new Error(
      "useMarketingSite must be used inside MarketingSiteLayoutClient.",
    );
  return value;
}

function sectionSuffix(pathname: string, brandId: string, siteId: string): string {
  const rest = pathname.slice(
    marketingRoutes.site(brandId, siteId).length,
  );
  for (const section of [
    "discovery",
    "sitemaps",
    "coverage",
    "audit",
    "pages",
    "crawls",
    "analysis",
    "findings",
    "links",
    "integrations",
    "cost",
    "access",
    "settings",
  ]) {
    if (rest.startsWith(`/${section}`)) return `/${section}`;
  }
  return "";
}

function FallbackHeader() {
  return (
    <RouteHeader
      left={
        <ChevronLeftTapButton href="/marketing/sites" ariaLabel="All sites" />
      }
    />
  );
}

export function MarketingSiteLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ brandId: string; siteId: string }>();
  const pathname = usePathname();
  const brandId = params.brandId;
  const siteId = params.siteId;
  const site = useSite(siteId);
  const options = useSiteOptions();

  if (site.isLoading) {
    return (
      <>
        <FallbackHeader />
        <LoadingSurface label="Loading site…" />
      </>
    );
  }

  if (site.isError || !site.data) {
    return (
      <>
        <FallbackHeader />
        <QueryError
          error={site.error ?? new Error("Site not found")}
          onRetry={() => void site.refetch()}
        />
      </>
    );
  }

  const current = site.data;
  if (current.brand_id !== brandId) {
    // A cross-brand URL must never resolve another brand's site.
    return (
      <>
        <FallbackHeader />
        <QueryError
          error={
            new Error("This site does not belong to the brand in the URL.")
          }
        />
      </>
    );
  }
  const base = marketingRoutes.site(brandId, siteId);
  return (
    <MarketingSiteContext.Provider value={{ site: current, sitePath: base }}>
      <EntityModeHeader
        backHref={marketingRoutes.brand(brandId)}
        entityLabel={current.name}
        entityOptions={(options.data ?? []).map((option) => ({
          label: option.name,
          href: `${marketingRoutes.site(option.brand_id, option.id)}${sectionSuffix(pathname, brandId, siteId)}`,
          active: option.id === siteId,
        }))}
        modes={[
          { name: "Overview", href: `${base}`, icon: Gauge },
          {
            name: "Discovery",
            href: `${base}/discovery`,
            icon: Inbox,
          },
          {
            name: "Sitemaps",
            href: `${base}/sitemaps`,
            icon: Map,
          },
          {
            name: "Coverage",
            href: `${base}/coverage`,
            icon: Grid3x3,
          },
          {
            name: "Audit",
            href: `${base}/audit`,
            icon: ClipboardCheck,
          },
          {
            name: "Pages",
            href: `${base}/pages`,
            icon: FileText,
          },
          {
            name: "Crawls",
            href: `${base}/crawls`,
            icon: ScanSearch,
          },
          {
            name: "Analysis",
            href: `${base}/analysis`,
            icon: Activity,
          },
          {
            name: "Findings",
            href: `${base}/findings`,
            icon: AlertTriangle,
          },
          {
            name: "Links",
            href: `${base}/links`,
            icon: Link2,
          },
          {
            name: "Integrations",
            href: `${base}/integrations`,
            icon: Plug,
          },
          {
            name: "Cost",
            href: `${base}/cost`,
            icon: CircleDollarSign,
          },
          {
            name: "Access",
            href: `${base}/access`,
            icon: ShieldCheck,
          },
          {
            name: "Settings",
            href: `${base}/settings`,
            icon: Settings,
          },
        ]}
        actions={[
          {
            label: "Open live site",
            icon: ExternalLink,
            href: current.root_url,
          },
        ]}
      />
      <div className="flex h-full min-h-0 flex-col overflow-hidden pt-[var(--shell-header-h)]">
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </MarketingSiteContext.Provider>
  );
}
