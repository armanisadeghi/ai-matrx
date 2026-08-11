"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  MousePointerClick,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import { idMatchesQuery } from "@/utils/search-scoring";
import { getPlacementTypeMeta } from "../constants";
import { useShortcutDirectory } from "../hooks/useShortcutDirectory";
import type {
  ShortcutDirectoryGroupBy,
  ShortcutDirectoryMode,
  ShortcutDirectoryRow,
} from "../utils/shortcut-directory-rows";
import {
  getGroupKey,
  resolveAgentUrl,
  isShortcutUuid,
  resolveShortcutDirectUrl,
  resolveShortcutEditUrl,
  scopeTypeLabel,
} from "../utils/shortcut-directory-rows";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem, csvExportItem } from "@/components/agent-copy/export";
import {
  buildShortcutDirectoryBriefs,
  shortcutDirectoryRowSummary,
} from "../format";
import { cn } from "@/lib/utils";
import {
  MOBILE_TABLE,
} from "@/components/official/mobile-table/mobileTable";

type SortField =
  "label" | "agent" | "scope" | "category" | "placement" | "surface" | "status";

type SortDirection = "asc" | "desc";

const SortIcon = ({
  field,
  activeField,
  direction,
}: {
  field: SortField;
  activeField: SortField;
  direction: SortDirection;
}) => {
  if (activeField !== field) return null;
  return direction === "asc" ? (
    <ChevronUp className="h-3 w-3 inline ml-1" />
  ) : (
    <ChevronDown className="h-3 w-3 inline ml-1" />
  );
};

export interface ShortcutDirectoryProps {
  mode: ShortcutDirectoryMode;
  title?: string;
  manageHref?: string;
  manageLabel?: string;
  /** (core) route consumers render title + primary actions in the shell PageHeader instead — set true to suppress this component's own title/action row. */
  hideTitleBar?: boolean;
}

