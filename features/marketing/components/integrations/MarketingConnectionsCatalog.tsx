"use client";

import Link from "next/link";
import { ArrowRight, Gauge, Plus, SearchCheck } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { Badge } from "@/components/ui/badge";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";
import { useSiteOptions } from "@/features/marketing/data/hooks";
import { parseSiteIntegrations } from "@/features/marketing/data/integrations-schema";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";

export function MarketingConnectionsCatalog() {
  const inventory = useGoogleConnectionInventory();
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

  return (
    <>
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
            href="/marketing/connections/google"
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

          <section className="rounded-xl border border-dashed border-border bg-card/50 p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground">
              <Plus className="h-5 w-5" />
            </div>
            <h2 className="mt-3 text-base font-semibold">Coming soon</h2>
            <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
              Additional marketing and publishing providers will appear here as
              they become available.
            </p>
          </section>
        </div>
      </main>
    </>
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
