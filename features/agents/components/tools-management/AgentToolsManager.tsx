"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import {
  Wrench,
  Search,
  X,
  Check,
  ChevronRight,
  ChevronDown,
  Layers,
  Zap,
  AlertTriangle,
  Trash2,
  Plus,
  Pencil,
  Server,
  Code2,
  Monitor,
  Plug,
  Info,
  Copy,
  Tag,
  FileCode2,
  Globe,
  Terminal,
  Radio,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectAgentTools,
  selectAgentCustomTools,
  selectAgentMcpServers,
  selectAgentAutoToolsDisabled,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  setAgentTools,
  setAgentCustomTools,
  setAgentMcpServers,
} from "@/features/agents/redux/agent-definition/slice";
import { setAgentAutoToolsDisabled } from "@/features/agents/redux/agent-definition/thunks";
import {
  selectMcpCatalog,
  selectMcpCatalogStatus,
  selectMcpCatalogError,
  selectMcpConnectingServerId,
  fetchCatalog,
  connectServer,
  disconnectServer,
} from "@/features/agents/redux/mcp/mcp.slice";
import type {
  McpCatalogEntry,
  McpServerConfigEntry,
  McpEnvSchemaField,
} from "@/features/agents/types/mcp.types";
import { MCP_CATEGORY_META } from "@/features/agents/types/mcp.types";
import { fetchMcpServerConfigs } from "@/features/agents/services/mcp.service";
import type { DatabaseTool } from "@/utils/supabase/tools-service";
import type {
  CustomToolDefinition,
  CustomToolInputSchema,
} from "@/features/agents/types/agent-api-types";
import { createClient } from "@/utils/supabase/client";
import {
  selectAllTools,
  selectToolsStatus,
} from "@/features/agents/redux/tools/tools.selectors";
import { filterAndSortBySearch } from "@/utils/search-scoring";

type ToolsTab = "server" | "custom" | "client" | "mcp";

const ALL_CATEGORY = "__all__";
const ENABLED_CATEGORY = "__enabled__";

// Deterministic color palette for category icons — muted, professional tones
// that work in both light and dark mode.
const CATEGORY_COLORS: Record<
  string,
  { bg: string; text: string; border: string; dot: string }
> = {
  browser: {
    bg: "bg-blue-500/10",
    text: "text-blue-500",
    border: "border-blue-500/20",
    dot: "bg-blue-500",
  },
  code: {
    bg: "bg-violet-500/10",
    text: "text-violet-500",
    border: "border-violet-500/20",
    dot: "bg-violet-500",
  },
  context: {
    bg: "bg-cyan-500/10",
    text: "text-cyan-500",
    border: "border-cyan-500/20",
    dot: "bg-cyan-500",
  },
  database: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-500",
    border: "border-emerald-500/20",
    dot: "bg-emerald-500",
  },
  filesystem: {
    bg: "bg-amber-500/10",
    text: "text-amber-500",
    border: "border-amber-500/20",
    dot: "bg-amber-500",
  },
  ide: {
    bg: "bg-indigo-500/10",
    text: "text-indigo-500",
    border: "border-indigo-500/20",
    dot: "bg-indigo-500",
  },
  interaction: {
    bg: "bg-pink-500/10",
    text: "text-pink-500",
    border: "border-pink-500/20",
    dot: "bg-pink-500",
  },
  internal: {
    bg: "bg-zinc-500/10",
    text: "text-zinc-500",
    border: "border-zinc-500/20",
    dot: "bg-zinc-500",
  },
  local_browser: {
    bg: "bg-sky-500/10",
    text: "text-sky-500",
    border: "border-sky-500/20",
    dot: "bg-sky-500",
  },
  local_documents: {
    bg: "bg-teal-500/10",
    text: "text-teal-500",
    border: "border-teal-500/20",
    dot: "bg-teal-500",
  },
  local_execution: {
    bg: "bg-orange-500/10",
    text: "text-orange-500",
    border: "border-orange-500/20",
    dot: "bg-orange-500",
  },
  local_file_ops: {
    bg: "bg-yellow-500/10",
    text: "text-yellow-600",
    border: "border-yellow-500/20",
    dot: "bg-yellow-500",
  },
  local_input: {
    bg: "bg-fuchsia-500/10",
    text: "text-fuchsia-500",
    border: "border-fuchsia-500/20",
    dot: "bg-fuchsia-500",
  },
  local_media: {
    bg: "bg-rose-500/10",
    text: "text-rose-500",
    border: "border-rose-500/20",
    dot: "bg-rose-500",
  },
  local_network: {
    bg: "bg-blue-400/10",
    text: "text-blue-400",
    border: "border-blue-400/20",
    dot: "bg-blue-400",
  },
  local_os: {
    bg: "bg-slate-500/10",
    text: "text-slate-500",
    border: "border-slate-500/20",
    dot: "bg-slate-500",
  },
  local_process: {
    bg: "bg-lime-500/10",
    text: "text-lime-600",
    border: "border-lime-500/20",
    dot: "bg-lime-500",
  },
  local_system: {
    bg: "bg-stone-500/10",
    text: "text-stone-500",
    border: "border-stone-500/20",
    dot: "bg-stone-500",
  },
  local_window: {
    bg: "bg-purple-500/10",
    text: "text-purple-500",
    border: "border-purple-500/20",
    dot: "bg-purple-500",
  },
  math: {
    bg: "bg-cyan-600/10",
    text: "text-cyan-600",
    border: "border-cyan-600/20",
    dot: "bg-cyan-600",
  },
  memory: {
    bg: "bg-violet-400/10",
    text: "text-violet-400",
    border: "border-violet-400/20",
    dot: "bg-violet-400",
  },
  news: {
    bg: "bg-red-500/10",
    text: "text-red-500",
    border: "border-red-500/20",
    dot: "bg-red-500",
  },
  productivity: {
    bg: "bg-green-500/10",
    text: "text-green-500",
    border: "border-green-500/20",
    dot: "bg-green-500",
  },
  research: {
    bg: "bg-indigo-400/10",
    text: "text-indigo-400",
    border: "border-indigo-400/20",
    dot: "bg-indigo-400",
  },
  seo: {
    bg: "bg-amber-600/10",
    text: "text-amber-600",
    border: "border-amber-600/20",
    dot: "bg-amber-600",
  },
  shell: {
    bg: "bg-green-600/10",
    text: "text-green-600",
    border: "border-green-600/20",
    dot: "bg-green-600",
  },
  text: {
    bg: "bg-sky-400/10",
    text: "text-sky-400",
    border: "border-sky-400/20",
    dot: "bg-sky-400",
  },
  travel: {
    bg: "bg-orange-400/10",
    text: "text-orange-400",
    border: "border-orange-400/20",
    dot: "bg-orange-400",
  },
};

const FALLBACK_COLOR = {
  bg: "bg-muted",
  text: "text-muted-foreground",
  border: "border-border",
  dot: "bg-muted-foreground",
};

function getCategoryColor(category?: string) {
  if (!category) return FALLBACK_COLOR;
  const key = category.toLowerCase().replace(/\s+/g, "_");
  return CATEGORY_COLORS[key] ?? FALLBACK_COLOR;
}

// Tab accent colors
const TAB_COLORS: Record<string, { active: string; icon: string }> = {
  server: { active: "text-primary border-primary", icon: "text-primary" },
  custom: { active: "text-secondary border-secondary", icon: "text-secondary" },
  client: { active: "text-success border-success", icon: "text-success" },
  mcp: {
    active: "text-warning border-[hsl(var(--warning))]",
    icon: "text-warning",
  },
};

interface AgentToolsManagerProps {
  agentId: string;
}

