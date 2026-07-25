"use client";

import { marketingRoutes } from "@/features/marketing/lib/routes";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Gauge,
  Globe2,
  Loader2,
  RefreshCw,
  SearchCheck,
  Unplug,
  UserRound,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { describeBackendFailure } from "@/lib/api/errors";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";
import { useSiteOptions } from "@/features/marketing/data/hooks";
import { parseSiteIntegrations } from "@/features/marketing/data/integrations-schema";
import { useActiveOrganizationPicker } from "@/features/organizations/hooks/useActiveOrganizationPicker";
import {
  useConnectGoogle,
  useDisconnectGoogle,
  useGoogleConnectionInventory,
} from "@/features/marketing/google/hooks";
import {
  GOOGLE_SEARCH_CONSOLE_SCOPES,
  type GoogleConnectionSummary,
} from "@/features/marketing/google/types";
import {
  diagnoseGoogleConnection,
  googleConnectionDiagnostics,
} from "@/features/marketing/google/health";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { useGoogleAPI } from "@/providers/google-provider/GoogleApiProvider";

export function MarketingConnectionsWorkspace() {
  return (
    <LazyGoogleAPIProvider scopes={[...GOOGLE_SEARCH_CONSOLE_SCOPES]}>
      <MarketingConnectionsContent />
    </LazyGoogleAPIProvider>
  );
}

