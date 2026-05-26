"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchCatalog,
  connectServer,
  disconnectServer,
  selectMcpCatalog,
  selectMcpCatalogStatus,
  selectMcpCatalogError,
  selectMcpConnectingServerId,
} from "@/features/agents/redux/mcp/mcp.slice";
import type { McpCatalogEntry } from "@/features/agents/types/mcp.types";
import { MCP_CATEGORY_META } from "@/features/agents/types/mcp.types";
import {
  Search,
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
  ChevronDown,
  ChevronUp,
  Zap,
  Info,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { filterAndSortBySearch } from "@/utils/search-scoring";

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
  error: {
    label: "Error",
    className:
      "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20",
    icon: <X className="h-3 w-3" />,
  },
  disconnected: {
    label: "Not Connected",
    className: "bg-muted text-muted-foreground border-border",
    icon: <Unlock className="h-3 w-3" />,
  },
};

type ViewFilter = "all" | "connected" | "available" | "coming_soon";

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const dispatch = useAppDispatch();
  const catalog = useAppSelector(selectMcpCatalog);
  const status = useAppSelector(selectMcpCatalogStatus);
  const error = useAppSelector(selectMcpCatalogError);
  const connectingId = useAppSelector(selectMcpConnectingServerId);

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchCatalog());
    }
  }, [dispatch, status]);

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let entries = [...catalog];

    if (activeCategory !== "all") {
      entries = entries.filter((e) => e.category === activeCategory);
    }

    if (viewFilter === "connected") {
      entries = entries.filter((e) => e.connectionStatus === "connected");
    } else if (viewFilter === "available") {
      entries = entries.filter(
        (e) => e.serverStatus === "active" || e.serverStatus === "beta",
      );
    } else if (viewFilter === "coming_soon") {
      entries = entries.filter((e) => e.serverStatus === "coming_soon");
    }

    if (search.trim()) {
      entries = filterAndSortBySearch(entries, search, [
        { get: (e) => e.name, weight: "title" },
        { get: (e) => e.vendor, weight: "subtitle" },
        { get: (e) => e.description, weight: "body" },
      ]);
    }

    return entries;
  }, [catalog, search, activeCategory, viewFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aConn = a.connectionStatus === "connected" ? 0 : 1;
      const bConn = b.connectionStatus === "connected" ? 0 : 1;
      if (aConn !== bConn) return aConn - bConn;
      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
      const statusOrder = {
        active: 0,
        beta: 1,
        community: 2,
        coming_soon: 3,
        deprecated: 4,
      };
      const aOrder =
        statusOrder[a.serverStatus as keyof typeof statusOrder] ?? 5;
      const bOrder =
        statusOrder[b.serverStatus as keyof typeof statusOrder] ?? 5;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.name.localeCompare(b.name);
    });
  }, [filtered]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: catalog.length };
    for (const entry of catalog) {
      counts[entry.category] = (counts[entry.category] ?? 0) + 1;
    }
    return counts;
  }, [catalog]);

  const connectedCount = useMemo(
    () => catalog.filter((e) => e.connectionStatus === "connected").length,
    [catalog],
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleOAuthConnect = useCallback(
    (entry: McpCatalogEntry) => {
      window.open(
        `/api/mcp/oauth/start?server_id=${entry.serverId}&return_url=${encodeURIComponent(window.location.pathname)}`,
        "mcp_oauth",
        "width=600,height=700,popup=yes",
      );
      const handler = (event: MessageEvent) => {
        if (event.data?.type === "mcp_oauth_complete") {
          window.removeEventListener("message", handler);
          dispatch(fetchCatalog());
        }
      };
      window.addEventListener("message", handler);
    },
    [dispatch],
  );

  const handleBearerConnect = useCallback(
    (serverId: string, token: string) => {
      dispatch(
        connectServer({
          serverId,
          accessToken: token,
          transport: "http",
        }),
      );
    },
    [dispatch],
  );

  const handleDisconnect = useCallback(
    (serverId: string) => {
      dispatch(disconnectServer(serverId));
    },
    [dispatch],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  if (status === "loading" && catalog.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const categories = Object.entries(MCP_CATEGORY_META)
    .filter(([key]) => categoryCounts[key])
    .sort(([, a], [, b]) => a.order - b.order);

  return (
    <TooltipProvider>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Integrations
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Connect MCP servers to give your agents access to external tools
              and data.
              {connectedCount > 0 && (
                <span className="text-foreground font-medium ml-1">
                  {connectedCount} connected
                </span>
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => dispatch(fetchCatalog())}
            disabled={status === "loading"}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5 mr-1.5",
                status === "loading" && "animate-spin",
              )}
            />
            Refresh
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search integrations..."
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
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
                className="h-8 text-xs"
                onClick={() => setViewFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={activeCategory === "all" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setActiveCategory("all")}
          >
            All ({categoryCounts.all ?? 0})
          </Button>
          {categories.map(([key, meta]) => (
            <Button
              key={key}
              variant={activeCategory === key ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setActiveCategory(key)}
            >
              {meta.label} ({categoryCounts[key]})
            </Button>
          ))}
        </div>

        {/* Server Grid */}
        {sorted.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No integrations match your filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {sorted.map((entry) => (
              <ServerCard
                key={entry.serverId}
                entry={entry}
                isExpanded={expandedId === entry.serverId}
                onToggleExpand={() =>
                  setExpandedId(
                    expandedId === entry.serverId ? null : entry.serverId,
                  )
                }
                isConnecting={connectingId === entry.serverId}
                onOAuthConnect={() => handleOAuthConnect(entry)}
                onBearerConnect={(token) =>
                  handleBearerConnect(entry.serverId, token)
                }
                onDisconnect={() => handleDisconnect(entry.serverId)}
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
  isExpanded: boolean;
  onToggleExpand: () => void;
  isConnecting: boolean;
  onOAuthConnect: () => void;
  onBearerConnect: (token: string) => void;
  onDisconnect: () => void;
}

function ServerCard({
  entry,
  isExpanded,
  onToggleExpand,
  isConnecting,
  onOAuthConnect,
  onBearerConnect,
  onDisconnect,
}: ServerCardProps) {
  const isComingSoon = entry.serverStatus === "coming_soon";
  const isCommunity = entry.serverStatus === "community";
  const isConnected = entry.connectionStatus === "connected";
  const isActive =
    entry.serverStatus === "active" || entry.serverStatus === "beta";
  const hasEndpoint = !!entry.endpointUrl;
  const isStdioOnly = entry.transport === "stdio" && !hasEndpoint;
  const canConnect =
    (isActive || isCommunity) && hasEndpoint && !isConnected;
  const needsOAuth = entry.authStrategy === "oauth_discovery";
  const needsToken =
    entry.authStrategy === "bearer" || entry.authStrategy === "api_key";
  const noAuth = entry.authStrategy === "none";

  const transport = TRANSPORT_META[entry.transport] ?? TRANSPORT_META.http;
  const connectionStatus =
    entry.connectionStatus && entry.connectionStatus !== "disconnected"
      ? STATUS_CONFIG[entry.connectionStatus]
      : null;

  // Inline token form state
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const handleTokenSubmit = () => {
    if (!token.trim()) return;
    onBearerConnect(token.trim());
    setToken("");
    setShowTokenForm(false);
  };

  return (
    <Card
      className={cn(
        "transition-all duration-150",
        isConnected && "ring-1 ring-green-500/30 bg-green-500/[0.02]",
        isComingSoon && "opacity-55",
      )}
    >
      <CardContent className="p-4">
        {/* Top row */}
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">
            {entry.iconUrl ? (
              <img
                src={entry.iconUrl}
                alt=""
                className={cn(
                  "w-9 h-9 rounded-lg object-contain",
                  isComingSoon && "grayscale",
                )}
              />
            ) : (
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: entry.color ?? "#6b7280" }}
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
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
            {entry.description}
          </p>
        )}

        {/* Metadata */}
        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0 gap-1",
              transport.className,
            )}
          >
            {transport.icon}
            {transport.label}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
            <Key className="h-2.5 w-2.5" />
            {AUTH_LABELS[entry.authStrategy] ?? entry.authStrategy}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {MCP_CATEGORY_META[entry.category]?.label ?? entry.category}
          </Badge>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3">
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={onDisconnect}
            >
              Disconnect
            </Button>
          ) : canConnect && needsOAuth ? (
            <Button
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={onOAuthConnect}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Lock className="h-3 w-3 mr-1" />
              )}
              Connect with OAuth
            </Button>
          ) : canConnect && needsToken ? (
            <Button
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={() => setShowTokenForm(!showTokenForm)}
              disabled={isConnecting}
            >
              <Key className="h-3 w-3 mr-1" />
              {showTokenForm ? "Cancel" : "Enter Token"}
            </Button>
          ) : canConnect && noAuth ? (
            <Button
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={() => onBearerConnect("")}
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
              className="h-7 text-xs flex-1"
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
                  className="h-7 text-xs flex-1"
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

          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={onToggleExpand}
          >
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>

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
                className="h-8 text-xs pr-16"
                onKeyDown={(e) => e.key === "Enter" && handleTokenSubmit()}
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  size="sm"
                  className="h-6 px-2 text-[10px]"
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
          "text-foreground break-all",
          mono && "font-mono text-[11px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}
