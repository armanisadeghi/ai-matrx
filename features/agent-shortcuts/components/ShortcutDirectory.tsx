"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, MousePointerClick, X } from "lucide-react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { idMatchesQuery } from "@ai-matrx/kit/search-scoring";
import { getPlacementTypeMeta } from "../constants";
import { useShortcutDirectory } from "../hooks/useShortcutDirectory";
import type {
  ShortcutDirectoryGroupBy,
  ShortcutDirectoryMode,
  ShortcutDirectoryRow,
} from "../utils/shortcut-directory-rows";
import {
  isShortcutUuid,
  resolveAgentUrl,
  resolveShortcutDirectUrl,
  resolveShortcutEditUrl,
  scopeTypeLabel,
} from "../utils/shortcut-directory-rows";
import {
  buildShortcutDirectoryBriefs,
  shortcutDirectoryRowSummary,
} from "../format";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import {
  buildDefaultTableRowMenuDescriptor,
  createTableRowMenuDescriptor,
} from "@/features/context-menu-v3/table-row-context-registry";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";

export interface ShortcutDirectoryProps {
  mode: ShortcutDirectoryMode;
  title?: string;
  manageHref?: string;
  manageLabel?: string;
  /** Core route consumers provide the page header. */
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
  const [scopeFilter, setScopeFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [surfaceFilter, setSurfaceFilter] = useState("all");
  const [placementFilter, setPlacementFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [groupBy, setGroupBy] = useState<ShortcutDirectoryGroupBy>("none");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scopeOptions = [...new Set(rows.map((row) => row.scopeType))].sort();
  const agentOptions = [
    ...new Map(
      rows
        .filter((row): row is ShortcutDirectoryRow & { agentId: string } =>
          Boolean(row.agentId),
        )
        .map((row) => [row.agentId, row.agentName ?? row.agentId]),
    ),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const surfaceOptions = [
    ...new Set(
      rows.flatMap((row) => (row.surfaceName ? [row.surfaceName] : [])),
    ),
  ].sort();
  const placementOptions = [
    ...new Set(
      rows.flatMap((row) => (row.placementType ? [row.placementType] : [])),
    ),
  ].sort();
  const stats = {
    total: rows.length,
    active: rows.filter((row) => row.isActive).length,
    withAgent: rows.filter((row) => row.agentId).length,
  };

  // The table owns normal column filtering/sorting. This pre-filter remains
  // directory-owned because UUID fragment scoring is a domain search contract.
  const filteredRows = rows.filter((row) => {
    const query = searchQuery.trim().toLowerCase();
    if (
      query &&
      !(
        row.label.toLowerCase().includes(query) ||
        (row.description ?? "").toLowerCase().includes(query) ||
        (row.agentName ?? "").toLowerCase().includes(query) ||
        row.categoryLabel.toLowerCase().includes(query) ||
        (row.surfaceName ?? "").toLowerCase().includes(query) ||
        idMatchesQuery(row, query)
      )
    )
      return false;
    if (scopeFilter !== "all" && row.scopeType !== scopeFilter) return false;
    if (agentFilter !== "all" && row.agentId !== agentFilter) return false;
    if (surfaceFilter !== "all" && row.surfaceName !== surfaceFilter)
      return false;
    if (placementFilter !== "all" && row.placementType !== placementFilter)
      return false;
    if (activeFilter === "active" && !row.isActive) return false;
    if (activeFilter === "inactive" && row.isActive) return false;
    return true;
  });
  const hasDirectoryFilters =
    Boolean(searchQuery.trim()) ||
    scopeFilter !== "all" ||
    agentFilter !== "all" ||
    surfaceFilter !== "all" ||
    placementFilter !== "all" ||
    activeFilter !== "all";
  const clearDirectoryFilters = () => {
    setSearchQuery("");
    setScopeFilter("all");
    setAgentFilter("all");
    setSurfaceFilter("all");
    setPlacementFilter("all");
    setActiveFilter("all");
  };
  const navigateToShortcut = (row: ShortcutDirectoryRow) =>
    startTransition(() => router.push(resolveShortcutEditUrl(row, mode)));
  const handleIdLookup = () => {
    const id = idLookup.trim();
    if (!id) return;
    if (!isShortcutUuid(id)) {
      toast({
        title: "Invalid ID",
        description: "Enter a valid shortcut UUID.",
        variant: "destructive",
      });
      return;
    }
    startTransition(() => router.push(resolveShortcutDirectUrl(id, mode)));
  };
  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      toast({ title: "Copied", description: "Shortcut ID copied" });
      setTimeout(
        () => setCopiedId((current) => (current === id ? null : current)),
        1800,
      );
    } catch {
      toast({
        title: "Copy failed",
        description: "Unable to copy ID",
        variant: "destructive",
      });
    }
  };

  const columns: MatrxColumnDef<ShortcutDirectoryRow>[] = [
    {
      id: "id",
      accessorKey: "id",
      header: "ID",
      label: "ID",
      width: 260,
      sortable: false,
      cellKind: "text",
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full justify-start gap-2 px-2 font-mono text-xs"
          onClick={(event) => {
            event.stopPropagation();
            void copyId(row.id);
          }}
        >
          {copiedId === row.id ? (
            <Check className="size-3 shrink-0 text-success" />
          ) : (
            <Copy className="size-3 shrink-0" />
          )}
          <span className="truncate">{row.id}</span>
        </Button>
      ),
    },
    {
      id: "label",
      accessorKey: "label",
      header: "Label",
      label: "Label",
      width: 220,
      href: (row) => resolveShortcutEditUrl(row, mode),
      cell: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium">
            <MousePointerClick className="size-4 shrink-0 text-primary" />
            <span className="truncate">{row.label}</span>
          </div>
          {row.description && (
            <div className="truncate text-xs text-muted-foreground">
              {row.description}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "agent",
      header: "Agent",
      label: "Agent",
      width: 180,
      accessorFn: (row) => row.agentName ?? row.agentId ?? "",
      cell: (row) =>
        row.agentId ? (
          <EntityRef
            token="agent"
            id={row.agentId}
            name={row.agentName ?? row.agentId}
            href={resolveAgentUrl(row.agentId, mode)}
            showIcon={false}
            className="max-w-[180px] text-sm"
          />
        ) : row.agentName ? (
          <span className="block max-w-[180px] truncate text-sm">
            {row.agentName}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "scope",
      header: "Scope",
      label: "Scope",
      width: 170,
      accessorFn: (row) => `${row.scopeType} ${row.scopeName}`,
      cell: (row) => (
        <div className="space-y-0.5">
          <Badge variant="outline" className="text-xs">
            {scopeTypeLabel(row.scopeType)}
          </Badge>
          <div className="max-w-[160px] truncate text-xs text-muted-foreground">
            {row.scopeName}
          </div>
        </div>
      ),
    },
    {
      id: "placement",
      header: "Placement",
      label: "Placement",
      width: 140,
      accessorFn: (row) => row.placementType ?? "",
      cell: (row) =>
        row.placementType ? (
          <Badge variant="outline">
            {getPlacementTypeMeta(row.placementType).label}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "category",
      accessorKey: "categoryLabel",
      header: "Category",
      label: "Category",
      width: 140,
      cell: (row) => <span className="text-sm">{row.categoryLabel}</span>,
    },
    {
      id: "surface",
      header: "Surface",
      label: "Surface",
      width: 150,
      accessorFn: (row) => row.surfaceName ?? "",
      cell: (row) =>
        row.surfaceName ? (
          <span className="block max-w-[160px] truncate text-xs">
            {row.surfaceName}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">All</span>
        ),
    },
    {
      id: "status",
      accessorKey: "isActive",
      header: "Status",
      label: "Status",
      width: 110,
      align: "center",
      filter: "boolean",
      cell: (row) => (
        <Badge variant={row.isActive ? "default" : "secondary"}>
          {row.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];
  const menuSectionsFor = (
    row: ShortcutDirectoryRow,
  ): ContextMenuExtraSection[] => {
    const items: ContextMenuExtraSection["items"] = [
      {
        kind: "link",
        id: "shortcut-open",
        label: `Open \"${row.label}\"`,
        icon: ExternalLink,
        href: resolveShortcutEditUrl(row, mode),
      },
      {
        kind: "link",
        id: "shortcut-open-new-tab",
        label: "Open in a new tab",
        icon: ExternalLink,
        href: resolveShortcutEditUrl(row, mode),
        target: "_blank",
      },
      {
        kind: "item",
        id: "shortcut-copy-id",
        label: "Copy ID",
        icon: Copy,
        onSelect: () => {
          void copyId(row.id);
        },
      },
    ];
    if (row.agentId)
      items.push({
        kind: "link",
        id: "shortcut-open-agent",
        label: `Open agent \"${row.agentName ?? row.agentId}\"`,
        icon: ExternalLink,
        href: resolveAgentUrl(row.agentId, mode),
      });
    return [
      {
        id: "shortcut-actions",
        label: "Shortcut",
        icon: MousePointerClick,
        anchor: "after-clipboard",
        items,
      },
    ];
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {error && (
        <div className="border-b border-destructive/30 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <MatrxDataTable<ShortcutDirectoryRow>
        tableId={`agent-shortcuts/directory/${mode}`}
        data={filteredRows}
        columns={columns}
        getRowId={(row) => row.id}
        density="condensed"
        isLoading={isLoading && rows.length === 0}
        isFetching={isLoading && rows.length > 0}
        defaultSort={{ id: "label", direction: "asc" }}
        detail={{ enabled: false }}
        window={{ enabled: false }}
        getRowHref={(row) => resolveShortcutEditUrl(row, mode)}
        onRowOpen={navigateToShortcut}
        pageSize={0}
        hidePagination
        coverage={{
          noun: "shortcut",
          loaded: rows.length,
          total: rows.length,
          answeredBy: "client",
        }}
        emptyState={{
          title: hasDirectoryFilters
            ? "No shortcuts match the current filters."
            : "No shortcuts available.",
        }}
        grouping={{
          columnId: groupBy === "none" ? null : groupBy,
          onColumnIdChange: (columnId) =>
            setGroupBy((columnId ?? "none") as ShortcutDirectoryGroupBy),
          groupableColumnIds: [
            "agent",
            "scope",
            "surface",
            "category",
            "placement",
          ],
          rowNoun: "shortcut",
          renderLabel: (group) => {
            const first = group.rows[0];
            return groupBy === "agent" && first?.agentId ? (
              <EntityRef
                token="agent"
                id={first.agentId}
                name={group.label}
                href={resolveAgentUrl(first.agentId, mode)}
                showIcon={false}
                className="font-semibold"
              />
            ) : (
              group.label
            );
          },
        }}
        copy={{
          label: "Shortcut",
          listLabel: "All shortcuts",
          location:
            "AI Matrx Admin — System Agents · Shortcuts directory (/administration/agents/system-agents/shortcuts/all)",
          rowKind: "agent-shortcut",
          listKind: "agent-shortcuts",
          rowDescription: "A single agent shortcut directory row.",
          listDescription:
            "All agent shortcuts currently matching the directory's filters.",
          humanRow: shortcutDirectoryRowSummary,
          agentRow: (row) => row,
          rowAttributes: (row) => ({ id: row.id, scope: row.scopeType }),
          listAttributes: (visible) => ({ count: visible.length }),
          listContext: () => ({
            groupBy,
            search: searchQuery || undefined,
            scopeFilter,
            agentFilter,
            surfaceFilter,
            placementFilter,
            activeFilter,
          }),
          rowAiVariants: (row) => [
            {
              id: "row-summary",
              label: "Shortcut summary",
              build: () => ({
                kind: "agent-shortcut",
                location:
                  "AI Matrx Admin — System Agents · Shortcuts directory (/administration/agents/system-agents/shortcuts/all)",
                description: "A single agent shortcut directory row.",
                data: row,
                summary: shortcutDirectoryRowSummary(row),
                attributes: { id: row.id, scope: row.scopeType },
              }),
            },
          ],
          aiVariants: (visible) => [
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
                data: buildShortcutDirectoryBriefs(visible),
                attributes: { count: visible.length },
              }),
            },
          ],
          export: (visible) => ({
            items: [
              jsonExportItem(() => visible),
              csvExportItem(
                () => visible as unknown as Array<Record<string, unknown>>,
                "CSV",
              ),
            ],
          }),
        }}
        contextMenu={{
          resolveRowContext: (row, controls) => {
            const base = buildDefaultTableRowMenuDescriptor(row, controls);
            return createTableRowMenuDescriptor({
              ...base,
              context: {
                ...base.context,
                content: shortcutDirectoryRowSummary(row),
                __entity: {
                  type: "agent_shortcut",
                  id: row.id,
                  title: row.label,
                },
              },
              extraSections: [...base.extraSections, ...menuSectionsFor(row)],
            });
          },
        }}
        rowActions={(row) => (
          <Link
            href={resolveShortcutEditUrl(row, mode)}
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              variant="outline"
              size="sm"
              aria-label={`Open ${row.label}`}
            >
              <ExternalLink className="size-3" />
            </Button>
          </Link>
        )}
        toolbar={{
          title: hideTitleBar ? undefined : title,
          titleCount: { value: filteredRows.length, label: "shortcuts" },
          search: false,
          customSearch: (
            <Input
              placeholder="Search label, agent, category, or ID..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-8 min-w-[220px] text-[16px] sm:w-80 sm:text-sm"
              aria-label="Search shortcuts"
            />
          ),
          refresh: { onRefresh: () => refetch() },
          actions: (
            <div className="flex items-center gap-2">
              {manageHref && manageLabel && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={manageHref}>{manageLabel}</Link>
                </Button>
              )}
              {hasDirectoryFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearDirectoryFilters}
                >
                  <X className="mr-2 size-4" />
                  Clear filters
                </Button>
              )}
            </div>
          ),
          leading: (
            <div className="space-y-2">
              <div className="grid max-w-xl grid-cols-3 gap-2">
                {[
                  { label: "Total", value: stats.total, tone: "" },
                  {
                    label: "Active",
                    value: stats.active,
                    tone: "text-primary",
                  },
                  {
                    label: "Agent-linked",
                    value: stats.withAgent,
                    tone: "text-success",
                  },
                ].map((stat) => (
                  <Card key={stat.label}>
                    <CardContent className="p-2">
                      <div className={`text-xl font-bold ${stat.tone}`}>
                        {stat.value}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {stat.label}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-[320px] items-center gap-2">
                  <Input
                    placeholder="Paste shortcut UUID..."
                    value={idLookup}
                    onChange={(event) => setIdLookup(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleIdLookup();
                    }}
                    className="h-8 font-mono text-xs"
                    aria-label="Shortcut UUID"
                  />
                  <Button size="sm" onClick={handleIdLookup}>
                    Go
                  </Button>
                </div>
                <Select value={scopeFilter} onValueChange={setScopeFilter}>
                  <SelectTrigger className="h-8 w-[160px]">
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
                  <SelectTrigger className="h-8 w-[180px]">
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
                  <SelectTrigger className="h-8 w-[180px]">
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
                <Select
                  value={placementFilter}
                  onValueChange={setPlacementFilter}
                >
                  <SelectTrigger className="h-8 w-[180px]">
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
                  <SelectTrigger className="h-8 w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="active">Active only</SelectItem>
                    <SelectItem value="inactive">Inactive only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ),
        }}
      />
    </div>
  );
}
