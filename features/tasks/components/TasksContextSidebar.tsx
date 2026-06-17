"use client";

import React, { useMemo, useState } from "react";
import {
  Search,
  X,
  Inbox,
  AlertCircle,
  Layers,
  ArrowUpDown,
  Eye,
  EyeOff,
  Building,
  FolderKanban,
  ListChecks,
  Flag,
  CalendarClock,
  CircleDashed,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";
import * as icons from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectProjects,
  selectValidProjectIds,
} from "@/features/tasks/redux/selectors";
import { TASK_GROUP_BY_LABELS } from "@/features/tasks/constants/groupBy";
import {
  selectSearchQuery,
  selectTaskFilter,
  selectShowCompleted,
  selectGroupBy,
  selectSortBy,
  selectSortOrder,
  selectActiveProject,
  selectShowAllProjects,
  setSearchQuery,
  setFilter,
  setShowCompleted,
  setGroupBy,
  setSortBy,
  toggleSortOrder,
  setActiveProject,
  setShowAllProjects,
  type TaskGroupBy,
} from "@/features/tasks/redux/taskUiSlice";
import type { TaskFilterType } from "@/features/tasks/types";
import type { TaskSortField } from "@/features/tasks/types/sort";
import { TASK_SORT_OPTIONS } from "@/features/tasks/types/sort";
import {
  selectOrganizationId,
  selectScopeSelectionsContext,
  setOrganization,
  setScopeSelections,
} from "@/lib/redux/slices/appContextSlice";
import {
  selectAllScopeTypesFlat,
  selectAllScopesFlat,
  selectOrganizationsList,
} from "@/features/scopes/redux/selectors/tree";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/utils/cn";

type LucideIcon = React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
}>;

