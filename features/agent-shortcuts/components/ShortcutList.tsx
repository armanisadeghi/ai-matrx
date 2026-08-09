"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Edit2,
  Eye,
  EyeOff,
  Globe,
  Plus,
  RefreshCw,
  MousePointerClick,
  X,
  Zap,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/components/ui/use-toast";
import { useAgentShortcuts } from "../hooks/useAgentShortcuts";
import { useAgentShortcutCrud } from "../hooks/useAgentShortcutCrud";
import { getPlacementTypeMeta } from "../constants";
import type {
  AgentShortcutCategory,
  AgentShortcutRecord,
  ScopeProps,
} from "../types";
import { isValidShortcutContext } from "@/features/agents/utils/shortcut-context-utils";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem, csvExportItem } from "@/components/agent-copy/export";
import { agentShortcutRecordSummary } from "../format";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";

type SortField =
  | "label"
  | "category"
  | "placement"
  | "status"
  | "display"
  | "autoRun"
  | "allowChat";

type SortDirection = "asc" | "desc";

export interface ShortcutListProps extends ScopeProps {
  onEdit?: (shortcut: AgentShortcutRecord) => void;
  onCreate?: () => void;
  onDuplicate?: (shortcut: AgentShortcutRecord) => void;
  onPromoteToGlobal?: (shortcut: AgentShortcutRecord) => void;
  className?: string;
  readonly?: boolean;
  placementFilter?: string;
  toolbarSlot?: React.ReactNode;
  /** (core) route consumers render title + primary actions in the shell PageHeader instead — set true to suppress this component's own title/action row. */
  hideTitleBar?: boolean;
  /**
   * Where this row's doors go — **the same place clicking the row goes.**
   *
   * 🚨 THE DESTINATION IS SURFACE-DISCRIMINATED, SO THE ID ALONE CANNOT PICK
   * IT. One `agent.shortcut` row is edited at `/agents/shortcuts/edit/<id>`,
   * `/organizations/<orgId>/shortcuts/edit/<id>`, or
   * `/administration/agents/system-agents/edit/<id>` depending on which
   * console you are standing in. That is why it cannot come from the entity
   * registry's `hrefFor`, whose only argument is an id.
   *
   * **This takes the URL, not a mode.** A two-value `"user" | "admin"` enum was
   * tried first and shipped a wrong door: the org console had no third value to
   * pass, so `"user"` sent org shortcuts into the PERSONAL editor — where 2 live
   * rows (org-scoped, no agent) hard dead-end on "this shortcut doesn't exist in
   * your personal shortcuts", and the other 28 opened an editor whose back
   * button leaves the org entirely. An enum that cannot express a caller's
   * answer makes the wrong answer the only available one.
   *
   * Pass the SAME url the row's `onEdit` navigates to, so the door and the click
   * can never disagree about which surface owns the record. Omit it and the
   * row's link doors are withheld (a registered peek still renders, minus its
   * Open) — a missing door is a gap, a wrong one is a bug.
   */
  doorHrefFor?: (shortcut: AgentShortcutRecord) => string | null;
}