export function AgentToolsManager({ agentId }: AgentToolsManagerProps) {
  const dispatch = useAppDispatch();
  const autoToolsDisabled = useAppSelector((state) =>
    selectAgentAutoToolsDisabled(state, agentId),
  );
  const reduxTools = useAppSelector(selectAllTools);
  const reduxToolsStatus = useAppSelector(selectToolsStatus);
  const externalTools: DatabaseTool[] | undefined =
    reduxToolsStatus === "succeeded" ? reduxTools : undefined;

  const [fetchedMetadata, setFetchedMetadata] = useState<any>(null);
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(!externalTools);
  const [activeTab, setActiveTab] = useState<ToolsTab>("server");

  // Derive metadata from externalTools if available, otherwise use the fetched RPC metadata
  const metadata = useMemo(() => {
    if (externalTools) {
      const catsMap = new Map<string, number>();
      externalTools.forEach((t) => {
        const cat = t.category || "General";
        catsMap.set(cat, (catsMap.get(cat) || 0) + 1);
      });
      return {
        total_count: externalTools.length,
        categories: Array.from(catsMap.entries()).map(([c, count]) => ({
          category: c,
          count,
        })),
        enabled_tools: externalTools,
      };
    }
    return fetchedMetadata;
  }, [externalTools, fetchedMetadata]);

  // The view is loading if we don't have any metadata and we're either waiting on Redux or waiting on a direct fetch
  const isLoading =
    !metadata && (reduxToolsStatus === "loading" || isFetchingMetadata);

  useEffect(() => {
    // Return early if externalTools is already available or if Redux is currently actively fetching it
    if (externalTools || reduxToolsStatus === "loading") return;

    let active = true;
    setIsFetchingMetadata(true);
    const supabase = createClient();
    supabase.rpc("get_tools_metadata").then(({ data, error }) => {
      if (active && (!error || data)) {
        setFetchedMetadata(data as any);
        setIsFetchingMetadata(false);
      } else {
        console.error("Failed to fetch tools metadata", error);
        if (active) setIsFetchingMetadata(false);
      }
    });

    return () => {
      active = false;
    };
  }, [externalTools, reduxToolsStatus]);

  const tabs: { id: ToolsTab; label: string; icon: React.ReactNode }[] = [
    {
      id: "server",
      label: "Server Tools",
      icon: <Server className="w-3 h-3" />,
    },
    {
      id: "custom",
      label: "Custom Tools",
      icon: <Code2 className="w-3 h-3" />,
    },
    {
      id: "client",
      label: "Client Tools",
      icon: <Monitor className="w-3 h-3" />,
    },
    { id: "mcp", label: "MCP Tools", icon: <Plug className="w-3 h-3" /> },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">Loading tools...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex border-b border-border shrink-0 px-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const tabColor = TAB_COLORS[tab.id] ?? TAB_COLORS.server;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-2 text-xs font-medium transition-colors select-none min-w-0 border-b-2 -mb-px ${
                isActive
                  ? tabColor.active
                  : "text-muted-foreground border-transparent hover:text-foreground"
              }`}
            >
              <span className={`shrink-0 ${isActive ? tabColor.icon : ""}`}>
                {tab.icon}
              </span>
              <span className="hidden sm:inline truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Allow automated tool injection — agent-global; governs every tab.
          When off, the server's `auto_tools_disabled` kill switch drops ALL
          surface/automatic tools so the agent runs with only the tools
          selected here. See tool-injection.types.ts. */}
      <label
        htmlFor={`allow-auto-tools-${agentId}`}
        className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border bg-muted/30 shrink-0 cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Zap
            className={`w-3.5 h-3.5 shrink-0 ${autoToolsDisabled ? "text-muted-foreground" : "text-primary"}`}
          />
          <div className="min-w-0">
            <span className="text-xs font-medium text-foreground">
              Allow automated tool injection
            </span>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {autoToolsDisabled
                ? "Off — this agent only ever gets the tools selected here. No surface or automatic tools are added."
                : "On — the active surface may add its default tools on top of your selection."}
            </p>
          </div>
        </div>
        <Switch
          id={`allow-auto-tools-${agentId}`}
          checked={!autoToolsDisabled}
          onCheckedChange={(allow) =>
            dispatch(setAgentAutoToolsDisabled({ agentId, disabled: !allow }))
          }
          className="shrink-0"
        />
      </label>

      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab === "server" && (
          <ServerToolsTab
            agentId={agentId}
            metadata={metadata}
            externalTools={externalTools}
          />
        )}
        {activeTab === "custom" && <CustomToolsTab agentId={agentId} />}
        {activeTab === "client" && (
          <ClientToolsTab
            agentId={agentId}
            availableTools={externalTools || metadata?.enabled_tools || []}
          />
        )}
        {activeTab === "mcp" && <McpToolsTab agentId={agentId} />}
      </div>
    </div>
  );
}

// =============================================================================
// Server Tools Tab
// =============================================================================

function ServerToolsTab({
  agentId,
  metadata,
  externalTools,
}: {
  agentId: string;
  metadata: any;
  externalTools?: DatabaseTool[];
}) {
  const dispatch = useAppDispatch();
  const selectedTools = useAppSelector((state) =>
    selectAgentTools(state, agentId),
  );

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [mobileCategorySheetOpen, setMobileCategorySheetOpen] = useState(false);
  const [toolsList, setToolsList] = useState<{
    items: any[];
    total: number;
    page_size: number;
    page_count: number;
  } | null>(null);
  const [isListLoading, setIsListLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page on category change
  useEffect(() => {
    setPage(1);
  }, [activeCategory]);

  const activeSet = useMemo(
    () =>
      new Set(Array.isArray(selectedTools) ? (selectedTools as string[]) : []),
    [selectedTools],
  );

  const availableIdSet = useMemo(
    () => new Set((metadata?.enabled_tools || []).map((t: any) => t.id)),
    [metadata],
  );

  const orphanedTools = useMemo(() => {
    if (!Array.isArray(selectedTools)) return [];
    // We only call a tool "orphaned" if we are sure it's not in the ENTIRE global registry.
    // metadata.enabled_tools lists all globally enabled tools.
    return (selectedTools as string[]).filter((id) => !availableIdSet.has(id));
  }, [selectedTools, availableIdSet]);

  const toggleTool = useCallback(
    (toolId: string) => {
      const current = Array.isArray(selectedTools)
        ? (selectedTools as string[])
        : [];
      const next = current.includes(toolId)
        ? current.filter((t) => t !== toolId)
        : [...current, toolId];
      dispatch(
        setAgentTools({
          id: agentId,
          tools: next as unknown as typeof selectedTools,
        }),
      );
    },
    [agentId, selectedTools, dispatch],
  );

  const clearAll = () => {
    dispatch(
      setAgentTools({
        id: agentId,
        tools: [] as unknown as typeof selectedTools,
      }),
    );
  };

  const removeOrphan = useCallback(
    (toolId: string) => {
      const current = Array.isArray(selectedTools)
        ? (selectedTools as string[])
        : [];
      dispatch(
        setAgentTools({
          id: agentId,
          tools: current.filter(
            (t) => t !== toolId,
          ) as unknown as typeof selectedTools,
        }),
      );
    },
    [agentId, selectedTools, dispatch],
  );

  const removeAllOrphans = useCallback(() => {
    const current = Array.isArray(selectedTools)
      ? (selectedTools as string[])
      : [];
    dispatch(
      setAgentTools({
        id: agentId,
        tools: current.filter((t) =>
          availableIdSet.has(t),
        ) as unknown as typeof selectedTools,
      }),
    );
  }, [agentId, selectedTools, availableIdSet, dispatch]);

  const [copiedFormat, setCopiedFormat] = useState<EnabledCopyFormat | null>(
    null,
  );

  const handleCopyEnabled = useCallback(
    async (format: EnabledCopyFormat) => {
      const tools = ((metadata?.enabled_tools || []) as DatabaseTool[]).filter(
        (t) => activeSet.has(t.id),
      );
      const text = formatEnabledTools(tools, format);
      try {
        await navigator.clipboard.writeText(text);
        setCopiedFormat(format);
        setTimeout(() => setCopiedFormat(null), 1500);
      } catch (err) {
        console.error("Failed to copy enabled tools", err);
      }
    },
    [metadata, activeSet],
  );

  const enabledPerCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const tool of metadata?.enabled_tools || []) {
      const cat = tool.category ?? "General";
      if (activeSet.has(tool.id)) {
        map.set(cat, (map.get(cat) ?? 0) + 1);
      }
    }
    return map;
  }, [metadata, activeSet]);

  const isEnabledTab = activeCategory === ENABLED_CATEGORY;

  useEffect(() => {
    if (isEnabledTab) return;

    if (externalTools) {
      // Local mode
      let filtered = externalTools;
      if (activeCategory !== ALL_CATEGORY) {
        filtered = filtered.filter(
          (t) => (t.category ?? "General") === activeCategory,
        );
      }
      if (debouncedSearch) {
        filtered = filterAndSortBySearch(filtered, debouncedSearch, [
          { get: (t) => t.name, weight: "title" },
          { get: (t) => t.description, weight: "body" },
          { get: (t) => t.category, weight: "tag" },
          { get: (t) => t.id, weight: "id" },
        ]);
      }
      setToolsList({
        items: filtered,
        total: filtered.length,
        page_size: filtered.length,
        page_count: 1,
      });
      return;
    }

    let active = true;
    setIsListLoading(true);
    const supabase = createClient();
    // The 2026 tool-system refactor simplified get_tools_list to
    // (p_active_only boolean) — server-side filter/search/pagination by
    // category/search/page were dropped. Pull active tools once and filter
    // client-side from the existing `activeCategory` + `debouncedSearch`
    // state below.
    supabase
      .rpc("get_tools_list", { p_active_only: true })
      .then(({ data, error }) => {
        if (active && !error && data) {
          setToolsList(data as any);
        }
        if (active) setIsListLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    activeCategory,
    debouncedSearch,
    page,
    pageSize,
    isEnabledTab,
    externalTools,
  ]);

  const visibleTools = useMemo(() => {
    if (isEnabledTab) {
      // client side filter
      let items = (metadata?.enabled_tools || []).filter((t: any) =>
        activeSet.has(t.id),
      );
      if (debouncedSearch) {
        items = filterAndSortBySearch(items, debouncedSearch, [
          { get: (t: any) => t.name, weight: "title" },
          { get: (t: any) => t.description, weight: "body" },
          { get: (t: any) => t.category, weight: "tag" },
          { get: (t: any) => t.id, weight: "id" },
        ]);
      }
      return items;
    }
    return toolsList?.items || [];
  }, [isEnabledTab, metadata, activeSet, toolsList, debouncedSearch]);

  const allVisibleSelected =
    visibleTools.length > 0 &&
    visibleTools.every((t: any) => activeSet.has(t.id));
  const someVisibleSelected = visibleTools.some((t: any) =>
    activeSet.has(t.id),
  );

  const selectAllVisible = useCallback(() => {
    const current = Array.isArray(selectedTools)
      ? (selectedTools as string[])
      : [];
    const visibleIds = visibleTools.map((t: any) => t.id as string);
    const next = Array.from(new Set([...current, ...visibleIds]));
    dispatch(
      setAgentTools({
        id: agentId,
        tools: next as unknown as typeof selectedTools,
      }),
    );
  }, [agentId, selectedTools, visibleTools, dispatch]);

  const deselectAllVisible = useCallback(() => {
    const current = Array.isArray(selectedTools)
      ? (selectedTools as string[])
      : [];
    const visibleIdSet = new Set(visibleTools.map((t: any) => t.id as string));
    const next = current.filter((id) => !visibleIdSet.has(id));
    dispatch(
      setAgentTools({
        id: agentId,
        tools: next as unknown as typeof selectedTools,
      }),
    );
  }, [agentId, selectedTools, visibleTools, dispatch]);

  const categories = metadata?.categories || [];
  const totalCount = metadata?.total_count || 0;

  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground p-8">
        <Wrench className="w-8 h-8 opacity-30" />
        <p className="text-sm">No tools available.</p>
      </div>
    );
  }

  const enabledCount = activeSet.size;
  const categoryTools = categories.find(
    (c: any) => c.category === activeCategory,
  )?.count;

  const categoryListContent = (inSheet = false) => (
    <div className={`flex flex-col ${inSheet ? "h-full" : "overflow-hidden"}`}>
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center justify-center w-5 h-5 rounded bg-primary/10">
              <Zap className="w-3 h-3 text-primary" />
            </div>
            <span className="text-xs font-semibold text-primary">
              {enabledCount} enabled
            </span>
          </div>
          {enabledCount > 0 && (
            <div className="flex items-center gap-0.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                    title="Copy enabled tools"
                  >
                    {copiedFormat ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Copy {enabledCount} enabled tool
                    {enabledCount === 1 ? "" : "s"} as
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="flex-col items-start gap-0.5 py-2"
                    onClick={() => handleCopyEnabled("full")}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      {copiedFormat === "full" ? (
                        <Check className="h-3 w-3 text-success" />
                      ) : (
                        <FileCode2 className="h-3 w-3" />
                      )}
                      Full JSON
                    </div>
                    <span className="text-[10px] text-muted-foreground pl-[18px]">
                      All metadata, parameters, output schema
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex-col items-start gap-0.5 py-2"
                    onClick={() => handleCopyEnabled("compact")}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      {copiedFormat === "compact" ? (
                        <Check className="h-3 w-3 text-success" />
                      ) : (
                        <FileCode2 className="h-3 w-3" />
                      )}
                      Compact JSON
                    </div>
                    <span className="text-[10px] text-muted-foreground pl-[18px]">
                      id · name · description
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex-col items-start gap-0.5 py-2"
                    onClick={() => handleCopyEnabled("minimal")}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      {copiedFormat === "minimal" ? (
                        <Check className="h-3 w-3 text-success" />
                      ) : (
                        <FileCode2 className="h-3 w-3" />
                      )}
                      Minimal JSON
                    </div>
                    <span className="text-[10px] text-muted-foreground pl-[18px]">
                      name + description (≤120 chars)
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="flex-col items-start gap-0.5 py-2"
                    onClick={() => handleCopyEnabled("xml")}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      {copiedFormat === "xml" ? (
                        <Check className="h-3 w-3 text-success" />
                      ) : (
                        <Tag className="h-3 w-3" />
                      )}
                      XML for prompts
                    </div>
                    <span className="text-[10px] text-muted-foreground pl-[18px]">
                      &lt;tool name=…&gt;…&lt;/tool&gt; for model context
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                onClick={clearAll}
              >
                Clear all
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-1.5 space-y-0.5">
          <CategoryItem
            label="All Tools"
            count={totalCount}
            enabledCount={enabledCount}
            active={activeCategory === ALL_CATEGORY}
            onClick={() => {
              setActiveCategory(ALL_CATEGORY);
              if (inSheet) setMobileCategorySheetOpen(false);
            }}
            icon={<Layers className="w-3 h-3" />}
          />
          {enabledCount > 0 && (
            <CategoryItem
              label="Enabled"
              count={enabledCount}
              enabledCount={enabledCount}
              active={activeCategory === ENABLED_CATEGORY}
              onClick={() => {
                setActiveCategory(ENABLED_CATEGORY);
                if (inSheet) setMobileCategorySheetOpen(false);
              }}
              icon={<Check className="w-3 h-3" />}
              highlight
            />
          )}
          <div className="h-px bg-border mx-1 my-2" />
          {categories.map((c: any) => (
            <CategoryItem
              key={c.category}
              label={c.category}
              count={c.count}
              enabledCount={enabledPerCategory.get(c.category) ?? 0}
              active={activeCategory === c.category}
              onClick={() => {
                setActiveCategory(c.category);
                if (inSheet) setMobileCategorySheetOpen(false);
              }}
              colorKey={c.category}
            />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex overflow-hidden h-full">
      {/* Left sidebar: categories (desktop only) */}
      <div className="hidden sm:flex w-52 shrink-0 border-r border-border flex-col overflow-hidden">
        {categoryListContent(false)}
      </div>

      {/* Mobile category sheet */}
      <Sheet
        open={mobileCategorySheetOpen}
        onOpenChange={setMobileCategorySheetOpen}
      >
        <SheetContent side="left" className="w-64 p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-border shrink-0">
            <SheetTitle className="text-sm">Categories</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            {categoryListContent(true)}
          </div>
        </SheetContent>
      </Sheet>

      {/* Right panel: tools */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Orphaned tools warning */}
        {orphanedTools.length > 0 && (
          <OrphanedToolsBanner
            orphanedTools={orphanedTools}
            onRemove={removeOrphan}
            onRemoveAll={removeAllOrphans}
          />
        )}

        {/* Search */}
        <div className="px-3 py-2.5 border-b border-border shrink-0 flex items-center gap-2">
          {/* Mobile: category filter button */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0 sm:hidden"
            onClick={() => setMobileCategorySheetOpen(true)}
            title="Filter by category"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </Button>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${totalCount} tools…`}
              className="pl-8 pr-8 h-8 text-sm"
              style={{ fontSize: "16px" }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Panel label */}
        <div className="px-3 py-2 shrink-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {activeCategory !== ALL_CATEGORY &&
              activeCategory !== ENABLED_CATEGORY && (
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${getCategoryColor(activeCategory).dot}`}
                />
              )}
            {activeCategory === ENABLED_CATEGORY && (
              <Zap className="w-3 h-3 text-primary shrink-0" />
            )}
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
              {activeCategory === ALL_CATEGORY
                ? "All Tools"
                : activeCategory === ENABLED_CATEGORY
                  ? "Enabled Tools"
                  : activeCategory}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {enabledCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-primary sm:hidden">
                <Zap className="w-3 h-3" />
                {enabledCount}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {isEnabledTab ? visibleTools.length : toolsList?.total || 0} tools
            </span>
            {/* Select all / Deselect all for visible tools */}
            {visibleTools.length > 0 && !isEnabledTab && (
              <div className="flex items-center gap-0.5">
                {allVisibleSelected ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                    onClick={deselectAllVisible}
                    title="Deselect all visible tools"
                  >
                    None
                  </Button>
                ) : (
                  <>
                    {someVisibleSelected && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                        onClick={deselectAllVisible}
                        title="Deselect all visible tools"
                      >
                        None
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={selectAllVisible}
                      title="Select all visible tools"
                    >
                      Select all
                    </Button>
                  </>
                )}
              </div>
            )}
            {isEnabledTab && enabledCount > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground gap-1"
                    title="Copy enabled tools"
                  >
                    {copiedFormat ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    <span>{copiedFormat ? "Copied" : "Copy"}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Copy {enabledCount} enabled tool
                    {enabledCount === 1 ? "" : "s"} as
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="flex-col items-start gap-0.5 py-2"
                    onClick={() => handleCopyEnabled("full")}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      {copiedFormat === "full" ? (
                        <Check className="h-3 w-3 text-success" />
                      ) : (
                        <FileCode2 className="h-3 w-3" />
                      )}
                      Full JSON
                    </div>
                    <span className="text-[10px] text-muted-foreground pl-[18px]">
                      All metadata, parameters, output schema
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex-col items-start gap-0.5 py-2"
                    onClick={() => handleCopyEnabled("compact")}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      {copiedFormat === "compact" ? (
                        <Check className="h-3 w-3 text-success" />
                      ) : (
                        <FileCode2 className="h-3 w-3" />
                      )}
                      Compact JSON
                    </div>
                    <span className="text-[10px] text-muted-foreground pl-[18px]">
                      id · name · description
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex-col items-start gap-0.5 py-2"
                    onClick={() => handleCopyEnabled("minimal")}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      {copiedFormat === "minimal" ? (
                        <Check className="h-3 w-3 text-success" />
                      ) : (
                        <FileCode2 className="h-3 w-3" />
                      )}
                      Minimal JSON
                    </div>
                    <span className="text-[10px] text-muted-foreground pl-[18px]">
                      name + description (≤120 chars)
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="flex-col items-start gap-0.5 py-2"
                    onClick={() => handleCopyEnabled("xml")}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      {copiedFormat === "xml" ? (
                        <Check className="h-3 w-3 text-success" />
                      ) : (
                        <Tag className="h-3 w-3" />
                      )}
                      XML for prompts
                    </div>
                    <span className="text-[10px] text-muted-foreground pl-[18px]">
                      &lt;tool name=…&gt;…&lt;/tool&gt; for model context
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Tool cards */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 pb-4 space-y-1">
            {isListLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-xs">Loading items...</span>
              </div>
            ) : visibleTools.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                <Search className="w-5 h-5 opacity-40" />
                <p className="text-xs">
                  {search
                    ? `No tools match "${search}"`
                    : "No tools in this category"}
                </p>
              </div>
            ) : (
              visibleTools.map((tool: any) => {
                const isActive = activeSet.has(tool.id);
                return (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    active={isActive}
                    expanded={expandedTool === tool.id}
                    onToggle={toggleTool}
                    onExpand={() =>
                      setExpandedTool(expandedTool === tool.id ? null : tool.id)
                    }
                  />
                );
              })
            )}
          </div>
        </div>

        {/* Pagination */}
        {!isEnabledTab && toolsList && toolsList.page_count > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-border shrink-0 bg-muted/20">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-7 text-xs"
            >
              Previous
            </Button>
            <span className="text-[10px] text-muted-foreground">
              Page {page} of {toolsList.page_count}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= toolsList.page_count}
              onClick={() => setPage((p) => p + 1)}
              className="h-7 text-xs"
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Enabled Tools — Copy/Export Helpers
// =============================================================================

type EnabledCopyFormat = "full" | "compact" | "minimal" | "xml";

function truncateForPrompt(s: string, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatEnabledTools(
  tools: DatabaseTool[],
  format: EnabledCopyFormat,
): string {
  switch (format) {
    case "full":
      return JSON.stringify(
        tools.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          tags: t.tags,
          parameters: t.parameters,
          output_schema: t.output_schema,
          annotations: t.annotations,
        })),
        null,
        2,
      );
    case "compact":
      return JSON.stringify(
        tools.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
        })),
        null,
        2,
      );
    case "minimal":
      return JSON.stringify(
        tools.map((t) => ({
          name: t.name,
          description: truncateForPrompt(t.description, 120),
        })),
        null,
        2,
      );
    case "xml": {
      const lines = tools.map(
        (t) =>
          `  <tool name="${escapeXml(t.name)}">${escapeXml(
            truncateForPrompt(t.description, 200),
          )}</tool>`,
      );
      return `<tools>\n${lines.join("\n")}\n</tools>`;
    }
  }
}

// =============================================================================
// Orphaned Tools Banner
// =============================================================================

function OrphanedToolsBanner({
  orphanedTools,
  onRemove,
  onRemoveAll,
}: {
  orphanedTools: string[];
  onRemove: (name: string) => void;
  onRemoveAll: () => void;
}) {
  const [resolved, setResolved] = useState<Record<string, DatabaseTool>>({});
  const [lookupStatus, setLookupStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");

  // Stable string key so we re-fetch only when the actual ID set changes.
  const idsKey = useMemo(
    () => [...orphanedTools].sort().join(","),
    [orphanedTools],
  );

  useEffect(() => {
    if (orphanedTools.length === 0) {
      setResolved({});
      setLookupStatus("idle");
      return;
    }

    let active = true;
    setLookupStatus("loading");
    const supabase = createClient();
    supabase
      .from("tool_def")
      .select("*")
      .in("id", orphanedTools)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Failed to look up orphaned tools", error);
          setLookupStatus("error");
          return;
        }
        const map: Record<string, DatabaseTool> = {};
        for (const tool of (data || []) as DatabaseTool[]) {
          map[tool.id] = tool;
        }
        setResolved(map);
        setLookupStatus("done");
      });

    return () => {
      active = false;
    };
    // idsKey changes only when the actual ID set changes; safe to ignore the
    // closed-over orphanedTools array since its content tracks idsKey 1:1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="mx-3 mt-3 rounded border border-yellow-400 dark:border-yellow-600 overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-yellow-50 dark:bg-yellow-950/40 border-b border-yellow-300 dark:border-yellow-700">
          <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-yellow-800 dark:text-yellow-300">
            Unresolved Tools
          </span>
          <span className="ml-auto text-[10px] text-yellow-600 dark:text-yellow-500">
            {orphanedTools.length} tool{orphanedTools.length !== 1 ? "s" : ""}{" "}
            not found in registry
          </span>
          {orphanedTools.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] text-yellow-700 dark:text-yellow-300 hover:text-destructive"
              onClick={onRemoveAll}
            >
              Remove all
            </Button>
          )}
        </div>
        {orphanedTools.map((id, idx) => {
          const tool = resolved[id];
          const isLast = idx === orphanedTools.length - 1;
          const status: "loading" | "inactive" | "missing" =
            lookupStatus === "loading"
              ? "loading"
              : tool
                ? "inactive"
                : "missing";

          return (
            <div
              key={id}
              className={`flex items-start gap-2 px-2.5 py-1.5 bg-yellow-50/30 dark:bg-yellow-950/15 ${
                !isLast
                  ? "border-b border-yellow-200 dark:border-yellow-800/40"
                  : ""
              }`}
            >
              <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                {status === "inactive" && tool ? (
                  <>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-foreground truncate">
                        {tool.name}
                      </span>
                      {tool.category && (
                        <Badge
                          variant="outline"
                          className="h-4 px-1 text-[9px] font-normal"
                        >
                          {tool.category}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className="h-4 px-1 text-[9px] font-normal text-orange-600 border-orange-400 dark:text-orange-400 dark:border-orange-700"
                      >
                        Inactive
                      </Badge>
                    </div>
                    {tool.description && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                        {tool.description}
                      </p>
                    )}
                    <p className="font-mono text-[9px] text-muted-foreground/70 mt-0.5 truncate">
                      {id}
                    </p>
                  </>
                ) : status === "missing" ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="h-4 px-1 text-[9px] font-normal text-destructive border-destructive/50"
                      >
                        Not in DB
                      </Badge>
                    </div>
                    <p className="font-mono text-[10px] text-foreground mt-0.5 truncate">
                      {id}
                    </p>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    <span className="font-mono text-[10px] text-muted-foreground truncate">
                      {id}
                    </span>
                  </div>
                )}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => onRemove(id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  Remove from agent
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

// =============================================================================
// Custom Tools Tab
// =============================================================================

function CustomToolsTab({ agentId }: { agentId: string }) {
  const dispatch = useAppDispatch();
  const customTools = useAppSelector((state) =>
    selectAgentCustomTools(state, agentId),
  );
  const tools: CustomToolDefinition[] = Array.isArray(customTools)
    ? customTools
    : [];

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleDelete = useCallback(
    (index: number) => {
      const next = tools.filter((_, i) => i !== index);
      dispatch(setAgentCustomTools({ id: agentId, customTools: next }));
      if (editingIndex === index) setEditingIndex(null);
    },
    [agentId, tools, editingIndex, dispatch],
  );

  const handleSaveTool = useCallback(
    (tool: CustomToolDefinition, index: number | null) => {
      if (index !== null) {
        const next = [...tools];
        next[index] = tool;
        dispatch(setAgentCustomTools({ id: agentId, customTools: next }));
        setEditingIndex(null);
      } else {
        dispatch(
          setAgentCustomTools({ id: agentId, customTools: [...tools, tool] }),
        );
        setIsAdding(false);
      }
    },
    [agentId, tools, dispatch],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-border shrink-0 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">
            Custom Tool Definitions
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Inline tools following the MCP standard. Always delegated to the
            client.
          </p>
        </div>
        {!isAdding && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => {
              setIsAdding(true);
              setEditingIndex(null);
            }}
          >
            <Plus className="w-3 h-3" />
            Add Tool
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isAdding && (
          <CustomToolForm
            onSave={(tool) => handleSaveTool(tool, null)}
            onCancel={() => setIsAdding(false)}
            existingNames={tools.map((t) => t.name)}
          />
        )}

        {tools.length === 0 && !isAdding && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Code2 className="w-8 h-8 opacity-30" />
            <p className="text-sm">No custom tools defined.</p>
            <p className="text-xs max-w-xs text-center">
              Custom tools let you define inline tool specifications that are
              always delegated to the client for execution.
            </p>
          </div>
        )}

        {tools.map((tool, idx) =>
          editingIndex === idx ? (
            <CustomToolForm
              key={`edit-${idx}`}
              initial={tool}
              onSave={(t) => handleSaveTool(t, idx)}
              onCancel={() => setEditingIndex(null)}
              existingNames={tools
                .filter((_, i) => i !== idx)
                .map((t) => t.name)}
            />
          ) : (
            <CustomToolCard
              key={tool.name}
              tool={tool}
              onEdit={() => {
                setEditingIndex(idx);
                setIsAdding(false);
              }}
              onDelete={() => handleDelete(idx)}
            />
          ),
        )}
      </div>
    </div>
  );
}

function CustomToolCard({
  tool,
  onEdit,
  onDelete,
}: {
  tool: CustomToolDefinition;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const paramCount = tool.input_schema
    ? Object.keys(tool.input_schema.properties).length
    : 0;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-0.5 text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">
              {tool.name}
            </span>
            <Badge variant="secondary" className="text-[10px]">
              {paramCount} param{paramCount !== 1 ? "s" : ""}
            </Badge>
          </div>
          {tool.description && (
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              {tool.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onEdit}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {expanded && tool.input_schema && (
        <div className="px-3 pb-3 border-t border-border pt-2">
          <ParameterTable schema={tool.input_schema} />
        </div>
      )}
    </div>
  );
}

function CustomToolForm({
  initial,
  onSave,
  onCancel,
  existingNames,
}: {
  initial?: CustomToolDefinition;
  onSave: (tool: CustomToolDefinition) => void;
  onCancel: () => void;
  existingNames: string[];
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [params, setParams] = useState<
    Array<{
      name: string;
      type: string;
      description: string;
      required: boolean;
    }>
  >(() => {
    if (!initial?.input_schema) return [];
    const schema = initial.input_schema;
    const requiredSet = new Set(schema.required ?? []);
    return Object.entries(schema.properties).map(([pName, pDef]) => ({
      name: pName,
      type: pDef.type,
      description: pDef.description ?? "",
      required: requiredSet.has(pName),
    }));
  });

  const nameError = useMemo(() => {
    if (!name) return null;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
      return "Must match [a-zA-Z0-9_-], max 64 chars";
    }
    if (existingNames.includes(name)) {
      return "Name already exists";
    }
    return null;
  }, [name, existingNames]);

  const canSave = name.length > 0 && !nameError;

  const addParam = () => {
    setParams([
      ...params,
      { name: "", type: "string", description: "", required: false },
    ]);
  };

  const updateParam = (idx: number, field: string, value: string | boolean) => {
    const next = [...params];
    next[idx] = { ...next[idx], [field]: value };
    setParams(next);
  };

  const removeParam = (idx: number) => {
    setParams(params.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    const validParams = params.filter((p) => p.name.trim());
    const inputSchema: CustomToolInputSchema | undefined =
      validParams.length > 0
        ? {
            type: "object" as const,
            properties: Object.fromEntries(
              validParams.map((p) => [
                p.name,
                {
                  type: p.type,
                  ...(p.description ? { description: p.description } : {}),
                },
              ]),
            ),
            required: validParams.filter((p) => p.required).map((p) => p.name),
          }
        : undefined;

    onSave({
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(inputSchema ? { input_schema: inputSchema } : {}),
    });
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px] text-muted-foreground mb-1 block">
            Tool Name
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="get_customer_status"
            className="h-7 text-xs"
            style={{ fontSize: "16px" }}
          />
          {nameError && (
            <p className="text-[10px] text-destructive mt-0.5">{nameError}</p>
          )}
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground mb-1 block">
            Description
          </Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this tool does..."
            className="h-7 text-xs"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-[11px] text-muted-foreground">
            Parameters
          </Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] px-1.5"
            onClick={addParam}
          >
            <Plus className="w-2.5 h-2.5 mr-0.5" />
            Add
          </Button>
        </div>

        {params.length > 0 && (
          <div className="space-y-1.5">
            {params.map((param, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <Input
                  value={param.name}
                  onChange={(e) => updateParam(idx, "name", e.target.value)}
                  placeholder="param_name"
                  className="h-6 text-[11px] flex-1"
                  style={{ fontSize: "16px" }}
                />
                <Select
                  value={param.type}
                  onValueChange={(v) => updateParam(idx, "type", v)}
                >
                  <SelectTrigger className="h-6 text-[11px] w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "string",
                      "number",
                      "integer",
                      "boolean",
                      "array",
                      "object",
                    ].map((t) => (
                      <SelectItem key={t} value={t} className="text-[11px]">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={param.description}
                  onChange={(e) =>
                    updateParam(idx, "description", e.target.value)
                  }
                  placeholder="Description..."
                  className="h-6 text-[11px] flex-1"
                  style={{ fontSize: "16px" }}
                />
                <div className="flex items-center gap-1">
                  <Checkbox
                    checked={param.required}
                    onCheckedChange={(v) => updateParam(idx, "required", !!v)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-[10px] text-muted-foreground">Req</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-destructive"
                  onClick={() => removeParam(idx)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={handleSave}
          disabled={!canSave}
        >
          {initial ? "Update" : "Add Tool"}
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Client Tools Tab
// =============================================================================

function ClientToolsTab({
  agentId,
  availableTools,
}: {
  agentId: string;
  availableTools: DatabaseTool[];
}) {
  const selectedTools = useAppSelector((state) =>
    selectAgentTools(state, agentId),
  );
  const customTools = useAppSelector((state) =>
    selectAgentCustomTools(state, agentId),
  );

  const enabledServerTools = useMemo(() => {
    if (!Array.isArray(selectedTools)) return [];
    const ids = new Set(selectedTools as string[]);
    return availableTools.filter((t) => ids.has(t.id));
  }, [selectedTools, availableTools]);

  const enabledCustomTools: CustomToolDefinition[] = useMemo(
    () => (Array.isArray(customTools) ? customTools : []),
    [customTools],
  );

  const allEnabledToolNames = useMemo(() => {
    const serverNames = enabledServerTools.map((t) => t.name);
    const customNames = enabledCustomTools.map((t) => t.name);
    return [...serverNames, ...customNames];
  }, [enabledServerTools, enabledCustomTools]);

  const [clientToolNames, setClientToolNames] = useState<Set<string>>(
    new Set(),
  );

  const toggleClientTool = (name: string) => {
    const next = new Set(clientToolNames);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setClientToolNames(next);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <p className="text-xs font-semibold text-foreground">
          Client-Handled Tools
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          When the AI calls a client tool, the server delegates it back to the
          browser for execution. You have 120 seconds to respond.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {allEnabledToolNames.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Monitor className="w-8 h-8 opacity-30" />
            <p className="text-sm">No tools enabled yet.</p>
            <p className="text-xs max-w-xs text-center">
              Enable server or custom tools first, then mark which ones the
              client should handle.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {enabledServerTools.length > 0 && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Server Tools
                </p>
                {enabledServerTools.map((tool) => (
                  <ClientToolRow
                    key={tool.name}
                    name={tool.name}
                    description={tool.description}
                    isClient={clientToolNames.has(tool.name)}
                    onToggle={() => toggleClientTool(tool.name)}
                    source="server"
                  />
                ))}
              </>
            )}

            {enabledCustomTools.length > 0 && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 mt-4">
                  Custom Tools (always client-delegated)
                </p>
                {enabledCustomTools.map((tool) => (
                  <ClientToolRow
                    key={tool.name}
                    name={tool.name}
                    description={tool.description}
                    isClient={true}
                    onToggle={() => {}}
                    source="custom"
                    locked
                  />
                ))}
              </>
            )}
          </div>
        )}

        <div className="mt-6 p-3 rounded-lg bg-muted/40 border border-border">
          <div className="flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-[11px] text-muted-foreground space-y-1">
              <p>
                <strong>How client tools work:</strong> When the AI model
                invokes a client tool, the server emits a{" "}
                <code className="text-[10px] bg-muted px-1 py-0.5 rounded">
                  tool_delegated
                </code>{" "}
                event instead of executing it. Your client code receives the
                call and must respond within 120 seconds.
              </p>
              <p>
                Custom tools are automatically delegated — they have no
                server-side implementation. For server tools, toggling
                "client-handled" tells the server to delegate instead of
                executing.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientToolRow({
  name,
  description,
  isClient,
  onToggle,
  source,
  locked,
}: {
  name: string;
  description?: string;
  isClient: boolean;
  onToggle: () => void;
  source: "server" | "custom";
  locked?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-transparent hover:bg-muted/50 hover:border-border transition-colors">
      <Checkbox
        checked={isClient}
        onCheckedChange={() => onToggle()}
        disabled={locked}
        className={locked ? "opacity-50" : ""}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{name}</span>
          {source === "custom" && (
            <Badge variant="outline" className="text-[9px] h-4">
              auto-delegated
            </Badge>
          )}
        </div>
        {description && (
          <p className="text-[11px] text-muted-foreground truncate">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Transport badge metadata
// =============================================================================

const TRANSPORT_META: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  http: {
    label: "HTTP",
    icon: <Globe className="w-3 h-3" />,
    color: "text-blue-500",
  },
  sse: {
    label: "SSE",
    icon: <Radio className="w-3 h-3" />,
    color: "text-amber-500",
  },
  stdio: {
    label: "stdio",
    icon: <Terminal className="w-3 h-3" />,
    color: "text-green-500",
  },
};

function authStrategyLabel(strategy: string): string {
  switch (strategy) {
    case "oauth_discovery":
      return "OAuth 2.1";
    case "bearer":
      return "Bearer Token";
    case "api_key":
      return "API Key";
    case "env":
      return "Env Vars";
    case "none":
      return "No Auth";
    default:
      return strategy;
  }
}

function connectionBadge(status: string | null) {
  switch (status) {
    case "connected":
      return {
        label: "Connected",
        cls: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
      };
    case "expired":
      return {
        label: "Expired",
        cls: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
      };
    case "refresh_failed":
      return {
        label: "Refresh Failed",
        cls: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
      };
    case "error":
      return {
        label: "Error",
        cls: "bg-destructive/15 text-destructive border-destructive/30",
      };
    case "disconnected":
      return {
        label: "Disconnected",
        cls: "bg-muted text-muted-foreground border-border",
      };
    default:
      return {
        label: "Not Connected",
        cls: "bg-muted text-muted-foreground border-border",
      };
  }
}

// =============================================================================
// MCP Tools Tab — real catalog + agent-level server assignment
// =============================================================================

function McpToolsTab({ agentId }: { agentId: string }) {
  const dispatch = useAppDispatch();
  const catalog = useAppSelector(selectMcpCatalog);
  const catalogStatus = useAppSelector(selectMcpCatalogStatus);
  const catalogError = useAppSelector(selectMcpCatalogError);
  const connectingServerId = useAppSelector(selectMcpConnectingServerId);
  const agentMcpServersRaw = useAppSelector((state) =>
    selectAgentMcpServers(state, agentId),
  );
  const agentMcpServers = agentMcpServersRaw ?? [];
  const [showCatalog, setShowCatalog] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [oauthFeedback, setOauthFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const agentServerSet = useMemo(
    () => new Set(agentMcpServers),
    [agentMcpServers],
  );

  const agentCatalogEntries = useMemo(
    () => catalog.filter((e) => agentServerSet.has(e.serverId)),
    [catalog, agentServerSet],
  );

  useEffect(() => {
    if (catalogStatus === "idle") {
      dispatch(fetchCatalog());
    }
  }, [catalogStatus, dispatch]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.type === "mcp_oauth_complete") {
        dispatch(fetchCatalog());
        setOauthFeedback({
          type: "success",
          message: "Connected successfully!",
        });
        setTimeout(() => setOauthFeedback(null), 5000);
      } else if (data?.type === "mcp_oauth_error") {
        setOauthFeedback({
          type: "error",
          message: data.error ?? "OAuth connection failed",
        });
        setTimeout(() => setOauthFeedback(null), 10000);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [dispatch]);

  const addToAgent = useCallback(
    (serverId: string) => {
      if (!agentServerSet.has(serverId)) {
        dispatch(
          setAgentMcpServers({
            id: agentId,
            mcpServers: [...agentMcpServers, serverId],
          }),
        );
      }
    },
    [agentId, agentMcpServers, agentServerSet, dispatch],
  );

  const removeFromAgent = useCallback(
    (serverId: string) => {
      dispatch(
        setAgentMcpServers({
          id: agentId,
          mcpServers: agentMcpServers.filter((id) => id !== serverId),
        }),
      );
    },
    [agentId, agentMcpServers, dispatch],
  );

  if (showCatalog) {
    return (
      <McpCatalogPicker
        catalog={catalog}
        catalogStatus={catalogStatus}
        catalogError={catalogError}
        agentServerSet={agentServerSet}
        connectingServerId={connectingServerId}
        onAdd={addToAgent}
        onBack={() => setShowCatalog(false)}
        onConnect={(entry) => {
          if (entry.authStrategy === "none") {
            addToAgent(entry.serverId);
            return;
          }
          if (entry.authStrategy === "oauth_discovery") {
            window.open(
              `/api/mcp/oauth/start?server_id=${entry.serverId}&return_url=${encodeURIComponent(window.location.href)}`,
              "_blank",
              "width=600,height=700",
            );
            return;
          }
          setShowCatalog(false);
          setExpandedServer(entry.serverId);
        }}
        onDisconnect={(serverId) => dispatch(disconnectServer(serverId))}
      />
    );
  }

  const feedbackBanner = oauthFeedback && (
    <div
      className={`mx-3 mt-3 p-2.5 rounded border text-[11px] flex items-center gap-2 ${
        oauthFeedback.type === "success"
          ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
          : "border-destructive/30 bg-destructive/5 text-destructive"
      }`}
    >
      {oauthFeedback.type === "success" ? (
        <Check className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      )}
      <span className="flex-1">{oauthFeedback.message}</span>
      <button
        onClick={() => setOauthFeedback(null)}
        className="text-current opacity-60 hover:opacity-100"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );

  if (agentCatalogEntries.length === 0 && catalogStatus !== "loading") {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {feedbackBanner}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground px-8">
          <div className="p-4 rounded-full bg-muted/40">
            <Plug className="w-10 h-10 opacity-40" />
          </div>
          <div className="text-center max-w-md space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              MCP Server Integration
            </h3>
            <p className="text-xs leading-relaxed">
              Connect external MCP servers to give this agent access to tools
              from services like Notion, Stripe, Supabase, GitHub, and more.
            </p>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setShowCatalog(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            Browse Catalog ({catalog.length} servers)
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {feedbackBanner}
      <div className="px-4 py-3 border-b border-border shrink-0 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">
            Agent MCP Servers
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {agentCatalogEntries.length} server
            {agentCatalogEntries.length !== 1 ? "s" : ""} assigned
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setShowCatalog(true)}
        >
          <Plus className="w-3 h-3" />
          Add from Catalog
        </Button>
      </div>

      {/* Search within assigned servers */}
      {agentCatalogEntries.length > 4 && (
        <div className="px-4 py-2 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter assigned servers..."
              className="pl-8 h-7 text-xs"
              style={{ fontSize: "16px" }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {filterAndSortBySearch(agentCatalogEntries, search, [
          { get: (e) => e.name, weight: "title" },
          { get: (e) => e.vendor, weight: "subtitle" },
          { get: (e) => e.description, weight: "body" },
        ]).map((entry) => (
          <McpAgentServerCard
            key={entry.serverId}
            entry={entry}
            expanded={expandedServer === entry.serverId}
            connectingServerId={connectingServerId}
            onExpand={() =>
              setExpandedServer(
                expandedServer === entry.serverId ? null : entry.serverId,
              )
            }
            onRemove={() => removeFromAgent(entry.serverId)}
            onConnect={(entry) => {
              if (entry.authStrategy === "oauth_discovery") {
                window.open(
                  `/api/mcp/oauth/start?server_id=${entry.serverId}&return_url=${encodeURIComponent(window.location.href)}`,
                  "_blank",
                  "width=600,height=700",
                );
              }
            }}
            onDisconnect={(serverId) => dispatch(disconnectServer(serverId))}
          />
        ))}
      </div>

      {/* Unresolved servers (agent references UUIDs not in catalog) */}
      {agentMcpServers.some((id) => !catalog.find((c) => c.serverId === id)) &&
        catalog.length > 0 && (
          <div className="mx-3 mb-3 rounded border border-yellow-400 dark:border-yellow-600 bg-yellow-50/30 dark:bg-yellow-950/15 p-2.5">
            <div className="flex items-center gap-2 text-[11px]">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400 shrink-0" />
              <span className="text-yellow-800 dark:text-yellow-300 font-medium">
                {
                  agentMcpServers.filter(
                    (id) => !catalog.find((c) => c.serverId === id),
                  ).length
                }{" "}
                server(s) referenced but not found in catalog
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[10px] ml-auto text-yellow-700 dark:text-yellow-300 hover:text-destructive"
                onClick={() => {
                  const validIds = agentMcpServers.filter((id) =>
                    catalog.find((c) => c.serverId === id),
                  );
                  dispatch(
                    setAgentMcpServers({
                      id: agentId,
                      mcpServers: validIds,
                    }),
                  );
                }}
              >
                Remove invalid
              </Button>
            </div>
          </div>
        )}
    </div>
  );
}

// =============================================================================
// Agent Server Card — shows a server assigned to this agent
// =============================================================================

function McpAgentServerCard({
  entry,
  expanded,
  connectingServerId,
  onExpand,
  onRemove,
  onConnect,
  onDisconnect,
}: {
  entry: McpCatalogEntry;
  expanded: boolean;
  connectingServerId: string | null;
  onExpand: () => void;
  onRemove: () => void;
  onConnect: (entry: McpCatalogEntry) => void;
  onDisconnect: (serverId: string) => void;
}) {
  const badge = connectionBadge(entry.connectionStatus);
  const isConnecting = connectingServerId === entry.serverId;
  const transportMeta = TRANSPORT_META[entry.transport] ?? TRANSPORT_META.http;
  const needsCredentialForm =
    entry.connectionStatus !== "connected" &&
    entry.authStrategy !== "none" &&
    entry.authStrategy !== "oauth_discovery";

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-start gap-3 px-3 py-2.5">
        {entry.iconUrl ? (
          <img
            src={entry.iconUrl}
            alt=""
            className="w-6 h-6 rounded mt-0.5 shrink-0 object-contain"
          />
        ) : (
          <div
            className="w-6 h-6 rounded mt-0.5 shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
            style={{ backgroundColor: entry.color ?? "#6b7280" }}
          >
            {entry.name.charAt(0).toUpperCase()}
          </div>
        )}

        <button onClick={onExpand} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-xs font-semibold text-foreground">
              {entry.name}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {entry.vendor}
            </span>
            <Badge
              variant="outline"
              className={`text-[9px] h-4 px-1.5 gap-0.5 ${transportMeta.color}`}
            >
              {transportMeta.icon}
              {transportMeta.label}
            </Badge>
            <Badge
              variant="outline"
              className={`text-[9px] h-4 px-1.5 border ${badge.cls}`}
            >
              {badge.label}
            </Badge>
          </div>
          {entry.description && (
            <p className="text-[11px] text-muted-foreground truncate">
              {entry.description}
            </p>
          )}
        </button>

        <div className="flex items-center gap-0.5 shrink-0">
          {entry.connectionStatus !== "connected" &&
            entry.authStrategy !== "none" && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2"
                disabled={isConnecting}
                onClick={() => {
                  if (needsCredentialForm) {
                    if (!expanded) onExpand();
                  } else {
                    onConnect(entry);
                  }
                }}
              >
                {isConnecting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  "Connect"
                )}
              </Button>
            )}
          {entry.connectionStatus === "connected" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2 text-muted-foreground hover:text-destructive"
              onClick={() => onDisconnect(entry.serverId)}
            >
              Disconnect
            </Button>
          )}
          <button
            onClick={onExpand}
            className="text-muted-foreground hover:text-foreground p-1"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-border/50 pt-2 space-y-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
            <div>
              <span className="text-muted-foreground">Transport:</span>{" "}
              <span className="font-mono text-foreground">
                {entry.transport}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Auth:</span>{" "}
              <span className="text-foreground">
                {authStrategyLabel(entry.authStrategy)}
              </span>
            </div>
            {entry.endpointUrl && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Endpoint:</span>{" "}
                <span className="font-mono text-foreground break-all">
                  {entry.endpointUrl}
                </span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Category:</span>{" "}
              <span className="text-foreground">
                {MCP_CATEGORY_META[entry.category]?.label ?? entry.category}
              </span>
            </div>
            {entry.connectionStatus === "connected" && entry.connectedAt && (
              <div>
                <span className="text-muted-foreground">Connected:</span>{" "}
                <span className="text-foreground">
                  {new Date(entry.connectedAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            {entry.websiteUrl && (
              <a
                href={entry.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary hover:underline"
              >
                Website
              </a>
            )}
            {entry.docsUrl && (
              <a
                href={entry.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary hover:underline"
              >
                Documentation
              </a>
            )}
          </div>

          {needsCredentialForm && <McpCredentialForm entry={entry} />}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Credential Forms for non-OAuth servers
// =============================================================================

function McpCredentialForm({ entry }: { entry: McpCatalogEntry }) {
  if (entry.authStrategy === "bearer") {
    return <BearerTokenForm entry={entry} />;
  }
  if (entry.authStrategy === "api_key") {
    return <ApiKeyForm entry={entry} />;
  }
  if (entry.authStrategy === "env") {
    return <EnvVarForm entry={entry} />;
  }
  return null;
}

function BearerTokenForm({ entry }: { entry: McpCatalogEntry }) {
  const dispatch = useAppDispatch();
  const connectingServerId = useAppSelector(selectMcpConnectingServerId);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSaving = connectingServerId === entry.serverId;

  const handleSubmit = async () => {
    if (!token.trim()) {
      setError("Token is required");
      return;
    }
    setError(null);
    try {
      await dispatch(
        connectServer({
          serverId: entry.serverId,
          accessToken: token.trim(),
          transport: entry.transport,
        }),
      ).unwrap();
      setToken("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  };

  return (
    <div className="rounded border border-border bg-muted/20 p-3 space-y-2.5">
      <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
        <KeyRound className="w-3.5 h-3.5" />
        Bearer Token
      </p>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Provide an access token or personal access token (PAT) for {entry.name}.
        {entry.docsUrl && (
          <>
            {" "}
            <a
              href={entry.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              See docs
            </a>
          </>
        )}
      </p>
      <div className="relative">
        <Input
          type={showToken ? "text" : "password"}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste your token here..."
          className="pr-9 h-8 text-xs font-mono"
          style={{ fontSize: "16px" }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <button
          type="button"
          onClick={() => setShowToken(!showToken)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {showToken ? (
            <EyeOff className="w-3.5 h-3.5" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      {error && (
        <p className="text-[10px] text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {error}
        </p>
      )}
      <Button
        size="sm"
        className="h-7 text-[11px] gap-1.5 w-full"
        disabled={isSaving || !token.trim()}
        onClick={handleSubmit}
      >
        {isSaving ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Save className="w-3 h-3" />
        )}
        {isSaving ? "Saving..." : "Save & Connect"}
      </Button>
    </div>
  );
}

function ApiKeyForm({ entry }: { entry: McpCatalogEntry }) {
  const dispatch = useAppDispatch();
  const connectingServerId = useAppSelector(selectMcpConnectingServerId);
  const [apiKey, setApiKey] = useState("");
  const [headerName, setHeaderName] = useState("X-API-Key");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSaving = connectingServerId === entry.serverId;

  const handleSubmit = async () => {
    if (!apiKey.trim()) {
      setError("API key is required");
      return;
    }
    setError(null);
    const credentials = JSON.stringify({
      headerName: headerName.trim() || "X-API-Key",
      apiKey: apiKey.trim(),
    });
    try {
      await dispatch(
        connectServer({
          serverId: entry.serverId,
          credentialsJson: credentials,
          transport: entry.transport,
        }),
      ).unwrap();
      setApiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  };

  return (
    <div className="rounded border border-border bg-muted/20 p-3 space-y-2.5">
      <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
        <KeyRound className="w-3.5 h-3.5" />
        API Key
      </p>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Provide your API key for {entry.name}.
        {entry.docsUrl && (
          <>
            {" "}
            <a
              href={entry.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              See docs
            </a>
          </>
        )}
      </p>
      <div className="space-y-2">
        <div>
          <Label className="text-[10px] text-muted-foreground mb-1 block">
            Header Name
          </Label>
          <Input
            value={headerName}
            onChange={(e) => setHeaderName(e.target.value)}
            placeholder="X-API-Key"
            className="h-7 text-xs font-mono"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground mb-1 block">
            API Key
          </Label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key..."
              className="pr-9 h-7 text-xs font-mono"
              style={{ fontSize: "16px" }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
      {error && (
        <p className="text-[10px] text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {error}
        </p>
      )}
      <Button
        size="sm"
        className="h-7 text-[11px] gap-1.5 w-full"
        disabled={isSaving || !apiKey.trim()}
        onClick={handleSubmit}
      >
        {isSaving ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Save className="w-3 h-3" />
        )}
        {isSaving ? "Saving..." : "Save & Connect"}
      </Button>
    </div>
  );
}

function EnvVarForm({ entry }: { entry: McpCatalogEntry }) {
  const dispatch = useAppDispatch();
  const connectingServerId = useAppSelector(selectMcpConnectingServerId);
  const [configs, setConfigs] = useState<McpServerConfigEntry[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isSaving = connectingServerId === entry.serverId;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMcpServerConfigs(entry.serverId)
      .then((data) => {
        if (cancelled) return;
        setConfigs(data);
        if (data.length > 0) {
          const defaultConfig = data.find((c) => c.isDefault) ?? data[0];
          setSelectedConfigId(defaultConfig.id);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load config");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entry.serverId]);

  const selectedConfig = configs.find((c) => c.id === selectedConfigId);
  const envSchema: McpEnvSchemaField[] = selectedConfig?.envSchema ?? [];

  const handleSubmit = async () => {
    const missingRequired = envSchema
      .filter((f) => f.required && !envValues[f.key]?.trim())
      .map((f) => f.label || f.key);

    if (missingRequired.length > 0) {
      setError(`Required: ${missingRequired.join(", ")}`);
      return;
    }

    setError(null);
    const credentials = JSON.stringify(envValues);
    try {
      await dispatch(
        connectServer({
          serverId: entry.serverId,
          credentialsJson: credentials,
          configId: selectedConfigId ?? undefined,
          transport: entry.transport,
        }),
      ).unwrap();
      setEnvValues({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  };

  if (loading) {
    return (
      <div className="rounded border border-border bg-muted/20 p-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading configuration...
      </div>
    );
  }

  if (configs.length === 0) {
    return (
      <div className="rounded border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground">
        <p>No local configurations available for this server.</p>
        <p className="mt-1 text-[10px]">
          This server requires a local stdio setup. Check the{" "}
          <a
            href={entry.docsUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            documentation
          </a>{" "}
          for manual setup instructions.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-muted/20 p-3 space-y-2.5">
      <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
        <Terminal className="w-3.5 h-3.5" />
        Environment Variables
      </p>

      {configs.length > 1 && (
        <div>
          <Label className="text-[10px] text-muted-foreground mb-1 block">
            Configuration
          </Label>
          <Select
            value={selectedConfigId ?? ""}
            onValueChange={(v) => {
              setSelectedConfigId(v);
              setEnvValues({});
            }}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {configs.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  {c.label}
                  {c.isDefault && " (default)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectedConfig && (
        <>
          {selectedConfig.notes && (
            <p className="text-[10px] text-muted-foreground leading-relaxed bg-muted/40 rounded px-2 py-1.5">
              {selectedConfig.notes}
            </p>
          )}

          <div className="space-y-2">
            {envSchema.map((field) => (
              <div key={field.key}>
                <Label className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                  <code className="bg-muted/60 px-1 py-0.5 rounded font-mono">
                    {field.key}
                  </code>
                  {field.required && (
                    <span className="text-destructive">*</span>
                  )}
                  {field.label !== field.key && (
                    <span className="text-muted-foreground/70 ml-1">
                      {field.label}
                    </span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    type={
                      field.secret && !showSecrets[field.key]
                        ? "password"
                        : "text"
                    }
                    value={envValues[field.key] ?? ""}
                    onChange={(e) =>
                      setEnvValues((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    placeholder={field.placeholder ?? field.helpText ?? ""}
                    className={`h-7 text-xs font-mono ${field.secret ? "pr-9" : ""}`}
                    style={{ fontSize: "16px" }}
                  />
                  {field.secret && (
                    <button
                      type="button"
                      onClick={() =>
                        setShowSecrets((prev) => ({
                          ...prev,
                          [field.key]: !prev[field.key],
                        }))
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showSecrets[field.key] ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
                {field.helpText && (
                  <p className="text-[9px] text-muted-foreground/70 mt-0.5">
                    {field.helpText}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {error && (
        <p className="text-[10px] text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {error}
        </p>
      )}

      <Button
        size="sm"
        className="h-7 text-[11px] gap-1.5 w-full"
        disabled={isSaving}
        onClick={handleSubmit}
      >
        {isSaving ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Save className="w-3 h-3" />
        )}
        {isSaving ? "Saving..." : "Save & Connect"}
      </Button>
    </div>
  );
}

// =============================================================================
// MCP Catalog Picker — overlay to browse and add servers
// =============================================================================

function McpCatalogPicker({
  catalog,
  catalogStatus,
  catalogError,
  agentServerSet,
  connectingServerId,
  onAdd,
  onBack,
  onConnect,
  onDisconnect,
}: {
  catalog: McpCatalogEntry[];
  catalogStatus: string;
  catalogError: string | null;
  agentServerSet: Set<string>;
  connectingServerId: string | null;
  onAdd: (serverId: string) => void;
  onBack: () => void;
  onConnect: (entry: McpCatalogEntry) => void;
  onDisconnect: (serverId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const filtered = useMemo(() => {
    let list: McpCatalogEntry[] = catalog;
    if (activeCategory !== "all") {
      list = list.filter((e) => e.category === activeCategory);
    }
    if (search.trim()) {
      list = filterAndSortBySearch(list, search, [
        { get: (e) => e.name, weight: "title" },
        { get: (e) => e.vendor, weight: "subtitle" },
        { get: (e) => e.description, weight: "body" },
      ]);
    }
    return list;
  }, [catalog, activeCategory, search]);

  const featured = useMemo(
    () => filtered.filter((e) => e.isFeatured),
    [filtered],
  );
  const rest = useMemo(() => filtered.filter((e) => !e.isFeatured), [filtered]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of catalog) {
      map.set(entry.category, (map.get(entry.category) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort(
      ([a], [b]) =>
        (MCP_CATEGORY_META[a as keyof typeof MCP_CATEGORY_META]?.order ?? 99) -
        (MCP_CATEGORY_META[b as keyof typeof MCP_CATEGORY_META]?.order ?? 99),
    );
  }, [catalog]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 py-3 border-b border-border shrink-0 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">MCP Catalog</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {catalog.length} servers available
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onBack}
        >
          <X className="w-3 h-3 mr-1" />
          Close
        </Button>
      </div>

      {catalogError && (
        <div className="mx-4 mt-3 p-2.5 rounded border border-destructive/30 bg-destructive/5 text-[11px] text-destructive flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {catalogError}
        </div>
      )}

      {/* Category tabs + search */}
      <div className="px-4 py-2 border-b border-border shrink-0 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search servers..."
            className="pl-8 h-7 text-xs"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setActiveCategory("all")}
            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              activeCategory === "all"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            All ({catalog.length})
          </button>
          {categories.map(([cat, count]) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {MCP_CATEGORY_META[cat as keyof typeof MCP_CATEGORY_META]
                ?.label ?? cat}{" "}
              ({count})
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {catalogStatus === "loading" && catalog.length === 0 && (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-xs">
            Loading catalog...
          </div>
        )}

        {featured.length > 0 && (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 px-1">
              Featured
            </p>
            {featured.map((entry) => (
              <McpCatalogCard
                key={entry.serverId}
                entry={entry}
                isOnAgent={agentServerSet.has(entry.serverId)}
                connectingServerId={connectingServerId}
                onAdd={() => onAdd(entry.serverId)}
                onConnect={() => onConnect(entry)}
                onDisconnect={() => onDisconnect(entry.serverId)}
              />
            ))}
            {rest.length > 0 && <div className="h-px bg-border mx-1 my-3" />}
          </>
        )}

        {rest.map((entry) => (
          <McpCatalogCard
            key={entry.serverId}
            entry={entry}
            isOnAgent={agentServerSet.has(entry.serverId)}
            connectingServerId={connectingServerId}
            onAdd={() => onAdd(entry.serverId)}
            onConnect={() => onConnect(entry)}
            onDisconnect={() => onDisconnect(entry.serverId)}
          />
        ))}

        {filtered.length === 0 && catalogStatus !== "loading" && (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <Search className="w-5 h-5 opacity-40" />
            <p className="text-xs">No servers match your search.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MCP Catalog Card — a server in the catalog picker
// =============================================================================

function McpCatalogCard({
  entry,
  isOnAgent,
  connectingServerId,
  onAdd,
  onConnect,
  onDisconnect,
}: {
  entry: McpCatalogEntry;
  isOnAgent: boolean;
  connectingServerId: string | null;
  onAdd: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const badge = connectionBadge(entry.connectionStatus);
  const isConnecting = connectingServerId === entry.serverId;
  const isComingSoon = entry.serverStatus === "coming_soon";
  const noEndpoint = !entry.endpointUrl;
  const isUnavailable = isComingSoon || noEndpoint;
  const needsAuth =
    entry.authStrategy !== "none" &&
    entry.connectionStatus !== "connected" &&
    !isUnavailable;

  return (
    <div
      className={`rounded-lg border transition-all px-3 py-2.5 ${
        isUnavailable
          ? "bg-muted/20 border-border opacity-70"
          : isOnAgent
            ? "bg-primary/5 border-primary/20"
            : "bg-card border-border hover:border-primary/20"
      }`}
    >
      <div className="flex items-start gap-3">
        {entry.iconUrl ? (
          <img
            src={entry.iconUrl}
            alt=""
            className={`w-7 h-7 rounded mt-0.5 shrink-0 object-contain ${isUnavailable ? "grayscale" : ""}`}
          />
        ) : (
          <div
            className="w-7 h-7 rounded mt-0.5 shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
            style={{ backgroundColor: entry.color ?? "#6b7280" }}
          >
            {entry.name.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-xs font-semibold text-foreground">
              {entry.name}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {entry.vendor}
            </span>
            {entry.isOfficial && (
              <Badge variant="secondary" className="text-[9px] h-4 px-1">
                Official
              </Badge>
            )}
            {isComingSoon && (
              <Badge
                variant="outline"
                className="text-[9px] h-4 px-1.5 border bg-muted/40 text-muted-foreground"
              >
                Coming Soon
              </Badge>
            )}
            {isOnAgent && (
              <Badge
                variant="outline"
                className="text-[9px] h-4 px-1.5 border-primary/30 text-primary"
              >
                <Check className="w-2.5 h-2.5 mr-0.5" />
                On Agent
              </Badge>
            )}
          </div>
          {entry.description && (
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              {entry.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
            <span className={TRANSPORT_META[entry.transport]?.color ?? ""}>
              {TRANSPORT_META[entry.transport]?.label ?? entry.transport}
            </span>
            <span>·</span>
            <span>{authStrategyLabel(entry.authStrategy)}</span>
            <span>·</span>
            <span>
              {MCP_CATEGORY_META[entry.category]?.label ?? entry.category}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Connection status badge — fixed width so all rows align */}
          <div className="w-24 flex justify-end">
            {isComingSoon ? null : isUnavailable ? null : (
              <Badge
                variant="outline"
                className={`text-[9px] h-5 px-1.5 border whitespace-nowrap ${badge.cls}`}
              >
                {badge.label}
              </Badge>
            )}
          </div>

          {/* Connect / Disconnect button — fixed width */}
          <div className="w-20 flex justify-end">
            {needsAuth && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2 w-full"
                disabled={isConnecting}
                onClick={onConnect}
              >
                <KeyRound className="w-3 h-3 mr-1" />
                {isConnecting ? "..." : "Connect"}
              </Button>
            )}
            {entry.connectionStatus === "connected" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2 w-full text-muted-foreground hover:text-destructive"
                onClick={onDisconnect}
              >
                Disconnect
              </Button>
            )}
          </div>

          {/* Add button — fixed width */}
          <div className="w-7 flex justify-end">
            {!isOnAgent && !isUnavailable && (
              <Button size="sm" className="h-6 w-6 p-0" onClick={onAdd}>
                <Plus className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Shared Sub-components
// =============================================================================

function ParameterTable({ schema }: { schema: CustomToolInputSchema }) {
  const requiredSet = new Set(schema.required ?? []);
  const entries = Object.entries(schema.properties);

  if (entries.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground italic">
        No parameters defined.
      </p>
    );
  }

  return (
    <div className="rounded border border-border overflow-hidden">
      <div className="grid grid-cols-[1fr_70px_2fr_50px] gap-2 px-2.5 py-1 bg-muted/50 border-b border-border">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Name
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Type
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Description
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Req
        </span>
      </div>
      {entries.map(([pName, pDef], idx) => (
        <div
          key={pName}
          className={`grid grid-cols-[1fr_70px_2fr_50px] gap-2 px-2.5 py-1.5 text-xs items-center ${
            idx < entries.length - 1 ? "border-b border-border" : ""
          } ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
        >
          <span className="font-mono text-foreground truncate">{pName}</span>
          <span className="text-muted-foreground">{pDef.type}</span>
          <span className="text-muted-foreground text-[11px] truncate">
            {pDef.description ?? "—"}
          </span>
          <span className="text-center">
            {requiredSet.has(pName) ? (
              <Check className="w-3 h-3 text-primary inline" />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function CategoryItem({
  label,
  count,
  enabledCount,
  active,
  onClick,
  icon,
  highlight,
  colorKey,
}: {
  label: string;
  count: number;
  enabledCount: number;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  highlight?: boolean;
  colorKey?: string;
}) {
  const colors = getCategoryColor(colorKey ?? label);
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-left transition-colors group ${
        active
          ? `${colors.bg} ${colors.text}`
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      {icon && (
        <span
          className={`shrink-0 ${active ? colors.text : "text-muted-foreground group-hover:text-foreground"}`}
        >
          {icon}
        </span>
      )}
      {!icon && colorKey && (
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${active ? colors.dot : "bg-border group-hover:bg-muted-foreground"}`}
        />
      )}
      <span
        className={`text-xs flex-1 truncate font-medium ${
          active ? colors.text : highlight ? "text-primary/70" : ""
        }`}
      >
        {label}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        {enabledCount > 0 && (
          <span
            className={`text-[10px] font-bold tabular-nums px-1 py-0.5 rounded ${
              active
                ? `${colors.bg} ${colors.text}`
                : "text-primary/80 bg-primary/10"
            }`}
          >
            {enabledCount}
          </span>
        )}
        {count !== enabledCount && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
        {active && (
          <ChevronRight
            className={`w-3 h-3 ml-0.5 opacity-60 shrink-0 ${colors.text}`}
          />
        )}
      </div>
    </button>
  );
}

function ToolCard({
  tool,
  active,
  expanded,
  onToggle,
  onExpand,
}: {
  tool: any;
  active: boolean;
  expanded: boolean;
  onToggle: (name: string) => void;
  onExpand: () => void;
}) {
  const hasDetails = tool.has_details ?? true;
  const colors = getCategoryColor(tool.category);

  return (
    <div
      className={`rounded-lg text-left transition-all border cursor-pointer select-none ${
        active
          ? `${colors.bg} ${colors.border}`
          : "border-transparent hover:bg-muted/40 hover:border-border"
      }`}
      onClick={() => onToggle(tool.id)}
    >
      <div className="flex items-start gap-3 w-full px-3 py-2.5">
        {/* Checkbox indicator */}
        <div className="mt-0.5 shrink-0">
          <div
            className={`flex items-center justify-center w-4 h-4 rounded border-[1.5px] transition-all ${
              active
                ? `${colors.dot} border-transparent text-white`
                : "border-border group-hover:border-primary/50"
            }`}
          >
            {active && <Check className="w-2.5 h-2.5 stroke-[3]" />}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            {/* Icon pill — colored by category */}
            {tool.icon && (
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded shrink-0 ${colors.bg} ${colors.text} border ${colors.border}`}
              >
                {typeof tool.icon === "string" ? (
                  <DynamicIcon name={tool.icon} className="w-3 h-3" />
                ) : (
                  tool.icon
                )}
              </span>
            )}
            <span
              className={`text-xs font-semibold leading-tight ${
                active ? colors.text : "text-foreground"
              }`}
            >
              {tool.name}
            </span>
            {tool.tags && tool.tags.length > 0 && (
              <div className="flex items-center gap-1">
                {tool.tags.slice(0, 2).map((tag: string) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className={`text-[9px] h-4 px-1 ${active ? `${colors.border} ${colors.text}` : ""}`}
                  >
                    {tag}
                  </Badge>
                ))}
                {tool.tags.length > 2 && (
                  <span className="text-[9px] text-muted-foreground">
                    +{tool.tags.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>
          {tool.description && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {tool.description}
            </p>
          )}
        </div>

        {/* Expand button — stop propagation so it doesn't toggle the tool */}
        {hasDetails && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
            className={`mt-0.5 transition-colors shrink-0 ${
              expanded
                ? `${colors.text}`
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="View details"
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <Info className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Expanded details */}
      {expanded && hasDetails && <ToolDetailPanel toolId={tool.id} />}
    </div>
  );
}

function ToolDetailPanel({ toolId }: { toolId: string }) {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const supabase = createClient();
    supabase
      // get_tool_detail signature changed in the 2026 refactor: now takes
      // (p_name_or_id text), accepting either a UUID or a tool name.
      .rpc("get_tool_detail", { p_name_or_id: toolId })
      .then(({ data, error }) => {
        if (active && data) {
          setDetail(data);
        }
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [toolId]);

  if (loading) {
    return (
      <div className="px-3 pb-3 border-t border-border/50 pt-3 text-xs text-muted-foreground flex items-center">
        <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Fetching
        details...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="px-3 pb-3 border-t border-border/50 pt-3 text-xs text-muted-foreground flex items-center">
        <AlertTriangle className="w-3.5 h-3.5 mr-2 text-yellow-500" /> Details
        unavailable.
      </div>
    );
  }

  const tool = detail;
  const params = tool.parameters as {
    type?: string;
    properties?: Record<
      string,
      {
        type: string;
        description?: string;
        enum?: unknown[];
        [k: string]: unknown;
      }
    >;
    required?: string[];
  } | null;

  const hasParams =
    params && params.properties && Object.keys(params.properties).length > 0;

  const handleCopyJson = () => {
    const json = JSON.stringify(
      {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        output_schema: tool.output_schema,
      },
      null,
      2,
    );
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const hasMeta = tool.source_kind || tool.version;

  return (
    <div className="px-3 pb-3 border-t border-border/50 pt-2 space-y-3">
      {/* Parameters */}
      {hasParams && params.properties && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Parameters
          </p>
          <ParameterTable
            schema={{
              type: "object" as const,
              properties: params.properties,
              required: params.required,
            }}
          />
        </div>
      )}

      {/* Output schema */}
      {tool.output_schema && typeof tool.output_schema === "object" && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Output Schema
          </p>
          <pre className="text-[10px] font-mono bg-muted/30 rounded p-2 overflow-x-auto text-muted-foreground whitespace-pre-wrap break-all max-h-40 overflow-y-auto w-full max-w-[calc(100vw-300px)]">
            {JSON.stringify(tool.output_schema, null, 2)}
          </pre>
        </div>
      )}

      {/* Metadata */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        {tool.source_kind && (
          <span className="flex items-center gap-1">
            <FileCode2 className="w-3 h-3" />
            <code className="bg-muted/40 px-1 py-0.5 rounded">
              {tool.source_kind}
            </code>
          </span>
        )}
        {tool.version && (
          <span className="flex items-center gap-1">
            <Tag className="w-3 h-3" />v{tool.version}
          </span>
        )}
        <button
          onClick={handleCopyJson}
          className="flex items-center gap-1 hover:text-foreground transition-colors ml-auto border rounded bg-background px-1.5 py-0.5 shadow-sm"
        >
          <Copy className="w-3 h-3" />
          {copied ? "Copied!" : "Copy JSON"}
        </button>
      </div>
    </div>
  );
}
