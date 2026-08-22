"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BarChart3, ExternalLink, ShieldCheck } from "lucide-react";

import { Youtube } from "@/components/icons/brand-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarketingConnectionsWorkspace } from "@/features/marketing/components/integrations/MarketingConnectionsWorkspace";
import { SiteIntegrationsWorkspace } from "@/features/marketing/components/integrations/SiteIntegrationsWorkspace";
import { MarketingSiteProvider } from "@/features/marketing/components/site/MarketingSiteContext";
import { useSiteOptions } from "@/features/marketing/data/hooks";
import { parseSiteIntegrations } from "@/features/marketing/data/integrations-schema";
import { useSiteCrawlActivity } from "@/features/marketing/data/useSiteCrawlActivity";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { cn } from "@/lib/utils";

type ReviewSegment = "analytics" | "youtube";

export function GoogleAnalyticsYouTubeReviewRoot() {
  const searchParams = useSearchParams();
  const sites = useSiteOptions();
  const requestedSiteId = searchParams.get("siteId") ?? "";
  const [siteId, setSiteId] = useState(requestedSiteId);
  const [segment, setSegment] = useState<ReviewSegment>("analytics");

  const preferredSite = useMemo(() => {
    const available = sites.data ?? [];
    return (
      available.find((site) => site.id === siteId) ??
      available.find((site) => {
        const ga4 = parseSiteIntegrations(site.integrations).googleAnalytics4;
        return ga4.enabled && Boolean(ga4.credentialRef && ga4.resourceRef);
      }) ??
      available[0] ??
      null
    );
  }, [siteId, sites.data]);

  const crawlActivity = useSiteCrawlActivity(preferredSite?.id ?? "");

  if (sites.isLoading || !preferredSite) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-sm text-muted-foreground">
        {sites.isError
          ? "AI Matrx could not load the managed sites available to this reviewer."
          : "Loading the Google OAuth reviewer surface…"}
      </main>
    );
  }

  const sitePath = marketingRoutes.site(
    preferredSite.brand_id,
    preferredSite.id,
  );

  return (
    <MarketingSiteProvider
      value={{
        site: preferredSite,
        sitePath,
        brandId: preferredSite.brand_id ?? "",
        crawlActivity,
      }}
    >
      <main className="fixed inset-0 z-[100] flex h-dvh min-h-0 flex-col bg-background text-foreground">
        <header className="shrink-0 border-b bg-card px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-6xl space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">AI Matrx</span>
                  <Badge variant="outline">Google OAuth review</Badge>
                </div>
                <h1 className="mt-1 text-lg font-semibold">
                  Read-only Analytics and YouTube operations
                </h1>
                <p className="mt-0.5 max-w-4xl text-xs leading-5 text-muted-foreground">
                  This focused surface uses the same production OAuth client,
                  Vault-backed connections, provider APIs, and persisted data
                  paths as the normal product. It requests no Analytics or
                  YouTube write permission.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={preferredSite.id} onValueChange={setSiteId}>
                  <SelectTrigger className="w-72" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(sites.data ?? []).map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name} · {site.domain}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button asChild size="sm" variant="outline">
                  <Link href="/marketing/connections/google">
                    Manage or disconnect
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <ScopeCard
                active={segment === "analytics"}
                icon={<BarChart3 className="h-4 w-4" />}
                title="Google Analytics reporting"
                scope="analytics.readonly"
                explanation="Required to discover the Google identity's accessible GA4 properties and run reports for the property the user chooses. Google offers this read-only scope or broader write access; AI Matrx uses the read-only option."
                onClick={() => setSegment("analytics")}
              />
              <ScopeCard
                active={segment === "youtube"}
                icon={<Youtube className="h-4 w-4" />}
                title="Owned YouTube channel preview"
                scope="youtube.readonly"
                explanation="Required to identify channels owned by the signed-in user and read private-account video metadata. Public API-key access cannot identify the user's owned channel or return private uploads."
                onClick={() => setSegment("youtube")}
              />
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          {segment === "analytics" ? (
            <SiteIntegrationsWorkspace reviewMode />
          ) : (
            <MarketingConnectionsWorkspace reviewMode />
          )}
        </div>
      </main>
    </MarketingSiteProvider>
  );
}

function ScopeCard({
  active,
  icon,
  title,
  scope,
  explanation,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  scope: string;
  explanation: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-background hover:border-primary/50",
      )}
    >
      <div className="flex items-center gap-2 text-xs font-semibold">
        <span className="text-primary">{icon}</span>
        {title}
        <code className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          {scope}
        </code>
      </div>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
        {explanation}
      </p>
    </button>
  );
}
