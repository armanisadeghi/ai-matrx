"use client";

import { createContext, useContext } from "react";
import { useParams, usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  CircleDollarSign,
  ExternalLink,
  FileText,
  Gauge,
  Images,
  Inbox,
  Link2,
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

interface MarketingSiteContextValue {
  site: MarketingSite;
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

function sectionSuffix(pathname: string, siteId: string): string {
  const rest = pathname.slice(`/marketing/sites/${siteId}`.length);
  for (const section of [
    "discovery",
    "pages",
    "crawls",
    "analysis",
    "findings",
    "links",
    "screenshots",
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
  const params = useParams<{ siteId: string }>();
  const pathname = usePathname();
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
  return (
    <MarketingSiteContext.Provider value={{ site: current }}>
      <EntityModeHeader
        backHref="/marketing/sites"
        entityLabel={current.name}
        entityOptions={(options.data ?? []).map((option) => ({
          label: option.name,
          href: `/marketing/sites/${option.id}${sectionSuffix(pathname, siteId)}`,
          active: option.id === siteId,
        }))}
        modes={[
          { name: "Overview", href: `/marketing/sites/${siteId}`, icon: Gauge },
          {
            name: "Discovery",
            href: `/marketing/sites/${siteId}/discovery`,
            icon: Inbox,
          },
          {
            name: "Pages",
            href: `/marketing/sites/${siteId}/pages`,
            icon: FileText,
          },
          {
            name: "Crawls",
            href: `/marketing/sites/${siteId}/crawls`,
            icon: ScanSearch,
          },
          {
            name: "Analysis",
            href: `/marketing/sites/${siteId}/analysis`,
            icon: Activity,
          },
          {
            name: "Findings",
            href: `/marketing/sites/${siteId}/findings`,
            icon: AlertTriangle,
          },
          {
            name: "Links",
            href: `/marketing/sites/${siteId}/links`,
            icon: Link2,
          },
          {
            name: "Screenshots",
            href: `/marketing/sites/${siteId}/screenshots`,
            icon: Images,
          },
          {
            name: "Integrations",
            href: `/marketing/sites/${siteId}/integrations`,
            icon: Plug,
          },
          {
            name: "Cost",
            href: `/marketing/sites/${siteId}/cost`,
            icon: CircleDollarSign,
          },
          {
            name: "Access",
            href: `/marketing/sites/${siteId}/access`,
            icon: ShieldCheck,
          },
          {
            name: "Settings",
            href: `/marketing/sites/${siteId}/settings`,
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
      <div className="flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden pt-[var(--shell-header-h)]">
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </MarketingSiteContext.Provider>
  );
}
