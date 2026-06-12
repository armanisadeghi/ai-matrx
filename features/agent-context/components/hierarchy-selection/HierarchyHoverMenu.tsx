"use client";

import { useState, useRef } from "react";
import {
  Building2,
  FolderKanban,
  ListTodo,
  RefreshCw,
  Plus,
  Check,
  ChevronRight,
  Loader2,
  Folder,
  X,
  Globe,
  Circle,
} from "lucide-react";
import * as icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { idMatchesQuery } from "@/utils/search-scoring";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectNavOrganizations } from "@/features/agent-context/redux/hierarchySlice";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import { createScope } from "@/features/agent-context/redux/scope/scopesSlice";
import { setEntityScopes } from "@/features/agent-context/redux/scope/scopeAssignmentsSlice";
import {
  selectAllTasks,
  fetchTask,
} from "@/features/agent-context/redux/tasksSlice";
import {
  useHierarchySelection,
  FULL_HIERARCHY_LEVELS,
} from "./useHierarchySelection";
import { useCreateProject, useCreateTask } from "../../hooks/useHierarchy";
import type { HierarchySelectionProps, HierarchySelection } from "./types";

type LucideIcon = React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
}>;

function resolveIcon(name: string): LucideIcon {
  const pascalName = name
    .split(/[-_\s]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  const Icon = (icons as unknown as Record<string, LucideIcon>)[pascalName];
  return Icon ?? Folder;
}

// ─── Data model ─────────────────────────────────────────────────────────────

type FlatItemKind = "org" | "scope" | "project" | "task";

interface FlatItem {
  kind: FlatItemKind;
  id: string;
  name: string;
  orgId: string;
  orgName: string;
  scopeTypeId?: string;
  scopeTypeLabel?: string;
  scopeIcon?: string;
  scopeColor?: string;
  scopePath?: {
    typeId: string;
    typeLabel: string;
    scopeId: string;
    scopeName: string;
  }[];
  projectId?: string;
  projectName?: string;
  status?: string | null;
  openTaskCount?: number;
}

// For the detail panel — tasks inside a project, or scopes inside a scope-type
interface DetailItem {
  id: string;
  name: string;
  kind: "task" | "scope" | "project";
  status?: string | null;
  projectId?: string;
  projectName?: string;
  scopeTypeId?: string;
  scopeIcon?: string;
  scopeColor?: string;
  scopePath?: FlatItem["scopePath"];
}

// ─── Path builder ─────────────────────────────────────────────────────────

function buildSelectionFromItem(
  item: FlatItem,
  scopeSelections?: Record<string, string | null>,
): HierarchySelection {
  const base: HierarchySelection = {
    organizationId: item.orgId,
    organizationName: item.orgName,
    projectId: null,
    projectName: null,
    taskId: null,
    taskName: null,
    scopeSelections: {},
  };

  if (item.kind === "org") return base;

  if (item.kind === "scope") {
    return {
      ...base,
      scopeSelections: {
        ...(scopeSelections ?? {}),
        ...(item.scopeTypeId ? { [item.scopeTypeId]: item.id } : {}),
      },
    };
  }

  if (item.kind === "project") {
    const newScopes: Record<string, string> = {};
    for (const tag of item.scopePath ?? []) newScopes[tag.typeId] = tag.scopeId;
    return {
      ...base,
      projectId: item.id,
      projectName: item.name,
      scopeSelections: newScopes,
    };
  }

  if (item.kind === "task") {
    const newScopes: Record<string, string> = {};
    for (const tag of item.scopePath ?? []) newScopes[tag.typeId] = tag.scopeId;
    return {
      ...base,
      projectId: item.projectId ?? null,
      projectName: item.projectName ?? null,
      taskId: item.id,
      taskName: item.name,
      scopeSelections: newScopes,
    };
  }

  return base;
}

// ─── Status dot ─────────────────────────────────────────────────────────────

function StatusDot({ status }: { status?: string | null }) {
  if (!status) return null;
  return (
    <span
      className={cn(
        "h-1.5 w-1.5 rounded-full shrink-0 inline-block",
        status === "completed"
          ? "bg-green-400"
          : status === "in_progress"
            ? "bg-blue-400"
            : status === "blocked"
              ? "bg-red-400"
              : "bg-muted-foreground/40",
      )}
    />
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface HierarchyHoverMenuProps extends HierarchySelectionProps {
  viewMode?: "flat" | "grouped";
  triggerClassName?: string;
  placeholder?: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function HierarchyHoverMenu({
  levels = FULL_HIERARCHY_LEVELS,
  value,
  onChange,
  disabled,
  className,
  viewMode = "flat",
  triggerClassName,
  placeholder = "Select context...",
}: HierarchyHoverMenuProps) {
  const ctx = useHierarchySelection({
    levels,
    controlled: { value, onChange },
  });
  const dispatch = useAppDispatch();
  const orgsFromStore = useAppSelector(selectNavOrganizations);
  const allTasksFromStore = useAppSelector(selectAllTasks);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<FlatItem | null>(null);

  // Hover open/close with grace period so you can move to panel
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 220);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await dispatch(invalidateAndRefetchFullContext() as any);
    } finally {
      setRefreshing(false);
    }
  };

  /**
   * Handle a selection from the menu. If a task is selected, trigger a
   * background full-data fetch so the task detail view has rich data when
   * the user opens it (description, comments, etc.).
   */
  const handleSelect = (next: HierarchySelection) => {
    if (next.taskId) {
      dispatch(fetchTask(next.taskId) as any);
    }
    onChange(next);
    setOpen(false);
    setHoveredItem(null);
  };

  // ─── Build flat item list from Redux store ───────────────────────────────
  // Tasks now come from tasksSlice (flat, keyed by organization_id + project_id).
  // The hierarchy fullContext only carries task counts on projects; full task
  // objects live in the normalized tasksSlice populated by hydrateTasksFromContext.

  const flatItems: FlatItem[] = [];

  for (const org of orgsFromStore ?? []) {
    if (levels.includes("organization")) {
      flatItems.push({
        kind: "org",
        id: org.id,
        name: org.name,
        orgId: org.id,
        orgName: org.name,
      });
    }

    if (levels.includes("scope")) {
      for (const scopeType of org.scope_types ?? []) {
        for (const scope of (org.scopes ?? []).filter(
          (s) => s.scope_type_id === scopeType.id,
        )) {
          flatItems.push({
            kind: "scope",
            id: scope.id,
            name: scope.name,
            orgId: org.id,
            orgName: org.name,
            scopeTypeId: scopeType.id,
            scopeTypeLabel: scopeType.label_singular,
            scopeIcon: scopeType.icon,
            scopeColor: scopeType.color,
          });
        }
      }
    }

    if (levels.includes("project")) {
      for (const proj of org.projects ?? []) {
        const scopePath = (proj.scope_tags ?? []).map((tag) => {
          const matchingType = (org.scope_types ?? []).find(
            (t) => t.label_singular === tag.type_label,
          );
          return {
            typeId: matchingType?.id ?? tag.type_id ?? "",
            typeLabel: tag.type_label,
            scopeId: tag.scope_id ?? "",
            scopeName: tag.scope_name,
          };
        });

        flatItems.push({
          kind: "project",
          id: proj.id,
          name: proj.name,
          orgId: org.id,
          orgName: org.name,
          scopePath,
          openTaskCount: proj.open_task_count ?? 0,
        });

        if (levels.includes("task")) {
          // Read tasks from normalized tasksSlice — not from proj.open_tasks
          const projTasks = allTasksFromStore.filter(
            (t) => t.project_id === proj.id && t.status !== "completed",
          );
          for (const task of projTasks) {
            flatItems.push({
              kind: "task",
              id: task.id,
              name: task.title,
              orgId: org.id,
              orgName: org.name,
              projectId: proj.id,
              projectName: proj.name,
              scopePath,
              status: task.status,
            });
          }
        }
      }

      // Also include orphaned tasks for this org (project_id === null)
      if (levels.includes("task")) {
        const orphanTasks = allTasksFromStore.filter(
          (t) =>
            t.organization_id === org.id &&
            t.project_id === null &&
            t.status !== "completed",
        );
        for (const task of orphanTasks) {
          flatItems.push({
            kind: "task",
            id: task.id,
            name: task.title,
            orgId: org.id,
            orgName: org.name,
            scopePath: [],
            status: task.status,
          });
        }
      }
    }
  }

  // ─── Filter ──────────────────────────────────────────────────────────────

  const q = search.toLowerCase();
  const visible = q
    ? flatItems.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.scopeTypeLabel?.toLowerCase().includes(q) ||
          item.orgName.toLowerCase().includes(q) ||
          item.projectName?.toLowerCase().includes(q) ||
          idMatchesQuery(item, q),
      )
    : flatItems;

  // ─── Detail panel items for hovered row ──────────────────────────────────

  const detailItems: DetailItem[] = (() => {
    if (!hoveredItem) return [];
    const org = (orgsFromStore ?? []).find((o) => o.id === hoveredItem.orgId);
    if (!org) return [];

    if (hoveredItem.kind === "project") {
      // Tasks come from the normalized tasksSlice, not from proj.open_tasks
      const projTasks = allTasksFromStore.filter(
        (t) => t.project_id === hoveredItem.id && t.status !== "completed",
      );
      return projTasks.map((t) => ({
        id: t.id,
        name: t.title,
        kind: "task" as const,
        status: t.status,
        projectId: hoveredItem.id,
        projectName: hoveredItem.name,
        scopePath: hoveredItem.scopePath,
      }));
    }

    if (hoveredItem.kind === "scope") {
      // Show projects tagged with this scope
      return (org.projects ?? [])
        .filter((p) =>
          (p.scope_tags ?? []).some((tag) => {
            const matchType = (org.scope_types ?? []).find(
              (t) => t.label_singular === tag.type_label,
            );
            const scopeMatch = (org.scopes ?? []).find(
              (s) =>
                s.id === hoveredItem.id && s.scope_type_id === matchType?.id,
            );
            return !!scopeMatch && tag.scope_name === hoveredItem.name;
          }),
        )
        .map((p) => {
          const scopePath = (p.scope_tags ?? []).map((tag) => {
            const matchingType = (org.scope_types ?? []).find(
              (t) => t.label_singular === tag.type_label,
            );
            return {
              typeId: matchingType?.id ?? "",
              typeLabel: tag.type_label,
              scopeId: tag.scope_id ?? "",
              scopeName: tag.scope_name,
            };
          });
          return {
            id: p.id,
            name: p.name,
            kind: "project" as const,
            projectId: p.id,
            projectName: p.name,
            scopePath,
          };
        });
    }

    if (hoveredItem.kind === "org") {
      return (org.projects ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        kind: "project" as const,
        projectId: p.id,
        projectName: p.name,
      }));
    }

    return [];
  })();

  // ─── Trigger display label ────────────────────────────────────────────────

  const displayLabel = (() => {
    const parts: string[] = [];
    const scopeSels = value.scopeSelections ?? {};
    if (value.organizationName) parts.push(value.organizationName);
    const scopeNames = Object.values(scopeSels)
      .filter(Boolean)
      .map((sid) => {
        for (const org of orgsFromStore ?? []) {
          const found = org.scopes?.find((s) => s.id === sid);
          if (found) return found.name;
        }
        return null;
      })
      .filter(Boolean) as string[];
    parts.push(...scopeNames);
    if (value.projectName) parts.push(value.projectName);
    if (value.taskName) parts.push(value.taskName);
    return parts.length > 0 ? parts.join(" › ") : placeholder;
  })();

  const hasValue = !!(
    value.organizationId ||
    value.projectId ||
    value.taskId ||
    Object.values(value.scopeSelections ?? {}).some(Boolean)
  );

  // ─── Group for grouped mode ───────────────────────────────────────────────

  const groups: { orgId: string; orgName: string; items: FlatItem[] }[] = [];
  if (viewMode === "grouped") {
    const seen = new Map<string, FlatItem[]>();
    for (const item of visible) {
      if (!seen.has(item.orgId)) seen.set(item.orgId, []);
      seen.get(item.orgId)!.push(item);
    }
    seen.forEach((items, orgId) =>
      groups.push({ orgId, orgName: items[0]?.orgName ?? orgId, items }),
    );
  }

  const scopeSelections = value.scopeSelections ?? {};
  const showDetail =
    open &&
    hoveredItem &&
    (detailItems.length > 0 ||
      hoveredItem.kind === "project" ||
      hoveredItem.kind === "org" ||
      hoveredItem.kind === "scope");

  return (
    <div
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => {
        clearClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      {/* ── Trigger ── */}
      <Button
        variant="outline"
        size="sm"
        role="combobox"
        aria-expanded={open}
        disabled={disabled || ctx.isLoading}
        className={cn(
          "h-8 justify-between text-xs font-normal min-w-[180px] max-w-[380px] gap-1.5",
          !hasValue && "text-muted-foreground",
          triggerClassName,
        )}
      >
        {ctx.isLoading ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span>Loading...</span>
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1.5 truncate min-w-0">
              <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{displayLabel}</span>
            </span>
            <span className="flex items-center gap-0.5 shrink-0 ml-1">
              {hasValue && (
                <span
                  role="button"
                  className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted-foreground/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    ctx.clear();
                  }}
                >
                  <X className="h-2.5 w-2.5" />
                </span>
              )}
              <ChevronRight
                className={cn(
                  "h-3 w-3 opacity-50 transition-transform duration-150",
                  open && "rotate-90",
                )}
              />
            </span>
          </>
        )}
      </Button>

      {/* ── Panel ── */}
      {open && !ctx.isLoading && (
        <div
          className="absolute top-full left-0 z-50 mt-1 flex rounded-lg border border-border bg-popover shadow-xl overflow-hidden"
          style={{ minWidth: 300, maxWidth: showDetail ? 600 : 320 }}
          onMouseEnter={() => {
            clearClose();
            setOpen(true);
          }}
          onMouseLeave={scheduleClose}
          // Prevent wheel events from propagating to the page
          onWheel={(e) => e.stopPropagation()}
        >
          {/* ── Left column: main list ── */}
          <div className="flex flex-col w-[300px] shrink-0 border-r border-border/50">
            {/* Search + refresh header */}
            <div className="flex items-center gap-1.5 px-2 py-2 border-b border-border/50 shrink-0">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="h-7 text-xs flex-1"
                style={{ fontSize: "16px" }}
                autoFocus
              />
              <button
                className="h-7 w-7 flex items-center justify-center rounded border border-border hover:bg-muted transition-colors shrink-0"
                onClick={handleRefresh}
                title="Refresh"
                disabled={refreshing}
              >
                <RefreshCw
                  className={cn(
                    "h-3 w-3 text-muted-foreground",
                    refreshing && "animate-spin",
                  )}
                />
              </button>
            </div>

            {/* Scrollable list — overflow-y-auto keeps scroll contained */}
            <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
              <div className="py-1">
                {viewMode === "grouped" ? (
                  <>
                    {groups.map((group) => (
                      <div key={group.orgId}>
                        <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <Building2 className="h-3 w-3 text-violet-500" />
                          {group.orgName}
                        </div>
                        {group.items.map((item) => (
                          <MainRow
                            key={`${item.kind}-${item.id}`}
                            item={item}
                            value={value}
                            isHovered={
                              hoveredItem?.id === item.id &&
                              hoveredItem?.kind === item.kind
                            }
                            onHover={setHoveredItem}
                            onSelect={handleSelect}
                          />
                        ))}
                      </div>
                    ))}
                    {groups.length === 0 && <EmptyState search={search} />}
                  </>
                ) : (
                  <>
                    {visible.map((item) => (
                      <MainRow
                        key={`${item.kind}-${item.id}`}
                        item={item}
                        value={value}
                        isHovered={
                          hoveredItem?.id === item.id &&
                          hoveredItem?.kind === item.kind
                        }
                        onHover={setHoveredItem}
                        onSelect={handleSelect}
                      />
                    ))}
                    {visible.length === 0 && <EmptyState search={search} />}
                  </>
                )}
              </div>
            </div>

            {/* Add new footer */}
            <AddNewFooter
              levels={levels}
              orgs={ctx.orgs}
              selectedOrgId={value.organizationId}
              selectedProjectId={value.projectId}
              onAdded={handleRefresh}
            />
          </div>

          {/* ── Right column: detail / quick-add panel ── */}
          {showDetail && hoveredItem && (
            <DetailPanel
              item={hoveredItem}
              detailItems={detailItems}
              value={value}
              levels={levels}
              onSelect={handleSelect}
              onAdded={handleRefresh}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main list row ─────────────────────────────────────────────────────────

function MainRow({
  item,
  value,
  isHovered,
  onHover,
  onSelect,
}: {
  item: FlatItem;
  value: HierarchySelection;
  isHovered: boolean;
  onHover: (item: FlatItem) => void;
  onSelect: (s: HierarchySelection) => void;
}) {
  const scopeSelections = value.scopeSelections ?? {};

  const isSelected = (() => {
    if (item.kind === "org") return value.organizationId === item.id;
    if (item.kind === "scope")
      return scopeSelections[item.scopeTypeId ?? ""] === item.id;
    if (item.kind === "project") return value.projectId === item.id;
    if (item.kind === "task") return value.taskId === item.id;
    return false;
  })();

  const Icon: LucideIcon =
    item.kind === "org"
      ? Building2
      : item.kind === "project"
        ? FolderKanban
        : item.kind === "task"
          ? ListTodo
          : item.scopeIcon
            ? resolveIcon(item.scopeIcon)
            : Folder;

  const indentPx = item.kind === "task" ? 20 : 12;
  const iconColor =
    item.kind === "org"
      ? "text-violet-500"
      : item.kind === "project"
        ? "text-amber-500"
        : item.kind === "task"
          ? "text-sky-500"
          : undefined;

  const hasDetail =
    item.kind === "project" || item.kind === "org" || item.kind === "scope";

  return (
    <button
      className={cn(
        "w-full flex items-center gap-2 pr-2 py-1.5 text-left text-xs transition-colors group",
        isHovered
          ? "bg-accent"
          : isSelected
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted/60 text-foreground",
      )}
      style={{ paddingLeft: indentPx }}
      onMouseEnter={() => onHover(item)}
      onClick={() => onSelect(buildSelectionFromItem(item, scopeSelections))}
    >
      <Icon
        className={cn("h-3.5 w-3.5 shrink-0", !isSelected && iconColor)}
        style={
          item.kind === "scope" && item.scopeColor && !isSelected
            ? { color: item.scopeColor }
            : undefined
        }
      />
      <span className="flex-1 truncate min-w-0">{item.name}</span>

      {/* Context hint */}
      {item.kind === "project" && (item.scopePath?.length ?? 0) > 0 && (
        <span className="text-[9px] text-muted-foreground truncate max-w-[72px] shrink-0">
          {item.scopePath!.map((p) => p.scopeName).join(" · ")}
        </span>
      )}
      {item.kind === "task" && item.projectName && (
        <span className="text-[9px] text-muted-foreground truncate max-w-[72px] shrink-0">
          {item.projectName}
        </span>
      )}
      {item.kind === "scope" && item.scopeTypeLabel && (
        <span className="text-[9px] text-muted-foreground shrink-0">
          {item.scopeTypeLabel}
        </span>
      )}

      {/* Task count badge for projects */}
      {item.kind === "project" && (item.openTaskCount ?? 0) > 0 && (
        <span className="text-[9px] font-mono text-muted-foreground/60 shrink-0">
          {item.openTaskCount}
        </span>
      )}

      <StatusDot status={item.status} />
      {isSelected && <Check className="h-3 w-3 shrink-0 text-primary" />}
      {hasDetail && !isSelected && (
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/40 transition-opacity",
            isHovered ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        />
      )}
    </button>
  );
}

// ─── Detail / quick-add panel ─────────────────────────────────────────────

interface DetailPanelProps {
  item: FlatItem;
  detailItems: DetailItem[];
  value: HierarchySelection;
  levels: string[];
  onSelect: (s: HierarchySelection) => void;
  onAdded: () => void;
}

function DetailPanel({
  item,
  detailItems,
  value,
  levels,
  onSelect,
  onAdded,
}: DetailPanelProps) {
  const scopeSelections = value.scopeSelections ?? {};
  const dispatch = useAppDispatch();
  const createTask = useCreateTask();
  const createProject = useCreateProject();
  const orgsFromStore = useAppSelector(selectNavOrganizations);

  const [adding, setAdding] = useState<"task" | "project" | "scope" | null>(
    null,
  );
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(false);
  const [selectedScopeTypeId, setSelectedScopeTypeId] = useState("");
  // For "add task to scope": which project to attach the task to
  const [taskTargetProjectId, setTaskTargetProjectId] = useState("");

  const org = (orgsFromStore ?? []).find((o) => o.id === item.orgId);
  const scopeTypes = org?.scope_types ?? [];

  // Projects inside this scope (for task-target selector when hovering a scope)
  const scopeProjects =
    item.kind === "scope"
      ? detailItems.filter((d) => d.kind === "project")
      : [];

  // What project do tasks get added to when hovering a project directly?
  const directProjectId = item.kind === "project" ? item.id : null;
  const directProjectName = item.kind === "project" ? item.name : null;

  // Effective task target: direct project, or selected from scope's project list
  const effectiveTaskProjectId =
    directProjectId ??
    (taskTargetProjectId || scopeProjects[0]?.projectId) ??
    null;
  const effectiveTaskProjectName =
    directProjectName ??
    (taskTargetProjectId
      ? scopeProjects.find((p) => p.projectId === taskTargetProjectId)
          ?.projectName
      : scopeProjects[0]?.projectName) ??
    null;

  const canAddTask =
    levels.includes("task") &&
    (item.kind === "project" ||
      (item.kind === "scope" && scopeProjects.length > 0));
  const canAddProject =
    levels.includes("project") &&
    (item.kind === "org" || item.kind === "scope");
  const canAddScope =
    levels.includes("scope") && item.kind === "org" && scopeTypes.length > 0;

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setPending(true);
    try {
      if (adding === "task" && effectiveTaskProjectId) {
        await createTask.mutateAsync({
          title: newName.trim(),
          project_id: effectiveTaskProjectId,
          organization_id: item.orgId,
        });
      } else if (adding === "project" && item.orgId) {
        // Create project then immediately associate it with this scope (if hovering a scope)
        const newProject = await createProject.mutateAsync({
          name: newName.trim(),
          organization_id: item.orgId,
        });
        if (newProject?.id && item.kind === "scope" && item.id) {
          await dispatch(
            setEntityScopes({
              entity_type: "project",
              entity_id: newProject.id,
              scope_ids: [item.id],
            }),
          ).unwrap();
        }
      } else if (adding === "scope" && item.orgId && selectedScopeTypeId) {
        await dispatch(
          createScope({
            org_id: item.orgId,
            type_id: selectedScopeTypeId,
            name: newName.trim(),
          }),
        ).unwrap();
      }
      setNewName("");
      setAdding(null);
      onAdded();
    } catch {
      /* handled by mutation onError */
    } finally {
      setPending(false);
    }
  };

  // Header label for the panel
  const panelTitle =
    item.kind === "project"
      ? item.name
      : item.kind === "scope"
        ? `${item.scopeTypeLabel ?? "Scope"}: ${item.name}`
        : item.name;

  const panelIcon: LucideIcon =
    item.kind === "project"
      ? FolderKanban
      : item.kind === "org"
        ? Building2
        : item.scopeIcon
          ? resolveIcon(item.scopeIcon)
          : Folder;

  const PanelIcon = panelIcon;

  return (
    <div
      className="flex flex-col w-[260px] shrink-0"
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Panel header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 shrink-0 bg-muted/30">
        <PanelIcon
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          style={
            item.kind === "scope" && item.scopeColor
              ? { color: item.scopeColor }
              : undefined
          }
        />
        <span className="text-xs font-medium truncate flex-1">
          {panelTitle}
        </span>
        {item.kind === "project" && (
          <button
            className="text-xs text-primary hover:underline shrink-0"
            onClick={() =>
              onSelect(buildSelectionFromItem(item, scopeSelections))
            }
          >
            Select
          </button>
        )}
      </div>

      {/* Detail items */}
      <div
        className="overflow-y-auto flex-1"
        style={{ maxHeight: 280 }}
        onWheel={(e) => e.stopPropagation()}
      >
        {detailItems.length === 0 && !adding ? (
          <p className="py-4 text-center text-[10px] text-muted-foreground">
            {item.kind === "project" ? "No open tasks" : "No projects"}
          </p>
        ) : (
          <div className="py-1">
            {detailItems.map((di) => {
              const isSelected =
                di.kind === "task"
                  ? value.taskId === di.id
                  : di.kind === "project"
                    ? value.projectId === di.id
                    : false;

              const DIIcon: LucideIcon =
                di.kind === "task"
                  ? ListTodo
                  : di.kind === "project"
                    ? FolderKanban
                    : di.scopeIcon
                      ? resolveIcon(di.scopeIcon)
                      : Folder;

              const diSelection = (() => {
                if (di.kind === "task") {
                  const newScopes: Record<string, string> = {};
                  for (const tag of di.scopePath ?? [])
                    newScopes[tag.typeId] = tag.scopeId;
                  return {
                    organizationId: item.orgId,
                    organizationName: item.orgName,
                    projectId: di.projectId ?? null,
                    projectName: di.projectName ?? null,
                    taskId: di.id,
                    taskName: di.name,
                    scopeSelections: newScopes,
                  } satisfies HierarchySelection;
                }
                if (di.kind === "project") {
                  const newScopes: Record<string, string> = {};
                  for (const tag of di.scopePath ?? [])
                    newScopes[tag.typeId] = tag.scopeId;
                  return {
                    organizationId: item.orgId,
                    organizationName: item.orgName,
                    projectId: di.id,
                    projectName: di.name,
                    taskId: null,
                    taskName: null,
                    scopeSelections: newScopes,
                  } satisfies HierarchySelection;
                }
                return null;
              })();

              return (
                <button
                  key={di.id}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                    isSelected
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted/60",
                  )}
                  onClick={() => diSelection && onSelect(diSelection)}
                >
                  <DIIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{di.name}</span>
                  <StatusDot status={di.status} />
                  {isSelected && (
                    <Check className="h-3 w-3 shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick-add form */}
      <div className="border-t border-border/50 shrink-0">
        {adding ? (
          <div className="p-2 space-y-1.5">
            {/* Context label */}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Circle className="h-2 w-2 fill-current" />
              <span>
                Adding {adding} to{" "}
                <span className="font-medium text-foreground">
                  {adding === "task"
                    ? effectiveTaskProjectName
                    : adding === "project"
                      ? item.name
                      : item.orgName}
                </span>
              </span>
            </div>

            {/* When adding a task to a scope, let user pick which project */}
            {adding === "task" &&
              item.kind === "scope" &&
              scopeProjects.length > 1 && (
                <select
                  className="w-full h-7 rounded border border-border bg-background text-xs px-2"
                  value={taskTargetProjectId || scopeProjects[0]?.projectId}
                  onChange={(e) => setTaskTargetProjectId(e.target.value)}
                >
                  {scopeProjects.map((p) => (
                    <option key={p.projectId} value={p.projectId ?? ""}>
                      {p.projectName}
                    </option>
                  ))}
                </select>
              )}

            {adding === "scope" && scopeTypes.length > 0 && (
              <select
                className="w-full h-7 rounded border border-border bg-background text-xs px-2"
                value={selectedScopeTypeId}
                onChange={(e) => setSelectedScopeTypeId(e.target.value)}
              >
                <option value="">— Select type —</option>
                {scopeTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label_singular}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={
                  adding === "task"
                    ? "Task title..."
                    : adding === "project"
                      ? "Project name..."
                      : "Scope name..."
                }
                className="h-7 text-xs flex-1"
                style={{ fontSize: "16px" }}
                autoFocus
                disabled={pending}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                  if (e.key === "Escape") {
                    setAdding(null);
                    setNewName("");
                  }
                }}
              />
              <Button
                size="sm"
                className="h-7 px-2 text-xs shrink-0"
                onClick={handleAdd}
                disabled={
                  pending ||
                  !newName.trim() ||
                  (adding === "scope" && !selectedScopeTypeId) ||
                  (adding === "task" && !effectiveTaskProjectId)
                }
              >
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
              </Button>
              <button
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted shrink-0"
                onClick={() => {
                  setAdding(null);
                  setNewName("");
                }}
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          </div>
        ) : (
          <div className="px-2 py-1.5 flex items-center gap-1 flex-wrap">
            {canAddTask && (
              <button
                className="flex items-center gap-1 px-2 h-6 rounded text-[10px] text-muted-foreground hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30 transition-colors"
                onClick={() => {
                  setTaskTargetProjectId(scopeProjects[0]?.projectId ?? "");
                  setAdding("task");
                }}
              >
                <Plus className="h-3 w-3" />
                Add task
              </button>
            )}
            {canAddProject && (
              <button
                className="flex items-center gap-1 px-2 h-6 rounded text-[10px] text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                onClick={() => setAdding("project")}
              >
                <Plus className="h-3 w-3" />
                Add project
              </button>
            )}
            {canAddScope && (
              <button
                className="flex items-center gap-1 px-2 h-6 rounded text-[10px] text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                onClick={() => {
                  setAdding("scope");
                  setSelectedScopeTypeId(scopeTypes[0]?.id ?? "");
                }}
              >
                <Plus className="h-3 w-3" />
                Add scope
              </button>
            )}
            {!canAddTask && !canAddProject && !canAddScope && (
              <span className="text-[10px] text-muted-foreground px-1">
                {item.kind === "task" ? "Select to use" : "Nothing to add here"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Footer: global add new ───────────────────────────────────────────────

interface AddNewFooterProps {
  levels: string[];
  orgs: { id: string; name: string }[];
  selectedOrgId: string | null;
  selectedProjectId: string | null;
  onAdded: () => void;
}

function AddNewFooter({
  levels,
  orgs,
  selectedOrgId,
  selectedProjectId,
  onAdded,
}: AddNewFooterProps) {
  const dispatch = useAppDispatch();
  const createProject = useCreateProject();
  const createTask = useCreateTask();
  const orgsFromStore = useAppSelector(selectNavOrganizations);

  const [adding, setAdding] = useState<"project" | "task" | "scope" | null>(
    null,
  );
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState(false);
  const [selectedScopeTypeId, setSelectedScopeTypeId] = useState("");

  const orgId = selectedOrgId ?? orgs[0]?.id ?? null;
  const selectedOrg = orgsFromStore?.find((o) => o.id === orgId);
  const scopeTypes = selectedOrg?.scope_types ?? [];

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setPending(true);
    try {
      if (adding === "project" && orgId) {
        await createProject.mutateAsync({
          name: newName.trim(),
          organization_id: orgId,
        });
      } else if (adding === "task" && selectedProjectId) {
        await createTask.mutateAsync({
          title: newName.trim(),
          project_id: selectedProjectId,
          organization_id: orgId ?? "",
        });
      } else if (adding === "scope" && orgId && selectedScopeTypeId) {
        await dispatch(
          createScope({
            org_id: orgId,
            type_id: selectedScopeTypeId,
            name: newName.trim(),
          }),
        ).unwrap();
      }
      setNewName("");
      setAdding(null);
      onAdded();
    } catch {
      /* onError handles it */
    } finally {
      setPending(false);
    }
  };

  if (adding) {
    return (
      <div className="border-t border-border/50 p-2 space-y-1.5 shrink-0">
        {/* Always show what we're adding to */}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Circle className="h-2 w-2 fill-current" />
          Adding {adding} to{" "}
          <span className="font-medium text-foreground truncate max-w-[140px]">
            {adding === "task"
              ? (orgsFromStore
                  ?.flatMap((o) => o.projects)
                  .find((p) => p.id === selectedProjectId)?.name ??
                selectedProjectId)
              : (selectedOrg?.name ?? orgId)}
          </span>
        </div>

        {adding === "scope" && scopeTypes.length > 0 && (
          <select
            className="w-full h-7 rounded border border-border bg-background text-xs px-2"
            value={selectedScopeTypeId}
            onChange={(e) => setSelectedScopeTypeId(e.target.value)}
          >
            <option value="">— Select type —</option>
            {scopeTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label_singular}
              </option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-1.5">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={
              adding === "project"
                ? "Project name..."
                : adding === "task"
                  ? "Task title..."
                  : "Scope name..."
            }
            className="h-7 text-xs flex-1"
            style={{ fontSize: "16px" }}
            autoFocus
            disabled={pending}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") {
                setAdding(null);
                setNewName("");
              }
            }}
          />
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleAdd}
            disabled={
              pending ||
              !newName.trim() ||
              (adding === "scope" && !selectedScopeTypeId)
            }
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
          </Button>
          <button
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted"
            onClick={() => {
              setAdding(null);
              setNewName("");
            }}
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border/50 p-1.5 flex items-center gap-1 flex-wrap shrink-0">
      {levels.includes("project") && orgId && (
        <button
          className="flex items-center gap-1 px-2 h-6 rounded text-[10px] text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
          onClick={() => setAdding("project")}
        >
          <Plus className="h-3 w-3" /> Project
        </button>
      )}
      {levels.includes("task") && selectedProjectId && (
        <button
          className="flex items-center gap-1 px-2 h-6 rounded text-[10px] text-muted-foreground hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30 transition-colors"
          onClick={() => setAdding("task")}
        >
          <Plus className="h-3 w-3" /> Task
        </button>
      )}
      {levels.includes("scope") && orgId && scopeTypes.length > 0 && (
        <button
          className="flex items-center gap-1 px-2 h-6 rounded text-[10px] text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
          onClick={() => {
            setAdding("scope");
            setSelectedScopeTypeId(scopeTypes[0]?.id ?? "");
          }}
        >
          <Plus className="h-3 w-3" /> Scope
        </button>
      )}
    </div>
  );
}

function EmptyState({ search }: { search: string }) {
  return (
    <p className="py-6 text-center text-xs text-muted-foreground">
      {search ? `No results for "${search}"` : "Nothing here yet"}
    </p>
  );
}
