"use client";

import Link from "next/link";
import { ArrowRight, Gauge, Globe2, SearchCheck } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { Badge } from "@/components/ui/badge";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingScope } from "@/features/surfaces/manifests/marketing.manifest";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { useSiteOptions } from "@/features/marketing/data/hooks";
import { parseSiteIntegrations } from "@/features/marketing/data/integrations-schema";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { useBingConnectionInventory } from "@/features/marketing/bing/hooks";
import { siteHasActiveBingBinding } from "@/features/marketing/bing/binding";

export function MarketingConnectionsCatalog() {
  const inventory = useGoogleConnectionInventory();
  const bingInventory = useBingConnectionInventory();
  const sites = useSiteOptions();
  const connectedAccounts = (inventory.data?.connections ?? []).filter(
    (connection) => connection.status === "connected",
  );
  const searchConsoleProperties = (inventory.data?.resources ?? []).filter(
    (resource) => resource.resource_type === "search_console_property",
  );
  const searchConsoleSites = (sites.data ?? []).filter(
    (site) =>
      parseSiteIntegrations(site.integrations).googleSearchConsole.enabled,
  );
  const pageSpeedSites = (sites.data ?? []).filter(
    (site) =>
      parseSiteIntegrations(site.integrations).pageSpeedInsights.enabled,
  );
  const bingConnectedAccounts = (bingInventory.data?.connections ?? []).filter(
    (connection) => connection.status === "connected",
  );
  const bingDiscoveredSites = (bingInventory.data?.resources ?? []).length;
  const bingBoundSites = (sites.data ?? []).filter((site) =>
    siteHasActiveBingBinding(site.integrations),
  ).length;

  // Surface scope — the same connection picture the cards render, assembled at
  // trigger time. `loading` / `unavailable` ride along so an agent can never
  // read a failed inventory call as "nothing is connected".
  const getHubScope = () =>
    createMarketingScope({
      hub_view: "connections",
      connection_status: {
        google: {
          loading: inventory.isLoading,
          unavailable: inventory.isError,
          connected_accounts: connectedAccounts.length,
          search_console_properties_available:
            searchConsoleProperties.length,
          search_console_sites_configured: searchConsoleSites.length,
          pagespeed_sites_enabled: pageSpeedSites.length,
        },
        bing: {
          loading: bingInventory.isLoading,
          unavailable: bingInventory.isError,
          connected_accounts: bingConnectedAccounts.length,
          discovered_properties: bingDiscoveredSites,
          sites_bound: bingBoundSites,
        },
        sites: {
          loading: sites.isLoading,
          unavailable: sites.isError,
          total: sites.data?.length ?? null,
        },
      },
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing"
      getScope={getHubScope}
    >
      <RouteHeader
        left={
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Connections
          </h1>
        }
        center={<MarketingWorkspaceNav />}
      />
      <main className="h-full overflow-y-auto bg-textured px-3 pb-4 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        <div className="grid max-w-5xl gap-3 md:grid-cols-2">
          <Link
            href={marketingRoutes.connectionsGoogle()}
            className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background">
                <FcGoogle className="h-7 w-7" />
              </span>
              <Badge
                variant={
                  inventory.isLoading
                    ? "secondary"
                    : inventory.isError
                      ? "warning"
                      : connectedAccounts.length
                        ? "success"
                        : "secondary"
                }
              >
                {inventory.isLoading
                  ? "Checking connection…"
                  : inventory.isError
                    ? "Status unavailable"
                    : connectedAccounts.length
                      ? `${connectedAccounts.length} connected account${connectedAccounts.length === 1 ? "" : "s"}`
                      : "Not connected"}
              </Badge>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Google</h2>
                <p className="text-xs text-muted-foreground">
                  Connect Google services to your managed sites.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>

            <div className="mt-4 divide-y divide-border rounded-lg border border-border">
              <ServiceRow
                icon={SearchCheck}
                label="Search Console"
                detail={
                  inventory.isLoading || sites.isLoading
                    ? "Loading connection details…"
                    : inventory.isError || sites.isError
                      ? "Connection details unavailable"
                      : `${searchConsoleProperties.length} available properties · ${searchConsoleSites.length} sites configured`
                }
              />
              <ServiceRow
                icon={Gauge}
                label="PageSpeed Insights"
                detail={
                  sites.isLoading
                    ? "Loading site configuration…"
                    : sites.isError
                      ? "Site configuration unavailable"
                      : `${pageSpeedSites.length} sites enabled · no account required`
                }
              />
            </div>

            <p className="mt-3 text-xs font-medium text-primary">
              Manage Google connection
            </p>
          </Link>

          <Link
            href={marketingRoutes.connectionsBing()}
            className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background">
                <Globe2 className="h-6 w-6 text-primary" />
              </span>
              <Badge
                variant={
                  bingInventory.isLoading
                    ? "secondary"
                    : bingInventory.isError
                      ? "warning"
                      : bingConnectedAccounts.length
                        ? "success"
                        : "secondary"
                }
              >
                {bingInventory.isLoading
                  ? "Checking connection…"
                  : bingInventory.isError
                    ? "Status unavailable"
                    : bingConnectedAccounts.length
                      ? `${bingConnectedAccounts.length} connected account${bingConnectedAccounts.length === 1 ? "" : "s"}`
                      : "Not connected"}
              </Badge>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Bing Webmaster</h2>
                <p className="text-xs text-muted-foreground">
                  Connect Bing Webmaster Tools to your managed sites.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>

            <div className="mt-4 divide-y divide-border rounded-lg border border-border">
              <ServiceRow
                icon={SearchCheck}
                label="Search performance"
                detail={
                  bingInventory.isLoading || sites.isLoading
                    ? "Loading connection details…"
                    : bingInventory.isError || sites.isError
                      ? "Connection details unavailable"
                      : `${bingDiscoveredSites} discovered properties · ${bingBoundSites} sites configured`
                }
              />
            </div>

            <p className="mt-3 text-xs font-medium text-primary">
              Manage Bing Webmaster connection
            </p>
          </Link>
        </div>
      </main>
    </SurfaceRuntimeProvider>
  );
}

function ServiceRow({
  icon: Icon,
  label,
  detail,
}: {
  icon: typeof SearchCheck;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs font-medium">{label}</p>
        <p className="truncate text-[10px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
