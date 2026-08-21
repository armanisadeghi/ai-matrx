"use client";

import { marketingRoutes } from "@/features/marketing/lib/routes";
import { BING_PROVIDER } from "@/features/marketing/lib/provider-names";
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
import { Youtube } from "@/components/icons/brand-icons";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { describeBackendFailure } from "@/lib/api/errors";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSiteOptions } from "@/features/marketing/data/hooks";
import { parseSiteIntegrations } from "@/features/marketing/data/integrations-schema";
import { useActiveOrganizationPicker } from "@/features/organizations/hooks/useActiveOrganizationPicker";
import {
  useConnectGoogle,
  useDisconnectGoogle,
  useGoogleConnectionInventory,
  useYouTubeChannelPreview,
} from "@/features/marketing/google/hooks";
import {
  GOOGLE_CONNECTION_SCOPES,
  type GoogleConnectionResource,
  type GoogleConnectionSummary,
} from "@/features/marketing/google/types";
import {
  diagnoseGoogleConnection,
  googleConnectionDiagnostics,
} from "@/features/marketing/google/health";
import {
  googleConnectionLabel,
  summarizeGoogleResourcesByConnection,
} from "@/features/marketing/google/presentation";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { useGoogleAPI } from "@/providers/google-provider/GoogleApiProvider";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { GOOGLE_YOUTUBE_SCOPES } from "@/lib/googleScopes";
import {
  GOOGLE_YOUTUBE_CAMPAIGN_PAUSE_REASON,
  assertGoogleYouTubeCampaignActive,
  canUseGoogleYouTube,
} from "@/features/marketing/google/youtube-campaign";

