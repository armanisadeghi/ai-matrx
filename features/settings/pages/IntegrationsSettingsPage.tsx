"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchCatalog,
  connectServer,
  connectServerWithCredentials,
  disconnectServer,
  discoverServerTools,
  selectMcpCatalog,
  selectMcpCatalogStatus,
  selectMcpCatalogError,
  selectMcpConnectingServerId,
} from "@/features/agents/redux/mcp/mcp.slice";
import type { McpCatalogEntry } from "@/features/agents/types/mcp.types";
import { startMcpOAuthPopup } from "@/features/agents/services/mcp-oauth/popup";
import { buildSupabaseScopedMcpEndpoint } from "@/features/agents/services/mcp-oauth/endpoint";
import { toast, recordToast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";

import {
  mcpEntryBrief,
  mcpEntryMeta,
  mcpEntrySummary,
  mcpLocation,
  MCP_CSV_COLUMNS,
} from "@/features/agents/mcp-copy";

import {
  Globe,
  Radio,
  Terminal,
  ExternalLink,
  BookOpen,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  Clock,
  Loader2,
  Shield,
  Key,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Zap,
  Info,
  Plus,
  Trash2,
  Settings2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { GitHubConnectionCard } from "@/features/github-integration/GitHubConnectionCard";
import { githubConnectUrl } from "@/features/github-integration/service";
import { useGitHubConnection } from "@/features/github-integration/useGitHubConnection";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { ConnectorsSettingsPanel } from "@/features/connectors/ConnectorsSettingsPanel";
import { providerArtworkUrls } from "@/features/connectors/live-connectors";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { useSurfaceScopeContribution } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  catalogActionPresentation,
  catalogConnectionPresentation,
  catalogDirectoryAvailability,
} from "./integration-catalog-state";
import {
  buildManualMcpCredentials,
  type ManualHeaderInput,
} from "./manual-mcp-credentials";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  ensureOrganizationForRequest,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";
import { toolCheckFailure } from "./integration-tool-check";
import { MicrosoftConnectPanel } from "@/features/microsoft-integration/MicrosoftConnectPanel";
import { StorageConnectionsPanel } from "@/features/storage-connections/StorageConnectionsPanel";
import { useOpenLiveIntegrationsWindow } from "@/features/overlays/openers/liveIntegrationsWindow";
import { listMicrosoftConnections } from "@/features/microsoft-integration/service";
import type { MicrosoftConnection } from "@/features/microsoft-integration/types";
import { listStorageConnections } from "@/features/storage-connections/service";
import type { StorageConnection } from "@/features/storage-connections/types";
import { IntegrationDirectory } from "@/features/connectors/IntegrationDirectory";
import { useSettingsTabNavigate } from "@/features/settings/components/SettingsPresentationContext";
import {
  DEFAULT_DIRECTORY_FILTERS,
  directoryDetailFromParams,
  filterDirectory,
  savedAccountSummary,
  type DirectoryFilters,
  type IntegrationDirectoryItem,
} from "@/features/connectors/integration-directory";
import { getConnector } from "@/features/connectors/registry";
import { GOOGLE_CONNECTOR_PROVIDER } from "@/features/connectors/provider-config";
import { MICROSOFT_CAMPAIGN_DESCRIPTORS } from "@/features/microsoft-integration/campaigns";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

// ─── Constants ───────────────────────────────────────────────────────────────

const TRANSPORT_META: Record<
  string,
  { label: string; icon: React.ReactNode; className: string }
> = {
  http: {
    label: "HTTP",
    icon: <Globe className="h-3 w-3" />,
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  sse: {
    label: "SSE",
    icon: <Radio className="h-3 w-3" />,
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  stdio: {
    label: "Local",
    icon: <Terminal className="h-3 w-3" />,
    className: "bg-green-500/10 text-green-600 dark:text-green-400",
  },
};

const AUTH_LABELS: Record<string, string> = {
  oauth_discovery: "OAuth 2.1",
  bearer: "Bearer Token",
  api_key: "API Key",
  env: "Env Vars",
  none: "No Auth",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; icon: React.ReactNode }
> = {
  connected: {
    label: "Connected",
    className:
      "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20",
    icon: <Check className="h-3 w-3" />,
  },
  expired: {
    label: "Expired",
    className:
      "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
    icon: <Clock className="h-3 w-3" />,
  },
  refresh_failed: {
    label: "Refresh Failed",
    className:
      "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/20",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  needs_reauth: {
    label: "Needs re-auth",
    className:
      "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/20",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  checking: {
    label: "Checking…",
    className: "bg-muted text-muted-foreground border-border",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  error: {
    label: "Error",
    className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20",
    icon: <X className="h-3 w-3" />,
  },
  disconnected: {
    label: "Not Connected",
    className: "bg-muted text-muted-foreground border-border",
    icon: <Unlock className="h-3 w-3" />,
  },
};

export type ViewFilter = "all" | "connected" | "available" | "coming_soon";

/**
 * "Your connections" section summary — the loading-state guard the class of
 * bug is named for.
 *
 * `totalConnected` alone told a partial truth: it only ever reflected the MCP
 * catalog, never the GitHub card or the Google directory cards that render in
 * the SAME section right below it, and neither `status` (the catalog fetch)
 * nor either of those two other loading states gated the claim it made. On a
 * cold load, `totalConnected` reads `0` on the very first paint — before ANY
 * of the three sources has answered — so the summary declared "Nothing
 * connected yet" in the same instant `GitHubConnectionCard` right underneath
 * it was still showing "Loading GitHub account…": a loading surface and its
 * own "found nothing" verdict, on screen together. The fix is the rule this
 * whole family must follow: the empty sentence is earned only by "no items
 * AND nothing still loading" — never by item count alone.
 */
export function connectionsSummaryLabel(
  stillLoading: boolean,
  totalConnected: number,
): string {
  if (stillLoading) return "Checking connections…";
  return totalConnected > 0
    ? `${totalConnected} active`
    : "Nothing connected yet";
}

// ─── Main Page ───────────────────────────────────────────────────────────────

/** The directory card that opens Settings → API keys (personal keys). */
const API_KEYS_ITEM_ID = "native:api-keys";

export function IntegrationsWorkspace({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const organizationId = useAppSelector(selectOrganizationId);
  const userId = useAppSelector(selectUserId);
  const dispatch = useAppDispatch();
  const catalog = useAppSelector(selectMcpCatalog);
  const status = useAppSelector(selectMcpCatalogStatus);
  const error = useAppSelector(selectMcpCatalogError);
  const connectingId = useAppSelector(selectMcpConnectingServerId);
  const github = useGitHubConnection();
  const googleInventory = useGoogleConnectionInventory();
  const githubStatus = github.loading
    ? undefined
    : (github.inventory.connection?.status ?? null);
  const catalogPresentation = (entry: McpCatalogEntry) =>
    catalogConnectionPresentation(entry, githubStatus, github.loading);
  const [filters, setFilters] = useState<DirectoryFilters>(
    DEFAULT_DIRECTORY_FILTERS,
  );
  const params = useSearchParams();
  const openSettingsTab = useSettingsTabNavigate();
  const returnTarget = !embedded && params ? directoryDetailFromParams(params) : null;
  const [selectedDetail, setSelectedDetail] = useState<string | null>(
    returnTarget,
  );
  const [checkingServerId, setCheckingServerId] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [handledReturnTarget, setHandledReturnTarget] = useState(returnTarget);
  if (handledReturnTarget !== returnTarget) {
    setHandledReturnTarget(returnTarget);
    if (returnTarget) setSelectedDetail(returnTarget);
  }
  const [nativeInventory, setNativeInventory] = useState<{
    userId: string;
    version: number;
    microsoft: MicrosoftConnection[];
    storage: StorageConnection[];
    errors: { microsoft: string | null; storage: string | null };
  } | null>(null);
  const nativeLoading =
    !nativeInventory ||
    nativeInventory.userId !== userId ||
    nativeInventory.version !== refreshVersion;
  const currentInventory =
    nativeInventory?.userId === userId ? nativeInventory : null;
  const microsoftConnections = currentInventory?.microsoft ?? [];
  const storageConnections = currentInventory?.storage ?? [];
  const nativeErrors = currentInventory?.errors ?? {
    microsoft: null,
    storage: null,
  };
  const openWindow = useOpenLiveIntegrationsWindow();

  useEffect(() => {
    if (status === "idle") void dispatch(fetchCatalog());
  }, [dispatch, status]);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    void Promise.allSettled([
      listMicrosoftConnections(controller.signal),
      listStorageConnections(controller.signal),
    ]).then(([microsoft, storage]) => {
      if (controller.signal.aborted) return;
      const message = (reason: unknown) =>
        reason instanceof Error
          ? reason.message
          : "The connection inventory could not be loaded.";
      setNativeInventory({
        userId,
        version: refreshVersion,
        microsoft: microsoft.status === "fulfilled" ? microsoft.value : [],
        storage: storage.status === "fulfilled" ? storage.value : [],
        errors: {
          microsoft:
            microsoft.status === "rejected" ? message(microsoft.reason) : null,
          storage:
            storage.status === "rejected" ? message(storage.reason) : null,
        },
      });
    });
    return () => controller.abort();
  }, [userId, refreshVersion]);

  const refresh = () => {
    void dispatch(fetchCatalog());
    void github.reload();
    void googleInventory.refetch();
    setRefreshVersion((value) => value + 1);
  };
  const selectDetail = (id: string | null) => {
    // API keys are not a connection to open here: they live on their own
    // settings tab, so the card goes there (in place inside the settings
    // shell, by URL everywhere else).
    if (id === API_KEYS_ITEM_ID) {
      openSettingsTab("integrations.apiKeys", {
        fallbackHref: "/user-settings/integrations/api-keys",
      });
      return;
    }
    // Detail actions can change inventories owned by their existing panels.
    // Refresh when returning so the list never retains an old saved-state claim.
    if (selectedDetail && !id) refresh();
    setSelectedDetail(id);
  };
  const google = savedAccountSummary(
    (googleInventory.data?.connections ?? []).map((account) => ({
      identity:
        account.account_email ?? account.account_name ?? "Google account",
      status: account.health,
    })),
    googleInventory.isLoading,
    googleInventory.isError,
  );
  const githubSummary = savedAccountSummary(
    github.inventory.connection
      ? [
          {
            identity: github.inventory.account?.login
              ? `@${github.inventory.account.login}`
              : "GitHub account",
            status: github.inventory.connection.status,
          },
        ]
      : [],
    github.loading,
    Boolean(github.readError),
  );
  const microsoft = savedAccountSummary(
    microsoftConnections.map((account) => ({
      identity:
        account.accountEmail ?? account.accountName ?? "Microsoft account",
      status: account.status,
    })),
    nativeLoading,
    Boolean(nativeErrors.microsoft),
  );
  const nativeItem = (
    id: string,
    name: string,
    description: string,
    vendor: string,
    category: string,
    iconUrl: string | null,
    summary: ReturnType<typeof savedAccountSummary>,
    keywords = "",
  ): IntegrationDirectoryItem => ({
    id: `native:${id}`,
    name,
    description,
    vendor,
    category,
    keywords,
    artwork: {
      id,
      name,
      blurb: description,
      surfaces: ["directory"],
      iconUrl,
      logo:
        id === "google" ? getConnector("google-workspace")?.logo : undefined,
    },
    featured: ["google", "microsoft", "github"].includes(id),
    comingSoon: false,
    ...summary,
  });
  const items: IntegrationDirectoryItem[] = [
    nativeItem(
      "google",
      "Google Workspace",
      "Connect Gmail, Drive, Calendar and the Google products you use.",
      "Google",
      "productivity",
      null,
      google,
      GOOGLE_CONNECTOR_PROVIDER.products
        .map((product) => `${product.name} ${product.promise}`)
        .join(" "),
    ),
    nativeItem(
      "microsoft",
      "Microsoft 365",
      "Read your Outlook mail, calendar, OneDrive, Teams and SharePoint.",
      "Microsoft",
      "productivity",
      "/icons/brands/microsoft.svg",
      microsoft,
      MICROSOFT_CAMPAIGN_DESCRIPTORS.map(
        (item) => `${item.label} ${item.grants}`,
      ).join(" "),
    ),
    nativeItem(
      "github",
      "GitHub",
      "Connect repositories, pull requests, issues and your code workspaces.",
      "GitHub",
      "developer",
      "https://github.com/favicon.ico",
      githubSummary,
    ),
    nativeItem(
      "api-keys",
      "API keys",
      "Let your own programs and AI apps work with your tables as you.",
      "AI Matrx",
      "developer",
      null,
      savedAccountSummary([], false, false),
      "api key token developer personal key bearer programmatic",
    ),
    ...(["dropbox", "box"] as const).map((provider) =>
      nativeItem(
        provider,
        provider === "box" ? "Box files" : "Dropbox files",
        "Browse your files and folders and import them into Matrx Files.",
        provider === "box" ? "Box" : "Dropbox",
        "storage",
        `https://cdn.simpleicons.org/${provider}`,
        savedAccountSummary(
          storageConnections
            .filter((account) => account.provider === provider)
            .map((account) => ({
              identity:
                account.accountEmail ?? account.accountName ?? "File account",
              status: account.status.status,
            })),
          nativeLoading,
          Boolean(nativeErrors.storage),
        ),
        "storage import files folders",
      ),
    ),
    ...catalog
      .filter((entry) => entry.slug !== "github")
      .map((entry): IntegrationDirectoryItem => {
        const presentation = catalogPresentation(entry);
        const saved = Boolean(entry.connectionId);
        const attention = saved && !presentation.connected;
        const artwork = providerArtworkUrls(entry);
        const local = entry.transport === "stdio" && !entry.endpointUrl;
        const directoryAvailability = catalogDirectoryAvailability(
          entry,
          presentation,
        );
        const comingSoon = directoryAvailability.isComingSoon;
        return {
          id: entry.serverId,
          name:
            entry.slug === "google-workspace"
              ? `${entry.name} · local tools`
              : entry.name,
          description:
            entry.description ?? `Connect ${entry.name} to your agents.`,
          vendor: `${entry.vendor} · Agent tools`,
          category: entry.category,
          keywords: entry.slug,
          artwork: {
            id: entry.slug,
            name: entry.name,
            blurb: entry.description ?? "",
            surfaces: ["directory"],
            iconUrl: artwork[0],
            fallbackIconUrls: artwork.slice(1),
            brandColor: entry.color,
          },
          featured: directoryAvailability.isFeatured,
          saved,
          connected: presentation.connected,
          available: directoryAvailability.isAvailable,
          comingSoon,
          attention,
          status: presentation.connected
            ? entry.authStrategy === "none"
              ? "Enabled"
              : "Connected"
            : attention
              ? (STATUS_CONFIG[presentation.state ?? ""]?.label ??
                "Needs attention")
              : comingSoon
                ? "Coming soon"
                : local
                  ? "Local setup"
                  : entry.serverStatus === "deprecated"
                    ? "Retired"
                    : "Not connected",
          server: entry,
        };
      }),
  ];
  const visible = filterDirectory(items, filters);
  const catalogLoading = status === "idle" || status === "loading";
  const loading =
    catalogLoading ||
    nativeLoading ||
    github.loading ||
    googleInventory.isLoading;
  const readFailures = [
    error ? { label: "Agent tools", message: error } : null,
    github.readError ? { label: "GitHub", message: github.readError } : null,
    googleInventory.isError
      ? {
          label: "Google",
          message:
            googleInventory.error instanceof Error
              ? googleInventory.error.message
              : "Could not load Google connections.",
        }
      : null,
    nativeErrors.microsoft
      ? { label: "Microsoft", message: nativeErrors.microsoft }
      : null,
    nativeErrors.storage
      ? { label: "File connections", message: nativeErrors.storage }
      : null,
  ].filter((failure) => failure !== null);

  useSurfaceScopeContribution(
    "matrx-user/settings",
    "integrations-directory",
    () => ({
      integration_catalog: catalog.map((entry) => ({
        slug: entry.slug,
        name: entry.name,
        vendor: entry.vendor,
        description: entry.description,
        category: entry.category,
        transport: entry.transport,
        auth_strategy: entry.authStrategy,
        server_status: entry.serverStatus,
        connection_status: entry.connectionStatus,
        connection_ready: entry.connectionReady,
        is_official: entry.isOfficial,
        is_featured: entry.isFeatured,
        website_url: entry.websiteUrl,
        docs_url: entry.docsUrl,
      })),
      integration_filters: {
        search: filters.query,
        view_filter: filters.status,
        category: filters.category,
        total_count: items.length,
        visible_count: visible.length,
        connected_count: items.filter((item) => item.connected).length,
        category_counts: Object.fromEntries(
          [...new Set(items.map((item) => item.category))].map((category) => [
            category,
            items.filter((item) => item.category === category).length,
          ]),
        ),
      },
    }),
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleOAuthConnect = async (
    entry: McpCatalogEntry,
    endpointOverride?: string,
  ) => {
    if (entry.slug === "github") {
      if (!organizationId) {
        toast.error("Select an organization before connecting GitHub.");
        return;
      }
      window.location.assign(
        githubConnectUrl(window.location.pathname, organizationId),
      );
      return;
    }
    const outcome = await startMcpOAuthPopup(
      entry.serverId,
      undefined,
      endpointOverride,
    );
    const ref = {
      type: "mcp_server",
      id: entry.serverId,
      title: entry.name,
    };
    if (outcome.ok) {
      dispatch(fetchCatalog());
      recordToast.success(ref, `Connected to ${entry.name}`);
    } else if (!outcome.cancelled) {
      recordToast.error(ref, `Could not connect to ${entry.name}`, {
        description: outcome.error,
      });
    }
  };

  const handleBearerConnect = (serverId: string, token: string) => {
    dispatch(
      connectServerWithCredentials({
        serverId,
        authMethod: "bearer",
        fields: { token },
        transport: "http",
      }),
    );
  };

  const handleManualConnect = async (
    entry: McpCatalogEntry,
    endpointOverride: string,
    headers: ManualHeaderInput[],
  ) => {
    const credentials = buildManualMcpCredentials(
      entry.endpointUrl ?? "",
      endpointOverride,
      headers,
    );
    await dispatch(
      connectServerWithCredentials({
        serverId: entry.serverId,
        authMethod: "headers",
        fields: credentials.fields,
        transport: entry.transport,
        endpointOverride: credentials.endpointOverride,
      }),
    ).unwrap();
  };

  /**
   * A server with `auth_strategy: "none"` has NO credential to store. This
   * used to call `onBearerConnect("")`, which sent an empty bearer token to
   * aidream's credentials endpoint — which rejects empty field values (422),
   * so connecting a no-auth server always failed. The right call is the
   * metadata-only connection RPC. (D128)
   */
  const handleNoAuthConnect = async (entry: McpCatalogEntry) => {
    try {
      await dispatch(
        connectServer({
          serverId: entry.serverId,
          transport: entry.transport,
        }),
      ).unwrap();
      toast.success(`Connected to ${entry.name}`);
    } catch (error) {
      toast.error(`Could not connect to ${entry.name}`, {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleDisconnect = async (entry: McpCatalogEntry) => {
    const confirmed = await confirm({
      title: `Disconnect ${entry.name}?`,
      description:
        "Agents will lose access to this server until you reconnect. AI Matrx will remove the saved connection and its stored credentials; the external provider account is not deleted.",
      confirmLabel: `Disconnect ${entry.name}`,
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await dispatch(disconnectServer(entry.serverId)).unwrap();
      toast.success(`Disconnected ${entry.name}`);
    } catch (error) {
      toast.error(`Could not disconnect ${entry.name}`, {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleTestConnection = async (entry: McpCatalogEntry) => {
    if (checkingServerId) return;
    setCheckingServerId(entry.serverId);
    try {
      // This explicit click may ask for an organization. Background catalog
      // reads remain non-interactive through the service's GET default.
      await ensureOrganizationForRequest({ method: "GET", interactive: true });
      const discovery = await dispatch(
        discoverServerTools(entry.serverId),
      ).unwrap();
      toast.success(
        `Found ${discovery.tools.length} ${discovery.tools.length === 1 ? "tool" : "tools"} for ${entry.name}`,
        {
          description:
            "These are the tools this service currently offers to agents.",
        },
      );
    } catch (error) {
      if (!isOrganizationSelectionCancelled(error)) {
        toast.error(`Could not check ${entry.name}'s tools`, {
          description: toolCheckFailure(error),
        });
      }
    } finally {
      setCheckingServerId(null);
    }
  };

  const renderDetail = (item: IntegrationDirectoryItem) => {
    const entry = item.server;
    if (entry)
      return (
        <ServerCard
          entry={entry}
          connectionPresentation={catalogPresentation(entry)}
          isExpanded
          onToggleExpand={() => selectDetail(null)}
          isConnecting={connectingId === entry.serverId}
          isChecking={checkingServerId === entry.serverId}
          onOAuthConnect={(endpointOverride) =>
            handleOAuthConnect(entry, endpointOverride)
          }
          onBearerConnect={(token) =>
            handleBearerConnect(entry.serverId, token)
          }
          onNoAuthConnect={() => handleNoAuthConnect(entry)}
          onManualConnect={(endpointOverride, headers) =>
            handleManualConnect(entry, endpointOverride, headers)
          }
          onDisconnect={() => void handleDisconnect(entry)}
          onTest={() => void handleTestConnection(entry)}
        />
      );
    if (item.id === "native:google") return <ConnectorsSettingsPanel />;
    if (item.id === "native:github") return <GitHubConnectionCard />;
    if (item.id === "native:microsoft") return <MicrosoftConnectPanel />;
    if (item.id === "native:box" || item.id === "native:dropbox")
      return (
        <StorageConnectionsPanel
          provider={item.id === "native:box" ? "box" : "dropbox"}
        />
      );
    return null;
  };
  // Export only the sanitized hosted entries, as before; never export credentials.
  const visibleServers = visible.flatMap((item) =>
    item.server ? [item.server] : [],
  );
  return (
    <TooltipProvider>
      <Suspense fallback={<SuspenseLoader message="Loading integrations…" />}>
        <IntegrationDirectory
          items={items}
          filters={filters}
          onFiltersChange={setFilters}
          selectedId={selectedDetail}
          onSelect={selectDetail}
          renderDetail={renderDetail}
          loading={loading}
          refreshing={loading}
          incomplete={readFailures.length > 0}
          onRefresh={refresh}
          onOpenWindow={embedded ? undefined : () => openWindow()}
          errors={
            readFailures.length > 0 ? (
              <div
                role="alert"
                className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
              >
                <p className="font-medium">
                  Some integration information could not be loaded.
                </p>
                {readFailures.map((failure) => (
                  <details key={failure.label}>
                    <summary className="cursor-pointer text-muted-foreground">
                      {failure.label}
                    </summary>
                    <p className="mt-1 break-words text-xs">
                      {failure.message}
                      <ErrorAlchemyMenu error={failure.message} />
                    </p>
                  </details>
                ))}
                <button
                  type="button"
                  className="text-sm underline"
                  onClick={refresh}
                >
                  Try again
                </button>
              </div>
            ) : null
          }
          exportControl={
            visibleServers.length > 0 ? (
              <CopyButtons
                size="icon"
                label="Hosted integrations"
                human={() => visibleServers.map(mcpEntrySummary).join("\n\n")}
                agent={() => ({
                  kind: "mcp-integrations",
                  location: mcpLocation("Integrations"),
                  description:
                    "Sanitized hosted integrations matching the current directory filters.",
                  data: visibleServers.map(mcpEntryMeta),
                  summary: `${visibleServers.length} hosted integrations`,
                })}
                export={{
                  items: [
                    jsonExportItem(() => visibleServers.map(mcpEntryMeta)),
                    csvExportItem(
                      () => visibleServers.map(mcpEntryBrief),
                      "CSV (matching hosted integrations)",
                      MCP_CSV_COLUMNS,
                    ),
                  ],
                }}
              />
            ) : null
          }
        />
      </Suspense>
    </TooltipProvider>
  );
}

export default IntegrationsWorkspace;

// ─── Server Card ─────────────────────────────────────────────────────────────

interface ServerCardProps {
  entry: McpCatalogEntry;
  connectionPresentation: ReturnType<typeof catalogConnectionPresentation>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isConnecting: boolean;
  isChecking: boolean;
  onOAuthConnect: (endpointOverride?: string) => void;
  onBearerConnect: (token: string) => void;
  onNoAuthConnect: () => void;
  onManualConnect: (
    endpointOverride: string,
    headers: ManualHeaderInput[],
  ) => Promise<void>;
  onDisconnect: () => void;
  onTest: () => void;
}

function ServerCard({
  entry,
  connectionPresentation,
  isExpanded,
  onToggleExpand,
  isConnecting,
  isChecking,
  onOAuthConnect,
  onBearerConnect,
  onNoAuthConnect,
  onManualConnect,
  onDisconnect,
  onTest,
}: ServerCardProps) {
  const actionPresentation = catalogActionPresentation(
    entry,
    connectionPresentation,
  );
  const isComingSoon = actionPresentation.isComingSoon;
  const isCommunity = entry.serverStatus === "community";
  const isConnected = connectionPresentation.connected;
  const hasEndpoint = !!entry.endpointUrl;
  const isStdioOnly = entry.transport === "stdio" && !hasEndpoint;
  const canConnect =
    actionPresentation.canStartConnection &&
    connectionPresentation.state !== "checking";
  const needsRecovery = actionPresentation.needsRecovery;
  const needsOAuth = entry.authStrategy === "oauth_discovery";
  const needsToken =
    entry.authStrategy === "bearer" || entry.authStrategy === "api_key";
  const noAuth = entry.authStrategy === "none";

  const transport = TRANSPORT_META[entry.transport] ?? TRANSPORT_META.http;
  const connectionStatus =
    connectionPresentation.state && connectionPresentation.state !== "disconnected"
      ? STATUS_CONFIG[connectionPresentation.state]
      : null;
  const statusLabel = noAuth && connectionPresentation.state === "connected"
    ? "Enabled"
    : connectionStatus?.label;

  // Inline token form state
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [supabaseProjectRef, setSupabaseProjectRef] = useState("");
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [failedIconUrls, setFailedIconUrls] = useState<string[]>([]);
  const iconUrl = providerArtworkUrls(entry).find((url) => !failedIconUrls.includes(url));

  const isSupabase = entry.slug === "supabase";

  const handleSupabaseOAuth = () => {
    if (!entry.endpointUrl) return;
    try {
      const endpoint = buildSupabaseScopedMcpEndpoint(
        entry.endpointUrl,
        supabaseProjectRef,
      );
      setSupabaseError(null);
      onOAuthConnect(endpoint);
    } catch (error) {
      setSupabaseError(
        error instanceof Error ? error.message : "Invalid project reference",
      );
    }
  };

  const handleTokenSubmit = () => {
    if (!token.trim()) return;
    onBearerConnect(token.trim());
    setToken("");
    setShowTokenForm(false);
  };

  return (
    <Card
      id={`integration-server-${entry.serverId}`}
      className={cn(
        "group/integration scroll-mt-20 transition-all duration-150",
        isConnected && "ring-1 ring-green-500/30 bg-green-500/[0.02]",
        isComingSoon && "opacity-55",
      )}
    >
      <CardContent className="p-3 sm:p-4">
        {/* Record pair — SANITIZED via mcpEntryMeta (no endpoint URL, auth
            strategy, connection id or token expiry ever reaches a payload). */}
        <div className="float-right opacity-100 transition-opacity sm:opacity-0 sm:group-hover/integration:opacity-100 sm:focus-within:opacity-100">
          <CopyButtons
            size="xs"
            label={`Integration ${entry.name}`}
            human={() => mcpEntrySummary(entry)}
            agent={() => ({
              kind: "mcp-integration",
              location: mcpLocation("Settings — Integrations"),
              description:
                "A single integration card. Sanitized: no endpoint URL, auth strategy, connection id or token.",
              data: mcpEntryMeta(entry),
              summary: mcpEntrySummary(entry),
              attributes: {
                slug: entry.slug,
                vendor: entry.vendor,
                category: entry.category,
                server_status: entry.serverStatus,
                has_connection: entry.connectionId != null,
                connection_status: entry.connectionStatus ?? undefined,
                sanitized: true,
              },
            })}
            json={() => mcpEntryMeta(entry)}
          />
        </div>
        {/* Top row */}
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            {iconUrl ? (
              <img
                src={iconUrl}
                alt=""
                decoding="async"
                referrerPolicy="no-referrer"
                className={cn(
                  "h-11 w-11 rounded-xl border border-border bg-background object-contain p-1.5",
                  isComingSoon && "grayscale",
                )}
                onError={() => setFailedIconUrls((current) => [...current, iconUrl])}
              />
            ) : (
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-sm font-semibold text-primary"
              >
                {entry.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="min-w-0 line-clamp-2 break-words text-sm font-medium leading-5 text-foreground">
                {entry.name}
              </h3>
              {entry.isOfficial && (
                <Tooltip>
                  <TooltipTrigger>
                    <Shield className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>Official integration</TooltipContent>
                </Tooltip>
              )}
              {entry.isFeatured && (
                <Tooltip>
                  <TooltipTrigger>
                    <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>Featured</TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {entry.vendor}
            </p>
          </div>

          <div className="shrink-0">
            {isComingSoon ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                Coming Soon
              </Badge>
            ) : connectionStatus ? (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] px-1.5 py-0 gap-1",
                  connectionStatus.className,
                )}
              >
                {connectionStatus.icon}
                {statusLabel}
              </Badge>
            ) : entry.serverStatus === "beta" ? (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 bg-purple-500/10 text-purple-600 dark:text-purple-400"
              >
                Beta
              </Badge>
            ) : isCommunity ? (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 bg-teal-500/10 text-teal-600 dark:text-teal-400"
              >
                Community
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Description */}
        {entry.description && (
          <p className="mt-3 line-clamp-2 text-sm leading-5 text-muted-foreground">
            {entry.description}
          </p>
        )}
        {connectionPresentation.reason && !isConnected && (
          <p role="status" className="mt-3 text-xs leading-5 text-muted-foreground">
            {connectionPresentation.reason}
          </p>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2">
          {isConnected ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-10 flex-1 text-sm"
                onClick={onTest}
                disabled={isConnecting || isChecking}
              >
                {isChecking ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                {isChecking ? "Checking tools…" : "Check tools"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-10 gap-1.5 px-3 text-sm"
                onClick={onToggleExpand}
                aria-label={isExpanded ? `Hide ${entry.name} connection management` : `Manage ${entry.name} connection`}
              >
                <Settings2 className="h-4 w-4" />
                <span className="hidden sm:inline">Manage</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-10 shrink-0 px-3 text-sm text-destructive"
                onClick={onDisconnect}
                disabled={isChecking || isConnecting}
                aria-label={`Disconnect ${entry.name}`}
              >
                Disconnect
              </Button>
            </>
          ) : canConnect && needsOAuth && !isSupabase ? (
            <div className="flex min-w-0 flex-1 gap-2">
              <Button
                size="sm"
                className="h-11 min-w-0 flex-1 px-2 text-sm sm:h-7 sm:px-3 sm:text-xs"
                onClick={() => onOAuthConnect()}
                disabled={isConnecting}
                aria-label={`Connect to ${entry.name}`}
              >
                {isConnecting ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Lock className="h-3 w-3 mr-1" />
                )}
                {needsRecovery ? "Reconnect" : "Connect"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-11 shrink-0 px-2 text-sm sm:h-7 sm:px-3 sm:text-xs"
                onClick={() => setShowManualForm((visible) => !visible)}
                disabled={isConnecting}
              >
                {showManualForm ? "Cancel" : "Use token"}
              </Button>
              {needsRecovery && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 shrink-0 px-2 text-sm text-destructive sm:h-7 sm:px-3 sm:text-xs"
                  onClick={onDisconnect}
                  disabled={isConnecting}
                  aria-label={`Disconnect ${entry.name}`}
                >
                  Disconnect
                </Button>
              )}
            </div>
          ) : canConnect && needsOAuth && isSupabase ? (
            <Button
              size="sm"
              className="h-11 min-w-0 flex-1 px-2 text-sm sm:h-7 sm:px-3 sm:text-xs"
              onClick={handleSupabaseOAuth}
              disabled={isConnecting || !supabaseProjectRef.trim()}
              aria-label="Connect read-only project"
            >
              {isConnecting ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Lock className="h-3 w-3 mr-1" />
              )}
              <span className="sm:hidden">{needsRecovery ? "Reconnect project" : "Connect project"}</span>
              <span className="hidden sm:inline">{needsRecovery ? "Reconnect project" : "Connect read-only project"}</span>
            </Button>
          ) : canConnect && needsToken ? (
            <Button
              size="sm"
              className="h-11 flex-1 text-sm sm:h-7 sm:text-xs"
              onClick={() => setShowTokenForm(!showTokenForm)}
              disabled={isConnecting}
            >
              <Key className="h-3 w-3 mr-1" />
              {showTokenForm ? "Cancel" : needsRecovery ? "Reconnect" : "Enter Token"}
            </Button>
          ) : canConnect && noAuth ? (
            <Button
              size="sm"
              className="h-11 flex-1 text-sm sm:h-7 sm:text-xs"
              onClick={onNoAuthConnect}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Zap className="h-3 w-3 mr-1" />
              )}
              {needsRecovery ? "Reconnect" : "Connect"}
            </Button>
          ) : isComingSoon ? (
            <Button
              variant="outline"
              size="sm"
              className="h-11 flex-1 text-sm sm:h-7 sm:text-xs"
              disabled
            >
              <Clock className="h-3 w-3 mr-1" />
              Not Available Yet
            </Button>
          ) : isStdioOnly ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 flex-1 text-sm sm:h-7 sm:text-xs"
                  disabled
                >
                  <Terminal className="h-3 w-3 mr-1" />
                  Local Only
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                This server runs locally via command line. Configure it in the
                agent tools panel when building an agent.
              </TooltipContent>
            </Tooltip>
          ) : null}

          {needsRecovery && canConnect && !needsOAuth && (
            <Button
              variant="outline"
              size="sm"
              className="h-10 shrink-0 px-3 text-sm text-destructive sm:h-7 sm:text-xs"
              onClick={onDisconnect}
              disabled={isConnecting}
              aria-label={`Disconnect ${entry.name}`}
            >
              Disconnect
            </Button>
          )}

          {needsRecovery && !canConnect && (
            <Button
              variant="outline"
              size="sm"
              className="h-10 flex-1 text-sm text-destructive sm:h-7 sm:text-xs"
              onClick={onDisconnect}
              aria-label={`Disconnect ${entry.name}`}
            >
              Disconnect
            </Button>
          )}

          {!isConnected && (
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 shrink-0 p-0"
              onClick={onToggleExpand}
              aria-label={isExpanded ? `Hide ${entry.name} settings` : `Open ${entry.name} settings`}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {isSupabase && !isConnected && canConnect && (
          <div className="mt-3 space-y-2 rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Settings2 className="h-3.5 w-3.5" />
              Advanced settings
            </div>
            <label className="block text-xs font-medium text-foreground">
              Supabase project reference
            </label>
            <Input
              value={supabaseProjectRef}
              onChange={(event) => {
                setSupabaseProjectRef(event.target.value);
                setSupabaseError(null);
              }}
              placeholder="20-character project ref"
              className="h-11 font-mono text-base sm:h-8 sm:text-xs"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onKeyDown={(event) => {
                if (event.key === "Enter" && supabaseProjectRef.trim()) {
                  handleSupabaseOAuth();
                }
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              Locked to this project with read-only Docs, Database, and
              Debugging tools. AI Matrx cannot create, update, or delete data
              through this connection.
            </p>
            {supabaseError && (
              <ErrorNotice size="inline" className="text-[11px]" message={supabaseError} />
            )}
          </div>
        )}

        {needsRecovery && canConnect && isSupabase && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-10 w-full text-sm text-destructive sm:h-7 sm:text-xs"
            onClick={onDisconnect}
            disabled={isConnecting}
            aria-label={`Disconnect ${entry.name}`}
          >
            Disconnect
          </Button>
        )}

        {/* Inline token form */}
        {showTokenForm && !isConnected && (
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={
                  entry.authStrategy === "api_key"
                    ? "Enter API key..."
                    : "Enter access token..."
                }
                className="h-11 pr-24 text-base sm:h-8 sm:pr-16 sm:text-xs"
                onKeyDown={(e) => e.key === "Enter" && handleTokenSubmit()}
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 p-0 sm:h-6 sm:w-6"
                  onClick={() => setShowToken(!showToken)}
                  aria-label={showToken ? "Hide token" : "Show token"}
                >
                  {showToken ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  size="sm"
                  className="h-11 px-3 text-sm sm:h-6 sm:px-2 sm:text-[10px]"
                  onClick={handleTokenSubmit}
                  disabled={!token.trim() || isConnecting}
                >
                  {isConnecting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {showManualForm && needsOAuth && !isConnected && entry.endpointUrl && (
          <ManualCredentialsForm
            entry={entry}
            isSaving={isConnecting}
            onSave={onManualConnect}
            onSaved={() => setShowManualForm(false)}
          />
        )}

        {/* Expanded details */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            <DetailRow label="Transport" value={transport.label} />
            <DetailRow
              label="Auth"
              value={AUTH_LABELS[entry.authStrategy] ?? entry.authStrategy}
            />
            {entry.endpointUrl && (
              <DetailRow label="Endpoint" value={entry.endpointUrl} mono />
            )}
            {entry.hasLocal && entry.hasRemote && (
              <DetailRow label="Availability" value="Remote + Local (stdio)" />
            )}
            {entry.hasLocal && !entry.hasRemote && (
              <DetailRow label="Availability" value="Local only (stdio)" />
            )}
            {!entry.hasLocal && entry.hasRemote && (
              <DetailRow label="Availability" value="Remote only" />
            )}
            {isConnected && entry.connectedAt && (
              <DetailRow
                label="Connected"
                value={new Date(entry.connectedAt).toLocaleDateString()}
              />
            )}
            {entry.tokenExpiresAt && (
              <DetailRow
                label="Token expires"
                value={new Date(entry.tokenExpiresAt).toLocaleString()}
              />
            )}

            {/* Info for stdio-only */}
            {isStdioOnly && (
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2.5 py-2 rounded-md mt-1">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  Local servers run on your machine. Add this to an agent via
                  the agent builder&apos;s MCP Tools tab, then configure
                  environment variables.
                </span>
              </div>
            )}

            {/* Links */}
            {(entry.websiteUrl || entry.docsUrl) && (
              <div className="flex items-center gap-3 pt-1">
                {entry.websiteUrl && (
                  <a
                    href={entry.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Website
                  </a>
                )}
                {entry.docsUrl && (
                  <a
                    href={entry.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <BookOpen className="h-3 w-3" />
                    Docs
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ManualCredentialsForm({
  entry,
  isSaving,
  onSave,
  onSaved,
}: {
  entry: McpCatalogEntry;
  isSaving: boolean;
  onSave: (
    endpointOverride: string,
    headers: ManualHeaderInput[],
  ) => Promise<void>;
  onSaved: () => void;
}) {
  const [endpointOverride, setEndpointOverride] = useState("");
  const [headers, setHeaders] = useState<ManualHeaderInput[]>([
    { name: "Authorization", value: "" },
  ]);
  const [showValues, setShowValues] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    try {
      await onSave(endpointOverride, headers);
      setHeaders([{ name: "Authorization", value: "" }]);
      setEndpointOverride("");
      onSaved();
      toast.success(`Connected to ${entry.name}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connection failed");
    }
  };

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <div>
        <p className="text-xs font-medium text-foreground">Token and headers</p>
        <p className="text-[11px] text-muted-foreground">
          OAuth remains recommended. Use this only when the provider issued a
          personal token or requires workspace headers. Values are sealed in
          Vault and never returned to this browser.
        </p>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">
          Endpoint override{" "}
          <span className="text-muted-foreground">(optional)</span>
        </label>
        <Input
          value={endpointOverride}
          onChange={(event) => setEndpointOverride(event.target.value)}
          placeholder={entry.endpointUrl ?? "https://provider.example/mcp"}
          className="h-11 font-mono text-base sm:h-8 sm:text-xs"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <p className="text-[11px] text-muted-foreground">
          Must remain HTTPS on {new URL(entry.endpointUrl ?? "").hostname}.
        </p>
      </div>
      <div className="space-y-2">
        {headers.map((header, index) => (
          <div key={index} className="grid grid-cols-[1fr_1fr_44px] gap-2">
            <Input
              value={header.name}
              onChange={(event) =>
                setHeaders((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, name: event.target.value }
                      : item,
                  ),
                )
              }
              placeholder="Header name"
              className="h-11 font-mono text-base sm:h-8 sm:text-xs"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <Input
              type={showValues ? "text" : "password"}
              value={header.value}
              onChange={(event) =>
                setHeaders((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, value: event.target.value }
                      : item,
                  ),
                )
              }
              placeholder="Secret value"
              className="h-11 font-mono text-base sm:h-8 sm:text-xs"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 sm:h-8 sm:w-8"
              onClick={() =>
                setHeaders((current) =>
                  current.length === 1
                    ? [{ name: "", value: "" }]
                    : current.filter((_, itemIndex) => itemIndex !== index),
                )
              }
              aria-label={`Remove header ${index + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 text-sm sm:h-8 sm:text-xs"
          onClick={() =>
            setHeaders((current) => [...current, { name: "", value: "" }])
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add header
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11 text-sm sm:h-8 sm:text-xs"
          onClick={() => setShowValues((visible) => !visible)}
        >
          {showValues ? (
            <EyeOff className="mr-1 h-3.5 w-3.5" />
          ) : (
            <Eye className="mr-1 h-3.5 w-3.5" />
          )}
          {showValues ? "Hide values" : "Show values"}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-11 flex-1 text-sm sm:h-8 sm:text-xs"
          onClick={() => void save()}
          disabled={isSaving}
        >
          {isSaving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          Save securely
        </Button>
      </div>
      {error && (
        <ErrorNotice size="inline" className="text-[11px]" message={error} />
      )}
    </div>
  );
}

// ─── Detail Row ──────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span
        className={cn(
          "min-w-0 flex-1 break-words text-foreground",
          mono && "break-all font-mono text-[11px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}