export function ShortcutDirectory({
  mode,
  title = "All Shortcuts",
  manageHref,
  manageLabel,
  hideTitleBar = false,
}: ShortcutDirectoryProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { toast } = useToast();
  const { rows, isLoading, error, refetch } = useShortcutDirectory({ mode });

  const [searchQuery, setSearchQuery] = useState("");
  const [idLookup, setIdLookup] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [surfaceFilter, setSurfaceFilter] = useState<string>("all");
  const [placementFilter, setPlacementFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [groupBy, setGroupBy] = useState<ShortcutDirectoryGroupBy>("none");
  const [sortField, setSortField] = useState<SortField>("label");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scopeOptions = useMemo(() => {
    const values = new Set<string>();
    rows.forEach((row) => values.add(row.scopeType));
    return Array.from(values).sort();
  }, [rows]);

  const agentOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row) => {
      if (!row.agentId) return;
      map.set(row.agentId, row.agentName ?? row.agentId);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const surfaceOptions = useMemo(() => {
    const values = new Set<string>();
    rows.forEach((row) => {
      if (row.surfaceName) values.add(row.surfaceName);
    });
    return Array.from(values).sort();
  }, [rows]);

  const placementOptions = useMemo(() => {
    const values = new Set<string>();
    rows.forEach((row) => {
      if (row.placementType) values.add(row.placementType);
    });
    return Array.from(values).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let out = [...rows];
    const q = searchQuery.trim().toLowerCase();

    if (q) {
      out = out.filter(
        (row) =>
          row.label.toLowerCase().includes(q) ||
          (row.description ?? "").toLowerCase().includes(q) ||
          (row.agentName ?? "").toLowerCase().includes(q) ||
          row.categoryLabel.toLowerCase().includes(q) ||
          (row.surfaceName ?? "").toLowerCase().includes(q) ||
          idMatchesQuery(row, q),
      );
    }

    if (scopeFilter !== "all") {
      out = out.filter((row) => row.scopeType === scopeFilter);
    }
    if (agentFilter !== "all") {
      out = out.filter((row) => row.agentId === agentFilter);
    }
    if (surfaceFilter !== "all") {
      out = out.filter((row) => row.surfaceName === surfaceFilter);
    }
    if (placementFilter !== "all") {
      out = out.filter((row) => row.placementType === placementFilter);
    }
    if (activeFilter === "active") {
      out = out.filter((row) => row.isActive);
    } else if (activeFilter === "inactive") {
      out = out.filter((row) => !row.isActive);
    }

    out.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      switch (sortField) {
        case "label":
          aVal = a.label.toLowerCase();
          bVal = b.label.toLowerCase();
          break;
        case "agent":
          aVal = (a.agentName ?? a.agentId ?? "").toLowerCase();
          bVal = (b.agentName ?? b.agentId ?? "").toLowerCase();
          break;
        case "scope":
          aVal = `${a.scopeType} ${a.scopeName}`.toLowerCase();
          bVal = `${b.scopeType} ${b.scopeName}`.toLowerCase();
          break;
        case "category":
          aVal = a.categoryLabel.toLowerCase();
          bVal = b.categoryLabel.toLowerCase();
          break;
        case "placement":
          aVal = a.placementType ?? "";
          bVal = b.placementType ?? "";
          break;
        case "surface":
          aVal = a.surfaceName ?? "";
          bVal = b.surfaceName ?? "";
          break;
        case "status":
          aVal = a.isActive ? 1 : 0;
          bVal = b.isActive ? 1 : 0;
          break;
      }
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return out;
  }, [
    activeFilter,
    agentFilter,
    placementFilter,
    rows,
    scopeFilter,
    searchQuery,
    sortDirection,
    sortField,
    surfaceFilter,
  ]);

  const grouped = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "", rows: filtered }];
    }
    const map = new Map<string, ShortcutDirectoryRow[]>();
    for (const row of filtered) {
      const key = getGroupKey(row, groupBy);
      const bucket = map.get(key) ?? [];
      bucket.push(row);
      map.set(key, bucket);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, groupRows]) => ({ key, rows: groupRows }));
  }, [filtered, groupBy]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((row) => row.isActive).length,
      withAgent: rows.filter((row) => row.agentId).length,
    }),
    [rows],
  );

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    scopeFilter !== "all" ||
    agentFilter !== "all" ||
    surfaceFilter !== "all" ||
    placementFilter !== "all" ||
    activeFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setScopeFilter("all");
    setAgentFilter("all");
    setSurfaceFilter("all");
    setPlacementFilter("all");
    setActiveFilter("all");
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const navigateToShortcut = (row: ShortcutDirectoryRow) => {
    startTransition(() => {
      router.push(resolveShortcutEditUrl(row, mode));
    });
  };

  const handleIdLookup = () => {
    const trimmed = idLookup.trim();
    if (!trimmed) return;
    if (!isShortcutUuid(trimmed)) {
      toast({
        title: "Invalid ID",
        description: "Enter a valid shortcut UUID.",
        variant: "destructive",
      });
      return;
    }
    startTransition(() => {
      router.push(resolveShortcutDirectUrl(trimmed, mode));
    });
  };

  const handleCopyId = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      toast({ title: "Copied", description: "Shortcut ID copied" });
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      toast({
        title: "Copy failed",
        description: "Unable to copy ID",
        variant: "destructive",
      });
    }
  };

  const renderRow = (row: ShortcutDirectoryRow) => (
    <TableRow
      key={row.id}
      className="group/x cursor-pointer bg-card sm:bg-transparent sm:hover:bg-muted/50"
      onClick={() => navigateToShortcut(row)}
    >
      <TableCell
        className="max-sm:sticky max-sm:left-0 max-sm:z-10 max-sm:bg-inherit max-sm:whitespace-nowrap"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 gap-2 font-mono text-xs hover:bg-accent w-full justify-start"
                onClick={(e) => handleCopyId(row.id, e)}
              >
                {copiedId === row.id ? (
                  <Check className="h-3 w-3 text-success flex-shrink-0" />
                ) : (
                  <Copy className="h-3 w-3 flex-shrink-0" />
                )}
                <span className="truncate">{row.id}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy ID</TooltipContent>
          </Tooltip>
          <CopyButtons
            size="xs"
            label={row.label}
            className="opacity-0 group-hover/x:opacity-100 focus-within:opacity-100 shrink-0"
            human={() => shortcutDirectoryRowSummary(row)}
            json={() => row}
            agent={() => ({
              kind: "agent-shortcut",
              location:
                "AI Matrx Admin — System Agents · Shortcuts directory (/administration/agents/system-agents/shortcuts/all)",
              description: "A single agent shortcut directory row.",
              data: row,
              summary: shortcutDirectoryRowSummary(row),
              attributes: { id: row.id, scope: row.scopeType },
            })}
          />
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 min-w-0">
          <MousePointerClick className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="font-medium truncate">{row.label}</div>
            {row.description && (
              <div className="text-xs text-muted-foreground truncate">
                {row.description}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        {/* This column printed `agentName ?? agentId` — so a shortcut whose
            agent name had not resolved rendered a bare UUID you could not
            click, the Door Law's named worst case. `EntityRef` opens the
            agent, offers the new tab and the peek, and falls back to a
            truncated id rather than a full one when the name is missing. */}
        {row.agentId ? (
          <EntityRef
            token="agent"
            id={row.agentId}
            name={row.agentName ?? row.agentId}
            href={resolveAgentUrl(row.agentId, mode)}
            showIcon={false}
            className="max-w-[180px] text-sm"
          />
        ) : row.agentName ? (
          <span className="text-sm truncate block max-w-[180px]">
            {row.agentName}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="space-y-0.5">
          <Badge variant="outline" className="text-xs">
            {scopeTypeLabel(row.scopeType)}
          </Badge>
          <div className="text-xs text-muted-foreground truncate max-w-[160px]">
            {row.scopeName}
          </div>
        </div>
      </TableCell>
      <TableCell>
        {row.placementType ? (
          <Badge variant="outline">
            {getPlacementTypeMeta(row.placementType).label}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <span className="text-sm">{row.categoryLabel}</span>
      </TableCell>
      <TableCell>
        {row.surfaceName ? (
          <span className="text-xs truncate block max-w-[160px]">
            {row.surfaceName}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">All</span>
        )}
      </TableCell>
      <TableCell className="text-center">
        <Badge variant={row.isActive ? "default" : "secondary"}>
          {row.isActive ? "Active" : "Inactive"}
        </Badge>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Link
          href={resolveShortcutEditUrl(row, mode)}
          onClick={(e) => e.stopPropagation()}
        >
          <Button variant="outline" size="sm">
            <ExternalLink className="h-3 w-3" />
          </Button>
        </Link>
      </TableCell>
    </TableRow>
  );

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-shrink-0 p-4 border-b border-border bg-card space-y-3">
          {!hideTitleBar && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">{title}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Browse every shortcut you can access. Paste a UUID to jump
                  directly.
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {manageHref && manageLabel && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={manageHref}>{manageLabel}</Link>
                  </Button>
                )}
                {hasActiveFilters && (
                  <Button onClick={clearFilters} variant="outline" size="sm">
                    <X className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                )}
                {filtered.length > 0 && (
                  <>
                    <CopyButtons
                      size="icon"
                      label="All shortcuts"
                      human={() =>
                        filtered.map(shortcutDirectoryRowSummary).join("\n")
                      }
                      json={() => filtered}
                      agent={() => ({
                        kind: "agent-shortcuts",
                        location:
                          "AI Matrx Admin — System Agents · Shortcuts directory (/administration/agents/system-agents/shortcuts/all)",
                        description:
                          "All agent shortcuts currently matching the directory's filters.",
                        data: filtered,
                        attributes: { count: filtered.length },
                        context: {
                          groupBy,
                          search: searchQuery || undefined,
                          scopeFilter,
                          agentFilter,
                          surfaceFilter,
                          placementFilter,
                          activeFilter,
                        },
                      })}
                      aiVariants={[
                        {
                          id: "briefs",
                          label: "Briefs",
                          hint: "id, label, scope, agent, active — no metadata",
                          build: () => ({
                            kind: "agent-shortcuts-briefs",
                            location:
                              "AI Matrx Admin — System Agents · Shortcuts directory (/administration/agents/system-agents/shortcuts/all)",
                            description:
                              "Compact brief projection of all filtered shortcuts.",
                            data: buildShortcutDirectoryBriefs(filtered),
                            attributes: { count: filtered.length },
                          }),
                        },
                      ]}
                    />
                    <ExportMenu
                      label="agent-shortcuts-directory"
                      items={[
                        jsonExportItem(() => filtered),
                        csvExportItem(
                          () =>
                            filtered as unknown as Array<
                              Record<string, unknown>
                            >,
                          "CSV",
                        ),
                      ]}
                    />
                  </>
                )}
                <Button
                  onClick={() => void refetch()}
                  variant="outline"
                  size="sm"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </div>
          )}
          {hideTitleBar && hasActiveFilters && (
            <div className="flex justify-end">
              <Button onClick={clearFilters} variant="outline" size="sm">
                <X className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 max-w-xl">
            <Card>
              <CardContent className="p-2">
                <div className="text-xl font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-xl font-bold text-primary">
                  {stats.active}
                </div>
                <div className="text-xs text-muted-foreground">Active</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-xl font-bold text-success">
                  {stats.withAgent}
                </div>
                <div className="text-xs text-muted-foreground">
                  Agent-linked
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative max-w-md flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search label, agent, category, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-[16px]"
              />
            </div>

            <div className="flex items-center gap-2 min-w-[320px]">
              <Input
                placeholder="Paste shortcut UUID..."
                value={idLookup}
                onChange={(e) => setIdLookup(e.target.value)}
                className="text-[16px] font-mono text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleIdLookup();
                }}
              />
              <Button size="sm" onClick={handleIdLookup}>
                Go
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <Select
              value={groupBy}
              onValueChange={(v) => setGroupBy(v as ShortcutDirectoryGroupBy)}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Group by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No grouping</SelectItem>
                <SelectItem value="agent">Group by agent</SelectItem>
                <SelectItem value="scope">Group by scope</SelectItem>
                <SelectItem value="surface">Group by surface</SelectItem>
                <SelectItem value="category">Group by category</SelectItem>
                <SelectItem value="placement">Group by placement</SelectItem>
              </SelectContent>
            </Select>

            <Select value={scopeFilter} onValueChange={setScopeFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All scopes</SelectItem>
                {scopeOptions.map((scope) => (
                  <SelectItem key={scope} value={scope}>
                    {scopeTypeLabel(scope)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agentOptions.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={surfaceFilter} onValueChange={setSurfaceFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Surface" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All surfaces</SelectItem>
                {surfaceOptions.map((surface) => (
                  <SelectItem key={surface} value={surface}>
                    {surface}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={placementFilter} onValueChange={setPlacementFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Placement" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All placements</SelectItem>
                {placementOptions.map((placement) => (
                  <SelectItem key={placement} value={placement}>
                    {getPlacementTypeMeta(placement).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={activeFilter}
              onValueChange={(value) =>
                setActiveFilter(value as typeof activeFilter)
              }
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="inactive">Inactive only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex-1 overflow-hidden">
          {/* A plain overflow-auto div, NOT Radix ScrollArea: ScrollArea's
              Viewport wraps children in a `display:table` measuring div that
              lets w-full/max-width:100% resolve against the auto-expanded
              content width instead of the visible viewport, so the visible
              clipping+scrolling happens on Radix's own internal container
              instead of the <table> — which breaks `position: sticky` on the
              frozen first column (its nearest scrolling ancestor per CSS is
              the <table> itself, which then never actually scrolls). A native
              overflow-auto div avoids that indirection, matching the
              MatrxDataTable reference pattern. */}
          <div className="h-full overflow-auto">
            {/* Mobile-first: below `sm` the table sizes to its CONTENT (w-max)
                so this container scrolls it horizontally, and the first
                column freezes so a row stays identifiable while scrolling.
                `sm:` restores the exact desktop rendering. */}
            <Table className={MOBILE_TABLE}>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[260px] max-sm:sticky max-sm:left-0 max-sm:z-20 max-sm:bg-background max-sm:whitespace-nowrap">ID</TableHead>
                  <TableHead
                    className="min-w-[200px] max-sm:whitespace-nowrap"
                    onClick={() => handleSort("label")}
                  >
                    <div className="flex items-center gap-1 cursor-pointer hover:text-primary">
                      Label
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon
                        field="label"
                        activeField={sortField}
                        direction={sortDirection}
                      />
                    </div>
                  </TableHead>
                  <TableHead
                    className="min-w-[140px] max-sm:whitespace-nowrap"
                    onClick={() => handleSort("agent")}
                  >
                    <div className="flex items-center gap-1 cursor-pointer hover:text-primary">
                      Agent
                      <SortIcon
                        field="agent"
                        activeField={sortField}
                        direction={sortDirection}
                      />
                    </div>
                  </TableHead>
                  <TableHead
                    className="min-w-[140px] max-sm:whitespace-nowrap"
                    onClick={() => handleSort("scope")}
                  >
                    <div className="flex items-center gap-1 cursor-pointer hover:text-primary">
                      Scope
                      <SortIcon
                        field="scope"
                        activeField={sortField}
                        direction={sortDirection}
                      />
                    </div>
                  </TableHead>
                  <TableHead
                    className="min-w-[120px] max-sm:whitespace-nowrap"
                    onClick={() => handleSort("placement")}
                  >
                    <div className="flex items-center gap-1 cursor-pointer hover:text-primary">
                      Placement
                      <SortIcon
                        field="placement"
                        activeField={sortField}
                        direction={sortDirection}
                      />
                    </div>
                  </TableHead>
                  <TableHead
                    className="min-w-[120px] max-sm:whitespace-nowrap"
                    onClick={() => handleSort("category")}
                  >
                    <div className="flex items-center gap-1 cursor-pointer hover:text-primary">
                      Category
                      <SortIcon
                        field="category"
                        activeField={sortField}
                        direction={sortDirection}
                      />
                    </div>
                  </TableHead>
                  <TableHead
                    className="min-w-[120px] max-sm:whitespace-nowrap"
                    onClick={() => handleSort("surface")}
                  >
                    <div className="flex items-center gap-1 cursor-pointer hover:text-primary">
                      Surface
                      <SortIcon
                        field="surface"
                        activeField={sortField}
                        direction={sortDirection}
                      />
                    </div>
                  </TableHead>
                  <TableHead
                    className="w-[100px] text-center"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-1 cursor-pointer hover:text-primary justify-center">
                      Status
                      <SortIcon
                        field="status"
                        activeField={sortField}
                        direction={sortDirection}
                      />
                    </div>
                  </TableHead>
                  <TableHead className="w-[80px]">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map((group) => (
                  <React.Fragment key={group.key || "flat"}>
                    {groupBy !== "none" && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={9}>
                          <div className="flex items-center font-semibold text-sm">
                            {/* Grouping by agent made every header a raw
                                unclickable UUID in admin mode (admin rows all
                                carry `agentName: null`) — the very defect the
                                cell below was just fixed for. */}
                            {groupBy === "agent" && group.rows[0]?.agentId ? (
                              <EntityRef
                                token="agent"
                                id={group.rows[0].agentId}
                                name={group.key}
                                href={resolveAgentUrl(
                                  group.rows[0].agentId,
                                  mode,
                                )}
                                showIcon={false}
                                className="font-semibold"
                              />
                            ) : (
                              group.key
                            )}
                            <Badge variant="secondary" className="ml-2">
                              {group.rows.length}
                            </Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {group.rows.map(renderRow)}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>

            {!isLoading && filtered.length === 0 && (
              <div className="text-center py-12">
                <MousePointerClick className="h-12 w-12 mx-auto text-muted-foreground mb-3 opacity-50" />
                <p className="text-muted-foreground">No shortcuts found</p>
              </div>
            )}
            {isLoading && filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                Loading shortcuts...
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
