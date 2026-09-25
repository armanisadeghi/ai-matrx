"use client";

import React, { useEffect, useState } from "react";
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
import { keyFieldsAiVariant } from "@/features/marketing/lib/copy-payloads";
import {
  mcpConnectionCounts,
  mcpEntryBrief,
  mcpEntryMeta,
  mcpEntrySummary,
  mcpListSummary,
  mcpLocation,
  MCP_CSV_COLUMNS,
} from "@/features/agents/mcp-copy";
import { MCP_CATEGORY_META } from "@/features/agents/types/mcp.types";
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
  TestTube2,
  PlugZap,
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
import { matchesIntegrationSearch } from "@/features/settings/tabs/integration-search-match";
import { GitHubConnectionCard } from "@/features/github-integration/GitHubConnectionCard";
import { githubConnectUrl } from "@/features/github-integration/service";
import { useGitHubConnection } from "@/features/github-integration/useGitHubConnection";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { ConnectorsSettingsPanel } from "@/features/connectors/ConnectorsSettingsPanel";
import { providerArtworkUrls } from "@/features/connectors/live-connectors";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { useSurfaceScopeContribution } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { catalogConnectionPresentation } from "./integration-catalog-state";
import {
  buildManualMcpCredentials,
  type ManualHeaderInput,
} from "./manual-mcp-credentials";

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
  return totalConnected > 0 ? `${totalConnected} active` : "Nothing connected yet";
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function IntegrationsPage({
  search = "",
  activeCategory: controlledCategory,
  onCategoryChange,
  viewFilter: controlledViewFilter,
  onViewFilterChange,
  googleProductFocus,
}: {
  search?: string;
  activeCategory?: string;
  onCategoryChange?: (category: string) => void;
  viewFilter?: ViewFilter;
  onViewFilterChange?: (filter: ViewFilter) => void;
  googleProductFocus?: { productKey: string; request: number } | null;
} = {}) {
  const organizationId = useAppSelector(selectOrganizationId);
  const dispatch = useAppDispatch();
  const catalog = useAppSelector(selectMcpCatalog);
  const status = useAppSelector(selectMcpCatalogStatus);
  const error = useAppSelector(selectMcpCatalogError);
  const connectingId = useAppSelector(selectMcpConnectingServerId);
  // The other two "your connections" contributors rendered in this same
  // section (GitHubConnectionCard below, ConnectorsSettingsPanel for
  // Google) — their own loading state must gate the section summary too,
  // not just the MCP catalog's.
  const github = useGitHubConnection();
  const googleInventory = useGoogleConnectionInventory();
  const githubStatus = github.loading
    ? undefined
    : github.inventory.connection?.status ?? null;
  const catalogPresentation = (entry: McpCatalogEntry) =>
    catalogConnectionPresentation(entry, githubStatus, github.loading);

  const [localCategory, setLocalCategory] = useState("all");
  const [localViewFilter, setLocalViewFilter] = useState<ViewFilter>("all");
  const activeCategory = controlledCategory ?? localCategory;
  const viewFilter = controlledViewFilter ?? localViewFilter;
  const changeCategory = onCategoryChange ?? setLocalCategory;
  const changeViewFilter = onViewFilterChange ?? setLocalViewFilter;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchCatalog());
    }
  }, [dispatch, status]);

  // ── Filtering ──────────────────────────────────────────────────────────────

  let filtered = [...catalog];

  if (activeCategory !== "all") {
    filtered = filtered.filter((entry) => entry.category === activeCategory);
  }

  if (viewFilter === "connected") {
    filtered = filtered.filter(
      (entry) => catalogPresentation(entry).connected,
    );
  } else if (viewFilter === "available") {
    filtered = filtered.filter(
      (entry) =>
        entry.serverStatus === "active" || entry.serverStatus === "beta",
    );
  } else if (viewFilter === "coming_soon") {
    filtered = filtered.filter((entry) => entry.serverStatus === "coming_soon");
  }

  if (search.trim()) {
    filtered = filtered.filter((entry) =>
      matchesIntegrationSearch(
        search,
        `${entry.name} ${entry.vendor} ${entry.description} ${entry.category}`,
      ),
    );
  }

  const sorted = [...filtered].sort((a, b) => {
    const aConn = catalogPresentation(a).connected ? 0 : 1;
    const bConn = catalogPresentation(b).connected ? 0 : 1;
    if (aConn !== bConn) return aConn - bConn;
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    const statusOrder = {
      active: 0,
      beta: 1,
      community: 2,
      coming_soon: 3,
      deprecated: 4,
    };
    const aOrder = statusOrder[a.serverStatus as keyof typeof statusOrder] ?? 5;
    const bOrder = statusOrder[b.serverStatus as keyof typeof statusOrder] ?? 5;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });

  const categoryCounts: Record<string, number> = { all: catalog.length };
  for (const entry of catalog) {
    categoryCounts[entry.category] = (categoryCounts[entry.category] ?? 0) + 1;
  }

  const connectedCount = catalog.filter(
    (entry) => catalogPresentation(entry).connected,
  ).length;

  const githubConnectedCount =
    github.inventory.connection?.status === "connected" ? 1 : 0;
  const googleConnectedCount = (googleInventory.data?.connections ?? []).length;
  const totalConnectedCount =
    connectedCount + githubConnectedCount + googleConnectedCount;
  const connectionsStillLoading =
    status === "loading" || github.loading || googleInventory.isLoading;

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
        search,
        view_filter: viewFilter,
        category: activeCategory,
        total_count: catalog.length,
        visible_count: sorted.length,
        connected_count: connectedCount,
        category_counts: categoryCounts,
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
    try {
      const discovery = await dispatch(
        discoverServerTools(entry.serverId),
      ).unwrap();
      toast.success(`${entry.name} is ready to use`, {
        description: `${discovery.tools.length} tools available to your agents.`,
      });
    } catch (error) {
      toast.error(`Could not test ${entry.name}`, {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const categories = Object.entries(MCP_CATEGORY_META)
    .filter(([key]) => categoryCounts[key])
    .sort(([, a], [, b]) => a.order - b.order);

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-6xl space-y-5 px-1 pb-12 pt-3 sm:px-4 md:space-y-6 md:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <PlugZap className="h-3.5 w-3.5" />
              Tools for your agents
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Connect the services you already use
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Give your agents useful context and actions. Connect once, then
              manage access and test it whenever you need.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="rounded-lg border border-border bg-card px-3 py-2 text-right">
              <p className="text-lg font-semibold leading-none text-foreground">
                {totalConnectedCount}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">ready to use</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-10"
              onClick={() => dispatch(fetchCatalog())}
              disabled={status === "loading"}
            >
              <RefreshCw
                className={cn(
                  "mr-1.5 h-3.5 w-3.5",
                  status === "loading" && "animate-spin",
                )}
              />
              Refresh
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <section className="space-y-3" id="integration-connections">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Your connections</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Connected services are ready for agent work. Open settings for access details.
              </p>
            </div>
            <span className="hidden text-xs text-muted-foreground sm:block">
              {connectionsSummaryLabel(connectionsStillLoading, totalConnectedCount)}
            </span>
          </div>
          <GitHubConnectionCard />
          {/* Settings → Connectors: every connected Google account with its
              per-capability health rows, and the same consent body the "Choose
              what to connect" dialog uses. Replaced the three status-only
              `DirectoryConnectorCards` on 2026-09-17. */}
          <div id="integration-google" className="scroll-mt-20">
            <ConnectorsSettingsPanel searchFocus={googleProductFocus} />
          </div>
        </section>

        <section id="integration-catalog" className="scroll-mt-20 space-y-4">
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Discover integrations</h2>
              <p className="mt-1 text-sm text-muted-foreground">Find a service, connect it, and start using it in your agents.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {!search.trim() && (
              [
                ["all", "All"],
                ["connected", "Connected"],
                ["available", "Available"],
                ["coming_soon", "Coming Soon"],
              ] as [ViewFilter, string][]
            ).map(([key, label]) => (
              <Button
                key={key}
                variant={viewFilter === key ? "default" : "outline"}
                size="sm"
                className="h-11 text-sm sm:h-8 sm:text-xs"
                onClick={() => changeViewFilter(key)}
              >
                {label}
              </Button>
            ))}
            {/* Copy / export — SANITIZED. Payloads project through
                mcpEntryMeta, which drops endpoint URLs, auth strategies,
                connection ids and token expiry. Never pass a raw entry. */}
            {sorted.length > 0 && (
              <CopyButtons
                size="icon"
                label="Integrations"
                human={() => mcpListSummary(sorted)}
                agent={() => ({
                  kind: "mcp-integrations",
                  location: mcpLocation("Settings — Integrations"),
                  description:
                    "The integrations matching the current filters. Sanitized: no endpoint URLs, auth strategies, connection ids or tokens.",
                  data: {
                    filters: {
                      view: viewFilter,
                      category: activeCategory,
                      search: search || null,
                    },
                    counts: mcpConnectionCounts(sorted),
                    integrations: sorted.map(mcpEntryMeta),
                  },
                  summary: mcpListSummary(sorted),
                  attributes: {
                    ...mcpConnectionCounts(sorted),
                    view: viewFilter,
                    category: activeCategory,
                    sanitized: true,
                  },
                })}
                agentVariant={{ position: "last" }}
                aiVariants={[
                  keyFieldsAiVariant({
                    kind: "mcp-integrations",
                    location: mcpLocation("Settings — Integrations"),
                    description:
                      "Integrations projected to core fields. Sanitized.",
                    visible: sorted,
                    project: mcpEntryBrief,
                    query: {
                      view: viewFilter,
                      category: activeCategory,
                      search: search || null,
                    },
                    attributes: {
                      ...mcpConnectionCounts(sorted),
                      sanitized: true,
                    },
                  }),
                ]}
                export={{
                  items: [
                    jsonExportItem(() => ({
                      counts: mcpConnectionCounts(sorted),
                      integrations: sorted.map(mcpEntryMeta),
                    })),
                    csvExportItem(
                      () => sorted.map(mcpEntryBrief),
                      "CSV (all matching)",
                      MCP_CSV_COLUMNS,
                    ),
                  ],
                }}
              />
            )}
          </div>
        </section>

        {!search.trim() ? <div className="flex flex-wrap gap-1.5">
          <Button
            variant={activeCategory === "all" ? "default" : "outline"}
            size="sm"
            className="h-11 px-3 text-sm sm:h-7 sm:px-2.5 sm:text-xs"
            onClick={() => changeCategory("all")}
          >
            All ({categoryCounts.all ?? 0})
          </Button>
          {categories.map(([key, meta]) => (
            <Button
              key={key}
              variant={activeCategory === key ? "default" : "outline"}
              size="sm"
              className="h-11 px-3 text-sm sm:h-7 sm:px-2.5 sm:text-xs"
              onClick={() => changeCategory(key)}
            >
              {meta.label} ({categoryCounts[key]})
            </Button>
          ))}
        </div> : null}

        {/* Server Grid */}
        {status === "loading" && catalog.length === 0 ? (
          <div className="py-8">
            <SuspenseLoader size="sm" message="Loading integrations…" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {search.trim()
              ? "No hosted integrations match this search."
              : "No integrations match your filters."}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {sorted.map((entry) => (
              <ServerCard
                key={entry.serverId}
                entry={entry}
                connectionPresentation={catalogPresentation(entry)}
                isExpanded={expandedId === entry.serverId}
                onToggleExpand={() =>
                  setExpandedId(
                    expandedId === entry.serverId ? null : entry.serverId,
                  )
                }
                isConnecting={connectingId === entry.serverId}
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
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// ─── Server Card ─────────────────────────────────────────────────────────────

interface ServerCardProps {
  entry: McpCatalogEntry;
  connectionPresentation: ReturnType<typeof catalogConnectionPresentation>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isConnecting: boolean;
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
  onOAuthConnect,
  onBearerConnect,
  onNoAuthConnect,
  onManualConnect,
  onDisconnect,
  onTest,
}: ServerCardProps) {
  const isComingSoon = entry.serverStatus === "coming_soon";
  const isCommunity = entry.serverStatus === "community";
  const isConnected = connectionPresentation.connected;
  const isActive =
    entry.serverStatus === "active" || entry.serverStatus === "beta";
  const hasEndpoint = !!entry.endpointUrl;
  const isStdioOnly = entry.transport === "stdio" && !hasEndpoint;
  const canConnect =
    (isActive || isCommunity) &&
    hasEndpoint &&
    !isConnected &&
    connectionPresentation.state !== "checking";
  const needsOAuth = entry.authStrategy === "oauth_discovery";
  const needsToken =
    entry.authStrategy === "bearer" || entry.authStrategy === "api_key";
  const noAuth = entry.authStrategy === "none";

  const transport = TRANSPORT_META[entry.transport] ?? TRANSPORT_META.http;
  const connectionStatus =
    connectionPresentation.state && connectionPresentation.state !== "disconnected"
      ? STATUS_CONFIG[connectionPresentation.state]
      : null;

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
              <h3 className="font-medium text-sm text-foreground truncate">
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
                {connectionStatus.label}
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

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2">
          {isConnected ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-10 flex-1 text-sm"
                onClick={onTest}
                disabled={isConnecting}
              >
                <TestTube2 className="mr-1.5 h-3.5 w-3.5" />
                Test access
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-10 gap-1.5 px-3 text-sm"
                onClick={onToggleExpand}
                aria-label={isExpanded ? `Hide ${entry.name} settings` : `Open ${entry.name} settings`}
              >
                <Settings2 className="h-4 w-4" />
                <span className="hidden sm:inline">Settings</span>
              </Button>
            </>
          ) : canConnect && needsOAuth && !isSupabase ? (
            <div className="flex min-w-0 flex-1 gap-2">
              <Button
                size="sm"
                className="h-11 min-w-0 flex-1 px-2 text-sm sm:h-7 sm:px-3 sm:text-xs"
                onClick={() => onOAuthConnect()}
                disabled={isConnecting}
                aria-label="Connect with OAuth"
              >
                {isConnecting ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Lock className="h-3 w-3 mr-1" />
                )}
                <span className="sm:hidden">Connect account</span>
                <span className="hidden sm:inline">Connect with OAuth</span>
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
              <span className="sm:hidden">Connect project</span>
              <span className="hidden sm:inline">Connect read-only project</span>
            </Button>
          ) : canConnect && needsToken ? (
            <Button
              size="sm"
              className="h-11 flex-1 text-sm sm:h-7 sm:text-xs"
              onClick={() => setShowTokenForm(!showTokenForm)}
              disabled={isConnecting}
            >
              <Key className="h-3 w-3 mr-1" />
              {showTokenForm ? "Cancel" : "Enter Token"}
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
              Connect
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
              <p className="text-[11px] text-destructive" role="alert">
                {supabaseError}
              </p>
            )}
          </div>
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
        <p className="text-[11px] text-destructive" role="alert">
          {error}
        </p>
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
