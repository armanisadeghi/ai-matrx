"use client";

import { useMemo, useState } from "react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Check,
  Copy,
  Edit2,
  Eye,
  EyeOff,
  Globe,
  MousePointerClick,
  Zap,
} from "lucide-react";
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
import { jsonExportItem, csvExportItem } from "@/components/agent-copy/export";
import { agentShortcutRecordSummary } from "../format";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface ShortcutListProps extends ScopeProps {
  onEdit?: (shortcut: AgentShortcutRecord) => void;
  onCreate?: () => void;
  onDuplicate?: (shortcut: AgentShortcutRecord) => void;
  onPromoteToGlobal?: (shortcut: AgentShortcutRecord) => void;
  className?: string;
  readonly?: boolean;
  placementFilter?: string;
  toolbarSlot?: React.ReactNode;
  hideTitleBar?: boolean;
  /** Resolves the same surface-specific URL used by onEdit. */
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
  const { toast } = useToast();
  const { shortcuts, categories, isLoading, error, refetch } =
    useAgentShortcuts({ scope, scopeId });
  const crud = useAgentShortcutCrud({ scope, scopeId });
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [placementFilter, setPlacementFilter] = useState(
    placementFilterProp ?? "all",
  );
  const [activeFilter, setActiveFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [contextTagFilter, setContextTagFilter] = useState("all");

  const categoryById = useMemo(() => {
    const map = new Map<string, AgentShortcutCategory>();
    categories.forEach((category) => map.set(category.id, category));
    return map;
  }, [categories]);
  const availablePlacements = useMemo(
    () =>
      Array.from(
        new Set(
          shortcuts.flatMap((shortcut) => {
            const placement = categoryById.get(
              shortcut.categoryId,
            )?.placementType;
            return placement ? [placement] : [];
          }),
        ),
      ),
    [shortcuts, categoryById],
  );
  const uniqueContextTags = useMemo(
    () =>
      Array.from(
        new Set(
          shortcuts.flatMap((shortcut) =>
            (shortcut.enabledFeatures ?? []).filter(isValidShortcutContext),
          ),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [shortcuts],
  );
  const availableCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          (placementFilter === "all" ||
            category.placementType === placementFilter) &&
          shortcuts.some((shortcut) => shortcut.categoryId === category.id),
      ),
    [categories, shortcuts, placementFilter],
  );

  // Retained custom controls: their choices depend on each other and on live rows.
  const filteredShortcuts = useMemo(
    () =>
      shortcuts.filter((shortcut) => {
        const category = categoryById.get(shortcut.categoryId);
        if (categoryFilter !== "all" && shortcut.categoryId !== categoryFilter)
          return false;
        if (
          placementFilter !== "all" &&
          category?.placementType !== placementFilter
        )
          return false;
        if (activeFilter === "active" && !shortcut.isActive) return false;
        if (activeFilter === "inactive" && shortcut.isActive) return false;
        if (contextTagFilter === "unrestricted")
          return (shortcut.enabledFeatures?.length ?? 0) === 0;
        return (
          contextTagFilter === "all" ||
          !isValidShortcutContext(contextTagFilter) ||
          (shortcut.enabledFeatures ?? []).includes(contextTagFilter)
        );
      }),
    [
      shortcuts,
      categoryById,
      categoryFilter,
      placementFilter,
      activeFilter,
      contextTagFilter,
    ],
  );

  const stats = useMemo(() => {
    const active = shortcuts.filter((shortcut) => shortcut.isActive).length;
    const wiredToAgent = shortcuts.filter(
      (shortcut) => shortcut.agentId,
    ).length;
    return {
      total: shortcuts.length,
      active,
      wiredToAgent,
      unwired: shortcuts.length - wiredToAgent,
    };
  }, [shortcuts]);
  const hasActiveFilters =
    categoryFilter !== "all" ||
    placementFilter !== (placementFilterProp ?? "all") ||
    activeFilter !== "all" ||
    contextTagFilter !== "all";
  const handlePlacementFilterChange = (nextPlacement: string) => {
    setPlacementFilter(nextPlacement);
    if (
      categoryFilter !== "all" &&
      nextPlacement !== "all" &&
      categoryById.get(categoryFilter)?.placementType !== nextPlacement
    ) {
      setCategoryFilter("all");
    }
  };
  const handleToggleActive = async (shortcut: AgentShortcutRecord) => {
    try {
      await crud.updateShortcut(shortcut.id, { isActive: !shortcut.isActive });
      toast({
        title: shortcut.isActive ? "Deactivated" : "Activated",
        description: shortcut.label,
      });
    } catch (caught) {
      toast({
        title: "Update failed",
        description:
          caught instanceof Error ? caught.message : "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const columns = useMemo<MatrxColumnDef<AgentShortcutRecord>[]>(
    () => [
      {
        id: "id",
        accessorKey: "id",
        header: "ID",
        label: "ID",
        width: 260,
        cellKind: "uuid",
      },
      {
        id: "label",
        accessorKey: "label",
        header: "Label",
        label: "Label",
        width: 240,
        cell: (shortcut) => (
          <div className="flex min-w-0 items-center gap-2">
            <MousePointerClick className="size-4 shrink-0 text-primary" />
            <span className="truncate font-medium">{shortcut.label}</span>
            <EntityDoorControls
              token="agent_shortcut"
              id={shortcut.id}
              name={shortcut.label}
              href={doorHrefFor?.(shortcut) ?? null}
              alwaysShowActions
            />
          </div>
        ),
      },
      {
        id: "placement",
        header: "Placement",
        label: "Placement",
        width: 150,
        filter: false,
        accessorFn: (shortcut) =>
          categoryById.get(shortcut.categoryId)?.placementType ?? "",
        cell: (shortcut) => {
          const placement = categoryById.get(
            shortcut.categoryId,
          )?.placementType;
          return placement ? (
            <Badge variant="outline">
              {getPlacementTypeMeta(placement).label}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        id: "category",
        header: "Category",
        label: "Category",
        width: 160,
        filter: false,
        accessorFn: (shortcut) =>
          categoryById.get(shortcut.categoryId)?.label ?? "",
        cell: (shortcut) => categoryById.get(shortcut.categoryId)?.label ?? "—",
      },
      {
        id: "contexts",
        header: "Contexts",
        label: "Contexts",
        width: 220,
        filter: false,
        accessorFn: (shortcut) => shortcut.enabledFeatures?.join(" ") ?? "",
        cell: (shortcut) =>
          shortcut.enabledFeatures?.length ? (
            <div className="flex max-w-[220px] flex-wrap gap-1">
              {shortcut.enabledFeatures.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="text-[10px] font-normal"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">All</span>
          ),
      },
      {
        id: "displayMode",
        accessorKey: "displayMode",
        header: "Display",
        label: "Display",
        width: 120,
        cell: (shortcut) => (
          <Badge variant="secondary" className="text-xs">
            {shortcut.displayMode}
          </Badge>
        ),
      },
      {
        id: "autoRun",
        accessorKey: "autoRun",
        header: "Auto",
        label: "Auto",
        width: 72,
        align: "center",
        compact: true,
        cell: (shortcut) =>
          shortcut.autoRun ? (
            <Zap className="mx-auto size-3.5 text-primary" />
          ) : (
            "—"
          ),
      },
      {
        id: "allowChat",
        accessorKey: "allowChat",
        header: "Chat",
        label: "Chat",
        width: 72,
        align: "center",
        compact: true,
        cell: (shortcut) =>
          shortcut.allowChat ? (
            <Check className="mx-auto size-3.5 text-success" />
          ) : (
            "—"
          ),
      },
      {
        id: "keyboardShortcut",
        accessorKey: "keyboardShortcut",
        header: "Keyboard",
        label: "Keyboard",
        width: 130,
        cell: (shortcut) =>
          shortcut.keyboardShortcut ? (
            <code className="rounded bg-muted px-2 py-1 text-xs">
              {shortcut.keyboardShortcut}
            </code>
          ) : (
            "—"
          ),
      },
      {
        id: "isActive",
        accessorKey: "isActive",
        header: "Active",
        label: "Active",
        width: 80,
        filter: false,
        align: "center",
        compact: true,
        cell: (shortcut) => (
          <Switch
            checked={shortcut.isActive}
            disabled={readonly}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={() => void handleToggleActive(shortcut)}
          />
        ),
      },
    ],
    [categoryById, doorHrefFor, readonly],
  );

  return (
    <TooltipProvider>
      <div className={`flex h-full min-h-0 flex-col ${className ?? ""}`}>
        {error && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            Unable to load shortcuts: {error}
            <ErrorAlchemyMenu error={error} />
          </div>
        )}
        <MatrxDataTable<AgentShortcutRecord>
          data={filteredShortcuts}
          columns={columns}
          getRowId={(shortcut) => shortcut.id}
          getRowHref={(shortcut) => doorHrefFor?.(shortcut) ?? undefined}
          onRowOpen={onEdit}
          defaultSort={{ id: "label", direction: "asc" }}
          density="condensed"
          isLoading={isLoading}
          tableId={`agent-shortcuts-${scope}-${scopeId ?? "current"}`}
          searchText={(shortcut) =>
            [
              shortcut.label,
              shortcut.description ?? "",
              shortcut.keyboardShortcut ?? "",
              shortcut.id,
            ].join(" ")
          }
          toolbar={{
            title: hideTitleBar ? undefined : "Shortcuts",
            titleCount: { value: filteredShortcuts.length, label: "shortcuts" },
            search: true,
            searchPlaceholder:
              "Search shortcuts (label, description, keyboard, or ID)…",
            refresh: hideTitleBar
              ? undefined
              : { onRefresh: refetch, label: "Refresh shortcuts" },
            add:
              !hideTitleBar && !readonly && onCreate
                ? { onAdd: onCreate }
                : undefined,
            actions: hideTitleBar ? undefined : toolbarSlot,
            facets: [
              {
                type: "custom",
                id: "placement",
                filter: {
                  active: placementFilter !== (placementFilterProp ?? "all"),
                  onReset: () =>
                    handlePlacementFilterChange(placementFilterProp ?? "all"),
                },
                render: () =>
                  placementFilterProp ? (
                    <Badge
                      variant="outline"
                      className="h-8 px-3 text-xs font-normal text-muted-foreground"
                    >
                      Placement:{" "}
                      {getPlacementTypeMeta(placementFilterProp).label} — fixed
                      by this view
                    </Badge>
                  ) : (
                    <Select
                      value={placementFilter}
                      onValueChange={handlePlacementFilterChange}
                    >
                      <SelectTrigger className="h-8 w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Placements</SelectItem>
                        {availablePlacements.map((placement) => (
                          <SelectItem key={placement} value={placement}>
                            {getPlacementTypeMeta(placement).label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ),
              },
              {
                type: "custom",
                id: "category",
                filter: {
                  active: categoryFilter !== "all",
                  onReset: () => setCategoryFilter("all"),
                },
                render: () => (
                  <Select
                    value={categoryFilter}
                    onValueChange={setCategoryFilter}
                  >
                    <SelectTrigger className="h-8 w-[180px]">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {availableCategories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ),
              },
              {
                type: "custom",
                id: "status",
                filter: {
                  active: activeFilter !== "all",
                  onReset: () => setActiveFilter("all"),
                },
                render: () => (
                  <Select
                    value={activeFilter}
                    onValueChange={(value) =>
                      setActiveFilter(value as typeof activeFilter)
                    }
                  >
                    <SelectTrigger className="h-8 w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active Only</SelectItem>
                      <SelectItem value="inactive">Inactive Only</SelectItem>
                    </SelectContent>
                  </Select>
                ),
              },
              {
                type: "custom",
                id: "context",
                filter: {
                  active: contextTagFilter !== "all",
                  onReset: () => setContextTagFilter("all"),
                },
                render: () => (
                  <Select
                    value={contextTagFilter}
                    onValueChange={setContextTagFilter}
                  >
                    <SelectTrigger className="h-8 w-[200px]">
                      <SelectValue placeholder="Context tag" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All contexts</SelectItem>
                      <SelectItem value="unrestricted">
                        Unrestricted only
                      </SelectItem>
                      {uniqueContextTags.map((tag) => (
                        <SelectItem key={tag} value={tag}>
                          Tag: {tag}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ),
              },
              ...(!hideTitleBar
                ? [
                    {
                      type: "custom" as const,
                      id: "source-stats",
                      render: () => (
                        <div className="flex items-center gap-3 whitespace-nowrap text-xs text-muted-foreground">
                          <span>
                            <strong className="text-foreground">
                              {stats.total}
                            </strong>{" "}
                            total in scope
                          </span>
                          <span>
                            <strong className="text-foreground">
                              {stats.active}
                            </strong>{" "}
                            active
                          </span>
                          <span>
                            <strong className="text-foreground">
                              {stats.wiredToAgent}
                            </strong>{" "}
                            connected
                          </span>
                          <span>
                            <strong className="text-foreground">
                              {stats.unwired}
                            </strong>{" "}
                            unwired
                          </span>
                        </div>
                      ),
                    },
                  ]
                : []),
            ],
          }}
          copy={{
            label: "Shortcut",
            listLabel: "Shortcuts",
            location: "AI Matrx — Agent Shortcuts",
            rowKind: "agent-shortcut",
            listKind: "agent-shortcuts",
            rowDescription: "A single agent shortcut.",
            listDescription:
              "Agent shortcuts currently matching this list's filters.",
            humanRow: (shortcut) =>
              agentShortcutRecordSummary(
                shortcut,
                categoryById.get(shortcut.categoryId),
              ),
            listContext: () => ({
              scope,
              scopeId: scopeId ?? null,
              total: stats.total,
              active: stats.active,
              wiredToAgent: stats.wiredToAgent,
            }),
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
          rowActions={(shortcut) => (
            <div
              className="flex items-center gap-1"
              onClick={(event) => event.stopPropagation()}
            >
              {onEdit && (
                <ShortcutAction label="Edit" onClick={() => onEdit(shortcut)}>
                  <Edit2 className="size-3" />
                </ShortcutAction>
              )}
              {!readonly && onDuplicate && (
                <ShortcutAction
                  label="Duplicate"
                  onClick={() => onDuplicate(shortcut)}
                >
                  <Copy className="size-3" />
                </ShortcutAction>
              )}
              {!readonly && onPromoteToGlobal && scope !== "global" && (
                <ShortcutAction
                  label="Promote to Global (admin)"
                  onClick={() => onPromoteToGlobal(shortcut)}
                >
                  <Globe className="size-3" />
                </ShortcutAction>
              )}
              {!readonly && (
                <ShortcutAction
                  label={shortcut.isActive ? "Deactivate" : "Activate"}
                  onClick={() => void handleToggleActive(shortcut)}
                >
                  {shortcut.isActive ? (
                    <EyeOff className="size-3" />
                  ) : (
                    <Eye className="size-3" />
                  )}
                </ShortcutAction>
              )}
            </div>
          )}
          mobileCards={(shortcut, _index, controls) => {
            const category = categoryById.get(shortcut.categoryId);
            const href = doorHrefFor?.(shortcut) ?? null;
            const openShortcut = (event: React.MouseEvent<HTMLElement>) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) {
                if (href) window.open(href, "_blank", "noopener");
                return;
              }
              onEdit?.(shortcut);
            };
            return (
              <Card
                className="cursor-pointer"
                onClick={openShortcut}
                onAuxClick={(event) => {
                  if (event.button === 1 && href) {
                    event.preventDefault();
                    window.open(href, "_blank", "noopener");
                  }
                }}
              >
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <MousePointerClick className="mt-0.5 size-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {shortcut.label}
                        </div>
                        {shortcut.description && (
                          <div className="line-clamp-2 text-xs text-muted-foreground">
                            {shortcut.description}
                          </div>
                        )}
                      </div>
                    </div>
                    <div
                      className="flex shrink-0 items-center gap-1"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <EntityDoorControls
                        token="agent_shortcut"
                        id={shortcut.id}
                        name={shortcut.label}
                        href={href}
                        alwaysShowActions
                      />
                      {controls.actions}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {category && (
                      <Badge variant="secondary" className="text-xs">
                        {category.label}
                      </Badge>
                    )}
                    {category?.placementType && (
                      <Badge variant="outline" className="text-xs">
                        {getPlacementTypeMeta(category.placementType).label}
                      </Badge>
                    )}
                    {shortcut.autoRun && (
                      <Badge variant="outline" className="text-xs">
                        Auto
                      </Badge>
                    )}
                    {shortcut.keyboardShortcut && (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {shortcut.keyboardShortcut}
                      </code>
                    )}
                    {shortcut.enabledFeatures?.map((tag) => (
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
          }}
          mobileCardsBreakpoint="lg"
          emptyState={{
            title: "No shortcuts found",
            description: hasActiveFilters
              ? "Clear the active filters to see every shortcut in this scope."
              : "Create a shortcut to make an action available in this scope.",
            icon: <MousePointerClick className="size-8" />,
          }}
        />
        <div className="sr-only">Scope: {scope}</div>
      </div>
    </TooltipProvider>
  );
}

function ShortcutAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="sm" onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