export function ShortcutList({
  scope,
  scopeId,
  onEdit,
  onCreate,
  onDuplicate,
  onPromoteToGlobal,
  className,
  readonly = false,
  placementFilter: placementFilterProp,
  toolbarSlot,
  hideTitleBar = false,
  doorHrefFor,
}: ShortcutListProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { shortcuts, categories, isLoading, refetch } = useAgentShortcuts({
    scope,
    scopeId,
  });
  const crud = useAgentShortcutCrud({ scope, scopeId });

  const [sortField, setSortField] = useState<SortField>("label");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [placementFilter, setPlacementFilter] = useState<string>(
    placementFilterProp ?? "all",
  );
  const [activeFilter, setActiveFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  /** "all" | "unrestricted" | a specific tag from shortcuts' enabledFeatures */
  const [contextTagFilter, setContextTagFilter] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categoryById = useMemo(() => {
    const map = new Map<string, AgentShortcutCategory>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  const availablePlacements = useMemo(() => {
    const set = new Set<string>();
    shortcuts.forEach((s) => {
      const cat = categoryById.get(s.categoryId);
      if (cat?.placementType) set.add(cat.placementType);
    });
    return Array.from(set);
  }, [shortcuts, categoryById]);

  const uniqueContextTags = useMemo(() => {
    const set = new Set<string>();
    shortcuts.forEach((s) => {
      (s.enabledFeatures ?? []).forEach((t) => {
        if (isValidShortcutContext(t)) set.add(t);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [shortcuts]);

  const availableCategories = useMemo(() => {
    if (placementFilter !== "all") {
      return categories.filter(
        (c) =>
          c.placementType === placementFilter &&
          shortcuts.some((s) => s.categoryId === c.id),
      );
    }
    return categories.filter((c) =>
      shortcuts.some((s) => s.categoryId === c.id),
    );
  }, [categories, shortcuts, placementFilter]);

  const filtered = useMemo(() => {
    let out = [...shortcuts];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      out = out.filter(
        (s) =>
          s.label.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q) ||
          (s.keyboardShortcut ?? "").toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q),
      );
    }

    if (categoryFilter !== "all") {
      out = out.filter((s) => s.categoryId === categoryFilter);
    }

    if (placementFilter !== "all") {
      out = out.filter((s) => {
        const cat = categoryById.get(s.categoryId);
        return cat?.placementType === placementFilter;
      });
    }

    if (activeFilter === "active") {
      out = out.filter((s) => s.isActive);
    } else if (activeFilter === "inactive") {
      out = out.filter((s) => !s.isActive);
    }

    if (contextTagFilter === "unrestricted") {
      out = out.filter(
        (s) => !(s.enabledFeatures && s.enabledFeatures.length > 0),
      );
    } else if (
      contextTagFilter !== "all" &&
      isValidShortcutContext(contextTagFilter)
    ) {
      out = out.filter((s) =>
        (s.enabledFeatures ?? []).includes(contextTagFilter),
      );
    }

    out.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      switch (sortField) {
        case "label":
          aVal = a.label.toLowerCase();
          bVal = b.label.toLowerCase();
          break;
        case "category": {
          aVal = categoryById.get(a.categoryId)?.label ?? "";
          bVal = categoryById.get(b.categoryId)?.label ?? "";
          break;
        }
        case "placement": {
          aVal = categoryById.get(a.categoryId)?.placementType ?? "";
          bVal = categoryById.get(b.categoryId)?.placementType ?? "";
          break;
        }
        case "status":
          aVal = a.isActive ? 1 : 0;
          bVal = b.isActive ? 1 : 0;
          break;
        case "display":
          aVal = a.displayMode;
          bVal = b.displayMode;
          break;
        case "autoRun":
          aVal = a.autoRun ? 1 : 0;
          bVal = b.autoRun ? 1 : 0;
          break;
        case "allowChat":
          aVal = a.allowChat ? 1 : 0;
          bVal = b.allowChat ? 1 : 0;
          break;
      }
      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return out;
  }, [
    shortcuts,
    searchQuery,
    categoryFilter,
    placementFilter,
    activeFilter,
    sortField,
    sortDirection,
    categoryById,
    contextTagFilter,
  ]);

  const stats = useMemo(() => {
    const total = shortcuts.length;
    const active = shortcuts.filter((s) => s.isActive).length;
    const wiredToAgent = shortcuts.filter((s) => s.agentId).length;
    return { total, active, wiredToAgent, unwired: total - wiredToAgent };
  }, [shortcuts]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    categoryFilter !== "all" ||
    placementFilter !== "all" ||
    activeFilter !== "all" ||
    contextTagFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setPlacementFilter(placementFilterProp ?? "all");
    setActiveFilter("all");
    setContextTagFilter("all");
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleCopyId = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      toast({ title: "Copied", description: "ID copied to clipboard" });
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      toast({
        title: "Copy failed",
        description: "Unable to copy ID",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (shortcut: AgentShortcutRecord) => {
    try {
      await crud.updateShortcut(shortcut.id, { isActive: !shortcut.isActive });
      toast({
        title: shortcut.isActive ? "Deactivated" : "Activated",
        description: shortcut.label,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update status";
      toast({
        title: "Update failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="h-3 w-3 inline ml-1" />
    ) : (
      <ChevronDown className="h-3 w-3 inline ml-1" />
    );
  };

  if (isMobile) {
    return (
      <div className={`flex flex-col h-full ${className ?? ""}`}>
        <div className="flex flex-col gap-2 p-3 border-b border-border bg-card">
          {!hideTitleBar && (
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Shortcuts</h2>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                {filtered.length > 0 && (
                  <>
                    <CopyButtons
                      size="icon"
                      label="All shortcuts"
                      human={() =>
                        filtered
                          .map((s) =>
                            agentShortcutRecordSummary(
                              s,
                              categoryById.get(s.categoryId),
                            ),
                          )
                          .join("\n")
                      }
                      json={() => filtered}
                      agent={() => ({
                        kind: "agent-shortcuts",
                        location:
                          "AI Matrx Admin — System Agents · Shortcuts (/administration/agents/system-agents/shortcuts)",
                        description:
                          "All agent shortcuts currently matching this list's filters.",
                        data: filtered,
                        attributes: { count: filtered.length },
                        context: {
                          scope,
                          scopeId,
                          total: stats.total,
                          active: stats.active,
                          wiredToAgent: stats.wiredToAgent,
                        },
                      })}
                    />
                    <ExportMenu
                      label="agent-shortcuts"
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
                {toolbarSlot}
                {!readonly && onCreate && (
                  <Button size="sm" onClick={onCreate}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    New
                  </Button>
                )}
              </div>
            </div>
          )}
          <Input
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-[16px]"
          />
          <Select value={contextTagFilter} onValueChange={setContextTagFilter}>
            <SelectTrigger className="w-full text-[16px]">
              <SelectValue placeholder="Context filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All contexts</SelectItem>
              <SelectItem value="unrestricted">Unrestricted only</SelectItem>
              {uniqueContextTags.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  Tag: {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {isLoading && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Loading...
              </div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No shortcuts found
              </div>
            )}
            {filtered.map((shortcut) => {
              const cat = categoryById.get(shortcut.categoryId);
              return (
                <Card
                  key={shortcut.id}
                  className="cursor-pointer"
                  onClick={() => onEdit?.(shortcut)}
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <MousePointerClick className="h-4 w-4 text-primary mt-0.5" />
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">
                            {shortcut.label}
                          </div>
                          {shortcut.description && (
                            <div className="text-xs text-muted-foreground line-clamp-2">
                              {shortcut.description}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {/* THE DOOR LAW: the card's click means EDIT — which
                            NAVIGATES on the user and org consoles and opens a
                            form in place elsewhere — so the name cannot be the
                            anchor. The doors ride alongside, pointing at the
                            same URL the click uses (`doorHrefFor`), so the two
                            can never disagree about which console owns the
                            record.
                            Pinned visible: these cards carry no hover group, and
                            a door revealed by a hover that never comes does not
                            exist on touch. The controls stop propagation
                            internally, so they never trigger the card's edit. */}
                        <EntityDoorControls
                          token="agent_shortcut"
                          id={shortcut.id}
                          name={shortcut.label}
                          href={doorHrefFor?.(shortcut) ?? null}
                          alwaysShowActions
                        />
                        <Switch
                          checked={shortcut.isActive}
                          onCheckedChange={() =>
                            !readonly && handleToggleActive(shortcut)
                          }
                          onClick={(e) => e.stopPropagation()}
                          disabled={readonly}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {cat && (
                        <Badge variant="secondary" className="text-xs">
                          {cat.label}
                        </Badge>
                      )}
                      {cat?.placementType && (
                        <Badge variant="outline" className="text-xs">
                          {getPlacementTypeMeta(cat.placementType).label}
                        </Badge>
                      )}
                      {shortcut.autoRun && (
                        <Badge variant="outline" className="text-xs">
                          Auto
                        </Badge>
                      )}
                      {shortcut.keyboardShortcut && (
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {shortcut.keyboardShortcut}
                        </code>
                      )}
                      {shortcut.enabledFeatures &&
                        shortcut.enabledFeatures.length > 0 &&
                        shortcut.enabledFeatures.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-[10px]"
                          >
                            {tag}
                          </Badge>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={`flex flex-col h-full ${className ?? ""}`}>
        <div className="flex-shrink-0 p-4 border-b border-border bg-card space-y-3">
          {!hideTitleBar && (
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Shortcuts</h2>
              <div className="flex gap-2">
                {hasActiveFilters && (
                  <Button onClick={clearFilters} variant="outline" size="sm">
                    <X className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                )}
                <Button onClick={() => refetch()} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                {filtered.length > 0 && (
                  <>
                    <CopyButtons
                      size="icon"
                      label="All shortcuts"
                      human={() =>
                        filtered
                          .map((s) =>
                            agentShortcutRecordSummary(
                              s,
                              categoryById.get(s.categoryId),
                            ),
                          )
                          .join("\n")
                      }
                      json={() => filtered}
                      agent={() => ({
                        kind: "agent-shortcuts",
                        location:
                          "AI Matrx Admin — System Agents · Shortcuts (/administration/agents/system-agents/shortcuts)",
                        description:
                          "All agent shortcuts currently matching this list's filters.",
                        data: filtered,
                        attributes: { count: filtered.length },
                        context: {
                          scope,
                          scopeId,
                          total: stats.total,
                          active: stats.active,
                          wiredToAgent: stats.wiredToAgent,
                        },
                      })}
                    />
                    <ExportMenu
                      label="agent-shortcuts"
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
                {toolbarSlot}
                {!readonly && onCreate && (
                  <Button onClick={onCreate} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    New Shortcut
                  </Button>
                )}
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

          <div className="grid grid-cols-4 gap-2">
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
                  {stats.wiredToAgent}
                </div>
                <div className="text-xs text-muted-foreground">Connected</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-2">
                <div className="text-xl font-bold text-warning">
                  {stats.unwired}
                </div>
                <div className="text-xs text-muted-foreground">Unwired</div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <Input
              placeholder="Search shortcuts (label, description, keyboard, or ID)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md text-[16px]"
            />

            <Select
              value={placementFilter}
              onValueChange={setPlacementFilter}
              disabled={!!placementFilterProp}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Placements</SelectItem>
                {availablePlacements.map((placement) => {
                  const meta = getPlacementTypeMeta(placement);
                  return (
                    <SelectItem key={placement} value={placement}>
                      {meta.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {availableCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.label}
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
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={contextTagFilter}
              onValueChange={setContextTagFilter}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Context tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All contexts</SelectItem>
                <SelectItem value="unrestricted">Unrestricted only</SelectItem>
                {uniqueContextTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    Tag: {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[260px]">
                    <span className="font-semibold">ID</span>
                  </TableHead>
                  <TableHead
                    className="min-w-[200px]"
                    onClick={() => handleSort("label")}
                  >
                    <div className="flex items-center gap-1 cursor-pointer hover:text-primary">
                      Label
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon field="label" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="min-w-[140px]"
                    onClick={() => handleSort("placement")}
                  >
                    <div className="flex items-center gap-1 cursor-pointer hover:text-primary">
                      Placement
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon field="placement" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="min-w-[140px]"
                    onClick={() => handleSort("category")}
                  >
                    <div className="flex items-center gap-1 cursor-pointer hover:text-primary">
                      Category
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon field="category" />
                    </div>
                  </TableHead>
                  <TableHead className="min-w-[140px] max-w-[220px]">
                    Contexts
                  </TableHead>
                  <TableHead
                    className="min-w-[120px]"
                    onClick={() => handleSort("display")}
                  >
                    <div className="flex items-center gap-1 cursor-pointer hover:text-primary">
                      Display
                      <ArrowUpDown className="h-3 w-3" />
                      <SortIcon field="display" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="w-[80px] text-center"
                    onClick={() => handleSort("autoRun")}
                  >
                    <div className="flex items-center gap-1 cursor-pointer hover:text-primary justify-center">
                      Auto
                      <SortIcon field="autoRun" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="w-[80px] text-center"
                    onClick={() => handleSort("allowChat")}
                  >
                    <div className="flex items-center gap-1 cursor-pointer hover:text-primary justify-center">
                      Chat
                      <SortIcon field="allowChat" />
                    </div>
                  </TableHead>
                  <TableHead className="min-w-[120px]">Keyboard</TableHead>
                  <TableHead
                    className="w-[100px] text-center"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-1 cursor-pointer hover:text-primary justify-center">
                      Active
                      <SortIcon field="status" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right w-[160px]">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((shortcut) => {
                  const cat = categoryById.get(shortcut.categoryId);
                  return (
                    <TableRow
                      key={shortcut.id}
                      className="group/x cursor-pointer hover:bg-muted/50"
                      onClick={() => onEdit?.(shortcut)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 gap-2 font-mono text-xs hover:bg-accent w-full justify-start"
                                onClick={(e) => handleCopyId(shortcut.id, e)}
                              >
                                {copiedId === shortcut.id ? (
                                  <Check className="h-3 w-3 text-success flex-shrink-0" />
                                ) : (
                                  <Copy className="h-3 w-3 flex-shrink-0" />
                                )}
                                <span className="truncate">{shortcut.id}</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Copy ID</TooltipContent>
                          </Tooltip>
                          <CopyButtons
                            size="xs"
                            label={shortcut.label}
                            className="opacity-0 group-hover/x:opacity-100 focus-within:opacity-100 shrink-0"
                            human={() =>
                              agentShortcutRecordSummary(shortcut, cat)
                            }
                            json={() => shortcut}
                            agent={() => ({
                              kind: "agent-shortcut",
                              location:
                                "AI Matrx Admin — System Agents · Shortcuts (/administration/agents/system-agents/shortcuts)",
                              description: "A single agent shortcut.",
                              data: shortcut,
                              summary: agentShortcutRecordSummary(
                                shortcut,
                                cat,
                              ),
                              attributes: {
                                id: shortcut.id,
                                categoryId: shortcut.categoryId,
                              },
                            })}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <MousePointerClick className="h-4 w-4 text-primary" />
                          <div className="font-medium">{shortcut.label}</div>
                          {/* The DESKTOP table is the primary view — the card
                              layout is the `isMobile` branch ABOVE (the early
                              return at the top of this component). Doors added
                              only there would have fixed the minority path and
                              left the main one a dead end. Pinned visible: this
                              row's hover group is NAMED (`group/x`), which the
                              controls' plain `group-hover:` cannot see. */}
                          <EntityDoorControls
                            token="agent_shortcut"
                            id={shortcut.id}
                            name={shortcut.label}
                            href={doorHrefFor?.(shortcut) ?? null}
                            alwaysShowActions
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        {cat ? (
                          <Badge variant="outline">
                            {getPlacementTypeMeta(cat.placementType).label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {cat ? (
                          <span className="text-sm">{cat.label}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {shortcut.enabledFeatures &&
                          shortcut.enabledFeatures.length > 0 ? (
                            shortcut.enabledFeatures.map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="text-[10px] font-normal"
                              >
                                {tag}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              All
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {shortcut.displayMode}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {shortcut.autoRun ? (
                          <Zap className="h-3.5 w-3.5 text-primary mx-auto" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {shortcut.allowChat ? (
                          <Check className="h-3.5 w-3.5 text-success mx-auto" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {shortcut.keyboardShortcut && (
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {shortcut.keyboardShortcut}
                          </code>
                        )}
                      </TableCell>
                      <TableCell
                        className="text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Switch
                          checked={shortcut.isActive}
                          onCheckedChange={() =>
                            !readonly && handleToggleActive(shortcut)
                          }
                          disabled={readonly}
                        />
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-1">
                          {onEdit && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onEdit(shortcut)}
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit</TooltipContent>
                            </Tooltip>
                          )}
                          {!readonly && onDuplicate && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onDuplicate(shortcut)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Duplicate</TooltipContent>
                            </Tooltip>
                          )}
                          {!readonly &&
                            onPromoteToGlobal &&
                            scope !== "global" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onPromoteToGlobal(shortcut)}
                                  >
                                    <Globe className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Promote to Global (admin)
                                </TooltipContent>
                              </Tooltip>
                            )}
                          {!readonly && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleToggleActive(shortcut)}
                                >
                                  {shortcut.isActive ? (
                                    <EyeOff className="h-3 w-3" />
                                  ) : (
                                    <Eye className="h-3 w-3" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {shortcut.isActive ? "Deactivate" : "Activate"}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filtered.length === 0 && (
              <div className="text-center py-12">
                <MousePointerClick className="h-12 w-12 mx-auto text-muted-foreground mb-3 opacity-50" />
                <p className="text-muted-foreground">No shortcuts found</p>
                {hasActiveFilters && (
                  <Button
                    variant="link"
                    onClick={clearFilters}
                    className="mt-2"
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            )}
            {isLoading && filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                Loading shortcuts...
              </div>
            )}
          </ScrollArea>
        </div>
        {/* Screen-reader-only status. It used to read the raw container uuid
            aloud, character by character — noise, not identity, and it was the
            only place this list mentioned its scope at all. The scope LEVEL is
            the part a listener can actually use.
            (Sighted users get no scope indicator here whatsoever; that gap is a
            design question, tracked in the no-dead-ends handoff.) */}
        <div className="sr-only">Scope: {scope}</div>
      </div>
    </TooltipProvider>
  );
}