export function MarketingConnectionsWorkspace() {
  return (
    <LazyGoogleAPIProvider scopes={[...GOOGLE_CONNECTION_SCOPES]}>
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
  const youtubePreview = useYouTubeChannelPreview();
  const google = useGoogleAPI();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const [siteId, setSiteId] = useState("");
  const [connectingOwner, setConnectingOwner] = useState<
    "user" | "organization" | null
  >(null);
  const [authorizingYouTubeOwner, setAuthorizingYouTubeOwner] = useState<
    "user" | "organization" | null
  >(null);
  const [youtubeDisclosureAccepted, setYoutubeDisclosureAccepted] =
    useState(false);
  const [selectedYoutubeChannelId, setSelectedYoutubeChannelId] = useState("");
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
  const analyticsProperties = inventory.data?.resources.filter(
    (resource) => resource.resource_type === "analytics_property",
  );
  const youtubeChannels = inventory.data?.resources.filter(
    (resource) => resource.resource_type === "youtube_channel",
  );
  const pageSpeedEnabledCount = (sites.data ?? []).filter(
    (site) =>
      parseSiteIntegrations(site.integrations).pageSpeedInsights.enabled,
  ).length;
  const resourcesByConnection = summarizeGoogleResourcesByConnection(
    inventory.data?.resources ?? [],
  );
  const selectedYoutubeChannel = youtubeChannels?.find(
    (channel) => channel.id === selectedYoutubeChannelId,
  );
  const selectedYoutubeConnection = selectedYoutubeChannel
    ? inventory.data?.connections.find(
        (connection) => connection.id === selectedYoutubeChannel.connection_id,
      )
    : null;

  const connectionsCopy = webCopy({
    kind: "web-google-connections",
    label: "Google connections",
    description:
      "The Google connection inventory: connected accounts and their discovered Search Console, GA4, and YouTube resources (metadata only — never credentials).",
    surface: "Google connections",
    data: inventory.data ?? { connections: [], resources: [] },
    lines: [
      ["Connected accounts", connectedGoogleAccounts?.length ?? 0],
      ["Search Console properties", searchConsoleProperties?.length ?? 0],
      ["Analytics properties", analyticsProperties?.length ?? 0],
      ["YouTube channels", youtubeChannels?.length ?? 0],
      ["PageSpeed-enabled sites", pageSpeedEnabledCount],
      ...(availableGoogleAccounts ?? []).map((connection): [string, string] => [
        googleConnectionLabel(connection),
        `${connection.status} · ${connection.owner_type} · ${resourcesByConnection.get(connection.id)?.searchConsoleCount ?? 0} Search Console · ${resourcesByConnection.get(connection.id)?.analyticsCount ?? 0} Analytics · ${resourcesByConnection.get(connection.id)?.youtubeChannels.length ?? 0} YouTube`,
      ]),
    ],
    attributes: { count: availableGoogleAccounts?.length ?? 0 },
  });

  const startConnection = async (owner: "user" | "organization") => {
    setConnectingOwner(owner);
    try {
      const code = await google.requestAuthorizationCode([
        ...GOOGLE_CONNECTION_SCOPES,
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
      toast.success("Google services connected and resources discovered.");
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

  const authorizeYouTube = async (owner: "user" | "organization") => {
    setAuthorizingYouTubeOwner(owner);
    try {
      assertGoogleYouTubeCampaignActive(isSuperAdmin);
      if (!youtubeDisclosureAccepted) {
        throw new Error(
          "Confirm the read-only YouTube disclosure before continuing.",
        );
      }
      const code = await google.requestAuthorizationCode([
        ...GOOGLE_YOUTUBE_SCOPES,
      ]);
      const result = await connect.mutateAsync({
        code,
        owner:
          owner === "organization" && organizations.activeOrgId
            ? {
                type: "organization",
                organizationId: organizations.activeOrgId,
              }
            : { type: "user" },
      });
      const refreshed = await inventory.refetch();
      const discovered = (refreshed.data?.resources ?? []).filter(
        (resource) =>
          resource.connection_id === result.connectionId &&
          resource.resource_type === "youtube_channel",
      );
      if (!discovered.length) {
        throw new Error(
          "Google granted access but returned no owned YouTube channel for this identity.",
        );
      }
      setSelectedYoutubeChannelId(discovered[0].id);
      setYoutubeDisclosureAccepted(false);
      toast.success("YouTube channel discovered", {
        description: `${discovered.length} owned channel${discovered.length === 1 ? "" : "s"} found. Choose one and load its read-only preview.`,
      });
    } catch (error) {
      toast.error("YouTube was not authorized", {
        description:
          error instanceof Error
            ? error.message
            : "YouTube authorization did not finish.",
      });
    } finally {
      setAuthorizingYouTubeOwner(null);
    }
  };

  const loadYouTubePreview = async () => {
    if (!selectedYoutubeChannel || !selectedYoutubeConnection) return;
    try {
      assertGoogleYouTubeCampaignActive(isSuperAdmin);
      await youtubePreview.mutateAsync({
        connectionId: selectedYoutubeChannel.connection_id,
        channelId: selectedYoutubeChannel.resource_ref,
        organizationId: selectedYoutubeConnection.organization_id,
      });
    } catch (error) {
      toast.error("YouTube channel could not be read", {
        description:
          error instanceof Error ? error.message : "YouTube read failed.",
      });
    }
  };

  return (
    <>
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
                    <h2 className="text-sm font-semibold">GSC</h2>
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
                      resourcesByConnection.get(connection.id)
                        ?.searchConsoleCount ?? 0
                    }
                    analyticsCount={
                      resourcesByConnection.get(connection.id)
                        ?.analyticsCount ?? 0
                    }
                    youtubeChannels={
                      resourcesByConnection.get(connection.id)
                        ?.youtubeChannels ?? []
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
                    href={marketingRoutes.siteSettings(
                      selectedSite.brand_id,
                      selectedSite.id,
                      "integrations",
                    )}
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
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-red-600">
                <Youtube className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">YouTube</h2>
                  <Badge
                    variant={youtubeChannels?.length ? "success" : "secondary"}
                  >
                    {youtubeChannels?.length ?? 0} owned channel
                    {youtubeChannels?.length === 1 ? "" : "s"}
                  </Badge>
                  <Badge variant="outline">Read only</Badge>
                </div>
                <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                  Choose an owned channel and view its identity, statistics, and
                  recent uploads. AI Matrx cannot publish, edit, comment, or
                  manage the channel.
                </p>

                {!canUseGoogleYouTube(isSuperAdmin) ? (
                  <div className="mt-2 rounded-md border border-warning/40 bg-warning/5 p-2 text-[10px] leading-4 text-muted-foreground">
                    {GOOGLE_YOUTUBE_CAMPAIGN_PAUSE_REASON}
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    <label className="flex items-start gap-2 rounded-md border border-border bg-muted/20 p-2 text-[10px] leading-4">
                      <Checkbox
                        checked={youtubeDisclosureAccepted}
                        onCheckedChange={(checked) =>
                          setYoutubeDisclosureAccepted(checked === true)
                        }
                      />
                      <span>
                        I want AI Matrx to request read-only YouTube access and
                        discover channels owned by the Google identity I choose.
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={
                          !youtubeDisclosureAccepted ||
                          authorizingYouTubeOwner !== null
                        }
                        onClick={() => void authorizeYouTube("user")}
                      >
                        {authorizingYouTubeOwner === "user" ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Authorize personal channel
                      </Button>
                      {organizations.activeOrgId ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={
                            !youtubeDisclosureAccepted ||
                            authorizingYouTubeOwner !== null
                          }
                          onClick={() => void authorizeYouTube("organization")}
                        >
                          {authorizingYouTubeOwner === "organization" ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Authorize shared channel
                        </Button>
                      ) : null}
                    </div>

                    {youtubeChannels?.length ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Select
                          value={selectedYoutubeChannelId || undefined}
                          onValueChange={setSelectedYoutubeChannelId}
                        >
                          <SelectTrigger className="w-full sm:w-96" size="sm">
                            <SelectValue placeholder="Choose an owned channel" />
                          </SelectTrigger>
                          <SelectContent>
                            {youtubeChannels.map((channel) => {
                              const connection =
                                inventory.data?.connections.find(
                                  (item) => item.id === channel.connection_id,
                                );
                              return (
                                <SelectItem key={channel.id} value={channel.id}>
                                  {channel.display_name}
                                  {connection
                                    ? ` · ${googleConnectionLabel(connection)}`
                                    : ""}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={
                            !selectedYoutubeChannel || youtubePreview.isPending
                          }
                          onClick={() => void loadYouTubePreview()}
                        >
                          {youtubePreview.isPending ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          Load channel preview
                        </Button>
                      </div>
                    ) : null}

                    {youtubePreview.data ? (
                      <div className="space-y-2 rounded-md border border-border p-2">
                        <div>
                          <a
                            href={`https://www.youtube.com/channel/${youtubePreview.data.channel_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            {youtubePreview.data.title}
                          </a>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {youtubePreview.data.subscriber_count?.toLocaleString() ??
                              "—"}
                            {" subscribers · "}
                            {youtubePreview.data.video_count?.toLocaleString() ??
                              "—"}
                            {" public videos · "}
                            {youtubePreview.data.view_count?.toLocaleString() ??
                              "—"}
                            {" channel views"}
                          </p>
                        </div>
                        <div className="divide-y divide-border rounded-md border border-border">
                          {youtubePreview.data.recent_videos.map((video) => (
                            <div
                              key={video.video_id}
                              className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5"
                            >
                              <div className="min-w-0">
                                <a
                                  href={`https://www.youtube.com/watch?v=${video.video_id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block truncate text-[11px] font-medium text-primary hover:underline"
                                >
                                  {video.title}
                                </a>
                                <p className="text-[10px] text-muted-foreground">
                                  {video.published_at
                                    ? new Date(
                                        video.published_at,
                                      ).toLocaleDateString()
                                    : "Date unavailable"}
                                  {" · "}
                                  {video.view_count?.toLocaleString() ??
                                    "—"}{" "}
                                  views
                                  {video.privacy_status
                                    ? ` · ${video.privacy_status}`
                                    : ""}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
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
                    href={marketingRoutes.siteSettings(
                      selectedSite.brand_id,
                      selectedSite.id,
                      "integrations",
                    )}
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
                  <h2 className="text-sm font-semibold">
                    {BING_PROVIDER.label}
                  </h2>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Connect an API key and bind a verified Bing property to each
                    managed site on its own page.
                  </p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="h-8">
                <Link href={marketingRoutes.connectionsBing()}>
                  Manage Bing
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
  analyticsCount,
  youtubeChannels,
  busy,
  reconnecting,
  onDisconnect,
  onReconnect,
}: {
  connection: GoogleConnectionSummary;
  searchConsoleCount: number;
  analyticsCount: number;
  youtubeChannels: GoogleConnectionResource[];
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
            {googleConnectionLabel(connection)}
          </span>
          <Badge
            variant={
              usable
                ? "success"
                : diagnosis.blocking
                  ? "destructive"
                  : "warning"
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
          {searchConsoleCount === 1 ? "y" : "ies"} · Analytics: {analyticsCount}{" "}
          propert{analyticsCount === 1 ? "y" : "ies"} · YouTube:{" "}
          {youtubeChannels.length} channel
          {youtubeChannels.length === 1 ? "" : "s"}
        </p>
        {youtubeChannels.length ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            YouTube channels:{" "}
            {youtubeChannels.map((channel) => channel.display_name).join(", ")}
          </p>
        ) : null}
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