function resolveIcon(name: string | undefined): LucideIcon {
  if (!name) return CircleDashed;
  const pascal = name
    .split(/[-_\s]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  const Icon = (icons as unknown as Record<string, LucideIcon>)[pascal];
  return Icon ?? CircleDashed;
}

const GROUP_MODES: { mode: TaskGroupBy; label: string; icon: LucideIcon }[] = [
  { mode: "project", label: TASK_GROUP_BY_LABELS.project, icon: FolderKanban },
  { mode: "scope", label: TASK_GROUP_BY_LABELS.scope, icon: Layers },
  { mode: "priority", label: TASK_GROUP_BY_LABELS.priority, icon: Flag },
  { mode: "status", label: TASK_GROUP_BY_LABELS.status, icon: ListChecks },
  { mode: "dueDate", label: TASK_GROUP_BY_LABELS.dueDate, icon: CalendarClock },
  { mode: "none", label: TASK_GROUP_BY_LABELS.none, icon: Inbox },
];

const Circle = ({ size = 14 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="12" cy="12" r="10" />
  </svg>
);

function filterIcon(filter: TaskFilterType) {
  switch (filter) {
    case "all":
      return <Inbox size={14} />;
    case "incomplete":
      return <Circle size={14} />;
    case "overdue":
      return <AlertCircle size={14} />;
  }
}

export default function TasksContextSidebar() {
  const dispatch = useAppDispatch();

  // Search / filter / display
  const searchQuery = useAppSelector(selectSearchQuery);
  const filter = useAppSelector(selectTaskFilter);
  const showCompleted = useAppSelector(selectShowCompleted);

  // Context (all orgs/scopes/projects, unfiltered)
  const orgId = useAppSelector(selectOrganizationId);
  const orgs = useAppSelector(selectOrganizationsList);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const allScopeTypes = useAppSelector(selectAllScopeTypesFlat);
  const allScopes = useAppSelector(selectAllScopesFlat);

  // Derived: which projects are valid under current filter (null = no filter)
  const validProjectIds = useAppSelector(selectValidProjectIds);

  // Groups / sort / projects (UI state)
  const groupBy = useAppSelector(selectGroupBy);
  const sortBy = useAppSelector(selectSortBy);
  const sortOrder = useAppSelector(selectSortOrder);
  const activeProject = useAppSelector(selectActiveProject);
  const showAllProjects = useAppSelector(selectShowAllProjects);
  const derivedProjects = useAppSelector(selectProjects);

  // Scope types are dimmed when another org is selected (not applicable)
  // Scopes are dimmed when org selected AND their type belongs to another org
  // Projects are dimmed when they don't appear in validProjectIds

  // Group scope types by org for nicer display when no org selected and
  // multiple orgs present. If one org is selected, show its types only as
  // active; others appear dimmed.
  const scopeTypesOrdered = useMemo(() => {
    const arr = [...allScopeTypes].sort((a, b) => {
      // Put current-org types first
      if (orgId) {
        if (a.organization_id === orgId && b.organization_id !== orgId)
          return -1;
        if (b.organization_id === orgId && a.organization_id !== orgId)
          return 1;
      }
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    return arr;
  }, [allScopeTypes, orgId]);

  // Scopes grouped by scope type id
  const scopesByType = useMemo(() => {
    const map = new Map<string, typeof allScopes>();
    for (const t of allScopeTypes) {
      map.set(
        t.id,
        allScopes.filter((s) => s.scope_type_id === t.id),
      );
    }
    return map;
  }, [allScopeTypes, allScopes]);

  const handleSelectScope = (typeId: string, scopeId: string | null) => {
    const next = { ...scopeSelections };
    if (scopeId) next[typeId] = scopeId;
    else delete next[typeId];
    dispatch(setScopeSelections(next));
  };

  const handleSelectOrg = (id: string | null) => {
    const org = id ? (orgs ?? []).find((o) => o.id === id) : null;
    dispatch(setOrganization({ id, name: org?.name ?? null }));
  };

  const activeGroupLabel =
    TASK_GROUP_BY_LABELS[groupBy] ?? TASK_GROUP_BY_LABELS.none;
  const activeSortLabel =
    TASK_SORT_OPTIONS.find((o) => o.field === sortBy)?.label ?? "Last Updated";
  const activeOrgName = orgId
    ? ((orgs ?? []).find((o) => o.id === orgId)?.name ?? "Organization")
    : "All Organizations";
  const activeProjectName = showAllProjects
    ? "All Projects"
    : (derivedProjects.find((p) => p.id === activeProject)?.name ??
      "All Projects");

  return (
    <div className="flex flex-col h-full min-h-0 bg-card">
      {/* Search — page title lives in the shell header (PageHeader) */}
      <div className="shrink-0 px-2 pt-2 pb-1">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded-md border border-border/30">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => dispatch(setSearchQuery(e.target.value))}
            placeholder="Search tasks..."
            className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
            style={{ fontSize: "16px" }}
          />
          {searchQuery && (
            <button
              onClick={() => dispatch(setSearchQuery(""))}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* View — group, sort, show completed (pinned to top) */}
        <CollapsibleSidebarSection
          icon={SlidersHorizontal}
          title="View"
          defaultOpen
          summary={`${activeGroupLabel} · ${activeSortLabel} ${sortOrder === "desc" ? "↓" : "↑"}${showCompleted ? " · +done" : ""}`}
        >
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Group
            </span>
            {GROUP_MODES.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.mode}
                  onClick={() => dispatch(setGroupBy(m.mode))}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors",
                    groupBy === m.mode
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                  title={`Group by ${m.label}`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-1.5 flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Sort
            </span>
            {TASK_SORT_OPTIONS.map((opt) => {
              const isActive = sortBy === opt.field;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.field}
                  onClick={() =>
                    dispatch(setSortBy(opt.field as TaskSortField))
                  }
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors",
                    isActive
                      ? "text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                >
                  <Icon className="w-3 h-3" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
            <button
              onClick={() => dispatch(toggleSortOrder())}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title={sortOrder === "desc" ? "Descending" : "Ascending"}
            >
              <ArrowUpDown className="w-3 h-3" />
              <span>{sortOrder === "desc" ? "↓" : "↑"}</span>
            </button>
          </div>

          <div className="mt-1.5 flex items-center justify-between px-1.5 py-1 rounded bg-muted/30">
            <span className="flex items-center gap-1.5 text-[11px] text-foreground">
              {showCompleted ? (
                <Eye className="w-3 h-3 text-muted-foreground" />
              ) : (
                <EyeOff className="w-3 h-3 text-muted-foreground" />
              )}
              Show completed
            </span>
            <Switch
              checked={showCompleted}
              onCheckedChange={(v) => dispatch(setShowCompleted(!!v))}
              className="data-[state=checked]:bg-primary h-4 w-7 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
            />
          </div>
        </CollapsibleSidebarSection>

        {/* Quick filters */}
        <CollapsibleSidebarSection
          icon={Inbox}
          title="Filter"
          summary={<span className="capitalize">{filter}</span>}
        >
          <div className="flex gap-1">
            {(["all", "incomplete", "overdue"] as TaskFilterType[]).map((f) => (
              <button
                key={f}
                onClick={() => {
                  dispatch(setFilter(f));
                  if (!showAllProjects && !activeProject)
                    dispatch(setShowAllProjects(true));
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[11px] capitalize transition-colors",
                  filter === f
                    ? "text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                {filterIcon(f)}
                <span>{f}</span>
              </button>
            ))}
          </div>
        </CollapsibleSidebarSection>

        {/* Context: Organizations */}
        <CollapsibleSidebarSection
          icon={Building}
          iconClassName="text-violet-500"
          title="Organization"
          summary={activeOrgName}
          headerAction={
            orgId ? (
              <button
                type="button"
                onClick={() => handleSelectOrg(null)}
                className="shrink-0 p-0.5 opacity-50 hover:opacity-100"
                title="Show all organizations"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            ) : undefined
          }
        >
          <div className="space-y-0.5">
            <AllRow
              label="All Organizations"
              active={!orgId}
              count={(orgs ?? []).length}
              onClick={() => handleSelectOrg(null)}
              accentColor="text-violet-500"
            />
            {(orgs ?? []).map((o) => (
              <ContextRow
                key={o.id}
                label={o.name}
                active={orgId === o.id}
                dimmed={
                  false /* orgs are never dimmed — picking one is always valid */
                }
                accentColor="text-violet-500"
                onClick={() => handleSelectOrg(orgId === o.id ? null : o.id)}
              />
            ))}
          </div>
        </CollapsibleSidebarSection>

        {/* Context: each scope type with explicit clickable scopes */}
        {scopeTypesOrdered.map((type) => {
          const Icon = resolveIcon(type.icon);
          const opts = scopesByType.get(type.id) ?? [];
          const selectedId = scopeSelections[type.id] ?? null;
          const typeBelongsToActiveOrg =
            !orgId || type.organization_id === orgId;

          const selectedScopeName = selectedId
            ? (opts.find((s) => s.id === selectedId)?.name ??
              `All ${type.label_plural}`)
            : `All ${type.label_plural}`;

          return (
            <CollapsibleSidebarSection
              key={type.id}
              icon={Icon}
              iconStyle={type.color ? { color: type.color } : undefined}
              title={type.label_plural}
              titleStyle={type.color ? { color: type.color } : undefined}
              titleMuted={!typeBelongsToActiveOrg}
              summary={selectedScopeName}
              headerAction={
                selectedId ? (
                  <button
                    type="button"
                    onClick={() => handleSelectScope(type.id, null)}
                    className="shrink-0 p-0.5 opacity-50 hover:opacity-100"
                    title={`Show all ${type.label_plural.toLowerCase()}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                ) : undefined
              }
            >
              <div className="space-y-0.5">
                <AllRow
                  label={`All ${type.label_plural}`}
                  active={!selectedId}
                  count={opts.length}
                  dimmed={!typeBelongsToActiveOrg}
                  onClick={() =>
                    typeBelongsToActiveOrg && handleSelectScope(type.id, null)
                  }
                  accentColor={type.color}
                />
                {opts.map((scope) => {
                  // A scope is dimmed if its org doesn't match the current
                  // active org selection. If no org selected, all scopes are
                  // active.
                  const dimmed = !!orgId && scope.organization_id !== orgId;
                  const isActive = selectedId === scope.id;
                  return (
                    <ContextRow
                      key={scope.id}
                      label={scope.name}
                      active={isActive}
                      dimmed={dimmed}
                      accentColor={type.color}
                      dotColor={type.color}
                      onClick={() =>
                        !dimmed &&
                        handleSelectScope(type.id, isActive ? null : scope.id)
                      }
                    />
                  );
                })}
              </div>
            </CollapsibleSidebarSection>
          );
        })}

        {/* Projects — always show all, dim those that don't match */}
        <CollapsibleSidebarSection
          icon={FolderKanban}
          iconClassName="text-amber-500"
          title="Projects"
          summary={activeProjectName}
        >
          <div className="space-y-0.5">
            <AllRow
              label="All Projects"
              active={showAllProjects}
              count={derivedProjects.reduce((s, p) => s + p.tasks.length, 0)}
              onClick={() => {
                dispatch(setShowAllProjects(true));
                dispatch(setActiveProject(null));
              }}
              accentColor="text-amber-500"
            />
            {derivedProjects.map((p) => {
              const isActive = activeProject === p.id && !showAllProjects;
              const dimmed =
                validProjectIds !== null && !validProjectIds.has(p.id);
              return (
                <ContextRow
                  key={p.id}
                  label={p.name}
                  active={isActive}
                  dimmed={dimmed}
                  accentColor="text-amber-500"
                  trailing={
                    <span className="tabular-nums text-[10px] opacity-60">
                      {p.tasks.length}
                    </span>
                  }
                  onClick={() => {
                    if (dimmed) return;
                    dispatch(setActiveProject(p.id));
                    dispatch(setShowAllProjects(false));
                  }}
                />
              );
            })}
          </div>
        </CollapsibleSidebarSection>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function CollapsibleSidebarSection({
  icon: Icon,
  iconClassName,
  iconStyle,
  title,
  titleStyle,
  titleMuted,
  summary,
  headerAction,
  defaultOpen = false,
  children,
}: {
  icon: LucideIcon;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
  title: string;
  titleStyle?: React.CSSProperties;
  titleMuted?: boolean;
  summary: React.ReactNode;
  headerAction?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="px-2 py-1 border-t border-border/30 first:border-t-0">
      <div className="flex items-center gap-0.5 min-h-[28px]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-1.5 px-1 py-0.5 min-w-0 text-left rounded hover:bg-accent/50 transition-colors"
        >
          <Icon
            className={cn(
              "w-3.5 h-3.5 shrink-0",
              iconClassName,
              titleMuted && "opacity-40",
            )}
            style={iconStyle}
          />
          <span
            className={cn(
              "text-xs font-semibold uppercase tracking-wide shrink-0",
              !titleStyle && "text-muted-foreground",
              titleMuted && "opacity-40",
            )}
            style={titleStyle}
          >
            {title}
          </span>
          {!open && (
            <span className="flex-1 min-w-0 text-xs text-foreground truncate text-right">
              {summary}
            </span>
          )}
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        {headerAction}
      </div>
      {open && <div className="pb-0.5">{children}</div>}
    </section>
  );
}

function AllRow({
  label,
  active,
  count,
  dimmed,
  onClick,
  accentColor,
}: {
  label: string;
  active: boolean;
  count?: number;
  dimmed?: boolean;
  onClick: () => void;
  accentColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={dimmed}
      className={cn(
        "w-full flex items-center gap-1.5 px-2 py-0.5 rounded text-xs italic transition-colors",
        active
          ? "bg-primary/10 text-primary font-medium"
          : dimmed
            ? "text-muted-foreground/40 cursor-not-allowed"
            : "text-foreground/80 hover:bg-accent",
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full shrink-0 opacity-70",
          active ? "bg-primary" : "bg-muted-foreground/50",
        )}
      />
      <span className="truncate text-left flex-1">{label}</span>
      {typeof count === "number" && (
        <span className="tabular-nums text-[10px] opacity-60">{count}</span>
      )}
    </button>
  );
}

function ContextRow({
  label,
  active,
  dimmed,
  onClick,
  trailing,
  dotColor,
}: {
  label: string;
  active: boolean;
  dimmed?: boolean;
  accentColor?: string;
  onClick: () => void;
  trailing?: React.ReactNode;
  dotColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={dimmed}
      className={cn(
        "w-full flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-colors",
        active
          ? "bg-primary/10 text-primary font-medium"
          : dimmed
            ? "text-muted-foreground/40 cursor-not-allowed"
            : "text-foreground/85 hover:bg-accent",
      )}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{
          backgroundColor: dotColor ?? "currentColor",
          opacity: dimmed ? 0.3 : active ? 1 : 0.5,
        }}
      />
      <span className="truncate text-left flex-1">{label}</span>
      {trailing}
    </button>
  );
}