function MarketingConnectionsContent() {
  const sites = useSiteOptions();
  const organizations = useActiveOrganizationPicker();
  const inventory = useGoogleConnectionInventory();
  const connect = useConnectGoogle();
  const disconnect = useDisconnectGoogle();
  const google = useGoogleAPI();
  const [siteId, setSiteId] = useState("");
  const [connectingOwner, setConnectingOwner] = useState<
    "user" | "organization" | null
  >(null);
  const effectiveSiteId =
    siteId || (sites.data?.length === 1 ? sites.data[0].id : "");
  const selectedSite = sites.data?.find((site) => site.id === effectiveSiteId);
  const availableGoogleAccounts = inventory.data?.connections.filter(
    (connection) => connection.status !== "revoked",
  );
  // DERIVED health, not the stored status: a row that lost its vault
  // credential cannot authorize anything and must never be counted as usable.
  const connectedGoogleAccounts = inventory.data?.connections.filter(
    (connection) => connection.health === "connected",
  );
  const searchConsoleProperties = inventory.data?.resources.filter(
    (resource) => resource.resource_type === "search_console_property",
  );
  const pageSpeedEnabledCount = (sites.data ?? []).filter(
    (site) =>
      parseSiteIntegrations(site.integrations).pageSpeedInsights.enabled,
  ).length;
  const searchResourcesByConnection = new Map<string, number>();
  for (const resource of inventory.data?.resources ?? []) {
    if (resource.resource_type !== "search_console_property") continue;
    searchResourcesByConnection.set(
      resource.connection_id,
      (searchResourcesByConnection.get(resource.connection_id) ?? 0) + 1,
    );
  }

  const connectionsCopy = webCopy({
    kind: "web-google-connections",
    label: "Google connections",
    description:
      "The Google connection inventory: connected accounts and their discovered Search Console/GA4 resources (metadata only — never credentials).",
    surface: "Google connections",
    data: inventory.data ?? { connections: [], resources: [] },
    lines: [
      ["Connected accounts", connectedGoogleAccounts?.length ?? 0],
      ["Search Console properties", searchConsoleProperties?.length ?? 0],
      ["PageSpeed-enabled sites", pageSpeedEnabledCount],
      ...(availableGoogleAccounts ?? []).map(
        (connection): [string, string] => [
          connection.account_name || connection.account_email || "Google account",
          `${connection.status} · ${connection.owner_type} · ${searchResourcesByConnection.get(connection.id) ?? 0} Search Console propert${(searchResourcesByConnection.get(connection.id) ?? 0) === 1 ? "y" : "ies"}`,
        ],
      ),
    ],
    attributes: { count: availableGoogleAccounts?.length ?? 0 },
  });

  const startConnection = async (owner: "user" | "organization") => {
    setConnectingOwner(owner);
    try {
      const code = await google.requestAuthorizationCode([
        ...GOOGLE_SEARCH_CONSOLE_SCOPES,
      ]);
      await connect.mutateAsync({
        code,
        owner:
          owner === "organization" && organizations.activeOrgId
            ? {
                type: "organization",
                organizationId: organizations.activeOrgId,
              }
            : { type: "user" },
      });
      toast.success("Search Console connected and properties discovered.");
    } catch (error) {
      // Show the actual reason — a generic "please try again" hides expired
      // consent, denied scopes, and vault write failures behind one sentence.
      const explanation = describeBackendFailure(error);
      captureError({
        source: "marketing-crawler",
        relation: "google:connect",
        message: explanation.cause,
        userMessage: explanation.headline,
        code: explanation.code,
        requestId: explanation.requestId,
        status: explanation.status ?? undefined,
        raw: { owner, chain: explanation.chain },
      });
      toast.error("Google could not be connected", {
        description: explanation.headline,
      });
    } finally {
      setConnectingOwner(null);
    }
  };

  return (
    <>
      <RouteHeader
        left={
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Google Connection
          </h1>
        }
        center={<MarketingWorkspaceNav />}
      />
      <main className="h-full overflow-y-auto bg-textured px-3 pb-4 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        <div className="space-y-3">
          <section className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
            <div>
              <Link
                href="/marketing/connections"
                className="text-[10px] font-medium text-primary"
              >
                Connections
              </Link>
              <h2 className="mt-0.5 text-sm font-semibold">Google</h2>
              <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">
                Connect an account for Search Console, then configure Google
                services for each managed site.
              </p>
            </div>
          </section>

          <section
            id="google-connections"
            className="rounded-lg border border-border bg-card"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <SearchCheck className="h-4 w-4" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">
                      Google Search Console
                    </h2>
                    <Badge
                      variant={
                        inventory.isLoading
                          ? "secondary"
                          : connectedGoogleAccounts?.length
                            ? "success"
                            : availableGoogleAccounts?.length
                              ? "warning"
                              : "secondary"
                      }
                    >
                      {inventory.isLoading
                        ? "Checking connection…"
                        : connectedGoogleAccounts?.length
                          ? `${connectedGoogleAccounts.length} account${connectedGoogleAccounts.length === 1 ? "" : "s"} · ${searchConsoleProperties?.length ?? 0} properties`
                          : availableGoogleAccounts?.length
                            ? "Needs attention"
                            : "Not connected"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Connect a Google account, review its discovered properties,
                    then assign the right property to each managed site.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                <CopyButtons size="icon" {...connectionsCopy} />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  disabled={
                    connectingOwner !== null ||
                    google.isInitializing ||
                    !google.isGoogleLoaded
                  }
                  onClick={() => startConnection("user")}
                >
                  {connectingOwner === "user" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UserRound className="h-3.5 w-3.5" />
                  )}
                  Add personal account
                </Button>
                {organizations.activeOrgId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    disabled={
                      connectingOwner !== null ||
                      google.isInitializing ||
                      !google.isGoogleLoaded
                    }
                    onClick={() => startConnection("organization")}
                  >
                    {connectingOwner === "organization" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Building2 className="h-3.5 w-3.5" />
                    )}
                    Add shared account
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1.5 text-xs"
                  disabled={inventory.isFetching}
                  onClick={() => inventory.refetch()}
                >
                  {inventory.isFetching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Refresh
                </Button>
              </div>
            </div>
            {inventory.isLoading ? (
              <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading
                connections…
              </div>
            ) : inventory.isError ? (
              <div className="flex items-center justify-between gap-3 p-3">
                <p className="text-xs text-destructive">
                  Google connections could not be loaded.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => inventory.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : availableGoogleAccounts?.length ? (
              <div className="divide-y divide-border">
                {availableGoogleAccounts.map((connection) => (
                  <ConnectionRow
                    key={connection.id}
                    connection={connection}
                    searchConsoleCount={
                      searchResourcesByConnection.get(connection.id) ?? 0
                    }
                    busy={disconnect.isPending}
                    onDisconnect={async () => {
                      try {
                        await disconnect.mutateAsync(connection.id);
                        toast.success("Google account disconnected.");
                      } catch (error) {
                        toast.error("Google could not be disconnected", {
                          description: describeBackendFailure(error).headline,
                        });
                      }
                    }}
                    reconnecting={
                      connectingOwner ===
                      (connection.owner_type === "organization"
                        ? "organization"
                        : "user")
                    }
                    onReconnect={() =>
                      void startConnection(
                        connection.owner_type === "organization"
                          ? "organization"
                          : "user",
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="p-3 text-xs text-muted-foreground">
                No Google accounts are connected yet.
              </p>
            )}
          </section>

          <section
            id="site-bindings"
            className="rounded-lg border border-border bg-card"
          >
            <div className="border-b border-border px-3 py-2">
              <h2 className="text-sm font-semibold">
                Assign a Search Console property to a site
              </h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Select a managed site, then choose its exact Search Console
                property and connect it.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 p-3">
              <Select
                value={effectiveSiteId || undefined}
                onValueChange={setSiteId}
              >
                <SelectTrigger className="w-full sm:w-80" size="sm">
                  <SelectValue
                    placeholder={
                      sites.isLoading
                        ? "Loading sites…"
                        : "Select a managed site"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(sites.data ?? []).map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name} · {site.domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSite ? (
                <Button asChild size="sm" className="h-8 gap-1.5">
                  <Link
                    href={marketingRoutes.site(selectedSite.brand_id, selectedSite.id, "/integrations")}
                  >
                    Choose Search Console property for {selectedSite.name}{" "}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : sites.data?.length ? (
                <Button size="sm" variant="outline" className="h-8" disabled>
                  Select a managed site
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline" className="h-8">
                  <Link href="/marketing/sites/new">Add a site first</Link>
                </Button>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Gauge className="h-4 w-4" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">
                      PageSpeed Insights
                    </h2>
                    <Badge variant="secondary">
                      {sites.isLoading
                        ? "Loading sites…"
                        : sites.isError
                          ? "Status unavailable"
                          : `${pageSpeedEnabledCount} of ${sites.data?.length ?? 0} sites enabled`}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    No Google account is required. Enable PageSpeed directly for
                    each managed site.
                  </p>
                </div>
              </div>
              {selectedSite ? (
                <Button asChild size="sm" variant="outline" className="h-8">
                  <Link
                    href={marketingRoutes.site(selectedSite.brand_id, selectedSite.id, "/integrations")}
                  >
                    Configure for {selectedSite.name}
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline" className="h-8">
                  <Link href="#site-bindings">Choose a managed site</Link>
                </Button>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Globe2 className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Bing Webmaster</h2>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Connect an API key and bind a verified Bing property to
                    each managed site on its own page.
                  </p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="h-8">
                <Link href={marketingRoutes.connectionsBing()}>
                  Manage Bing Webmaster
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function ConnectionRow({
  connection,
  searchConsoleCount,
  busy,
  reconnecting,
  onDisconnect,
  onReconnect,
}: {
  connection: GoogleConnectionSummary;
  searchConsoleCount: number;
  busy: boolean;
  reconnecting: boolean;
  onDisconnect: () => void;
  onReconnect: () => void;
}) {
  const diagnosis = diagnoseGoogleConnection(connection);
  const usable = connection.health === "connected";
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-xs font-semibold">
            {connection.account_name ||
              connection.account_email ||
              "Google account"}
          </span>
          <Badge
            variant={
              usable ? "success" : diagnosis.blocking ? "destructive" : "warning"
            }
          >
            {diagnosis.label}
          </Badge>
          <Badge variant="outline">
            {connection.owner_type === "organization"
              ? "Organization"
              : "Personal"}
          </Badge>
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Search Console: {searchConsoleCount} propert
          {searchConsoleCount === 1 ? "y" : "ies"}
        </p>
        {/* The exact reason, always — never "needs attention" with no cause. */}
        <p
          className={cn(
            "mt-1 max-w-3xl text-[10px] leading-4",
            diagnosis.blocking
              ? "text-destructive"
              : usable
                ? "text-muted-foreground"
                : "text-amber-700 dark:text-amber-400",
          )}
        >
          {diagnosis.reason}
          {diagnosis.remedy ? ` ${diagnosis.remedy}` : ""}
        </p>
        {usable && searchConsoleCount === 0 ? (
          <p className="mt-1 max-w-3xl text-[10px] text-muted-foreground">
            No Search Console properties were discovered for this account.
          </p>
        ) : null}
        <details className="mt-1 max-w-3xl">
          <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
            Diagnostics
          </summary>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            {googleConnectionDiagnostics(connection).map(([label, value]) => (
              <div key={label} className="col-span-2 grid grid-cols-subgrid">
                <dt className="text-[10px] text-muted-foreground">{label}</dt>
                <dd className="break-all font-mono text-[10px] text-foreground">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {usable ? null : (
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={reconnecting}
            onClick={onReconnect}
          >
            {reconnecting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Reconnect
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs text-destructive"
          disabled={busy}
          onClick={onDisconnect}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Unplug className="h-3.5 w-3.5" />
          )}
          Disconnect
        </Button>
      </div>
    </div>
  );
}
