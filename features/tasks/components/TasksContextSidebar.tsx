"use client";

import React, { useMemo } from "react";
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
} from "lucide-react";
import * as icons from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectProjects,
  selectValidProjectIds,
} from "@/features/tasks/redux/selectors";
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
  selectOrganizationName,
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
  { mode: "project", label: "Project", icon: FolderKanban },
  { mode: "scope", label: "Scope", icon: Layers },
  { mode: "priority", label: "Priority", icon: Flag },
  { mode: "status", label: "Status", icon: ListChecks },
  { mode: "dueDate", label: "Due", icon: CalendarClock },
  { mode: "none", label: "Flat", icon: Inbox },
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
        {/* Quick filters */}
        <section className="px-2 py-1.5">
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
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                {filterIcon(f)}
                <span>{f}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Context: Organizations */}
        <section className="px-2 py-1.5 border-t border-border/30">
          <div className="flex items-center gap-1.5 px-1 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
            <Building className="w-3 h-3 text-violet-500" />
            <span>Organization</span>
            {orgId && (
              <button
                onClick={() => handleSelectOrg(null)}
                className="ml-auto opacity-50 hover:opacity-100"
                title="Show all organizations"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
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
        </section>

        {/* Context: each scope type with explicit clickable scopes */}
        {scopeTypesOrdered.map((type) => {
          const Icon = resolveIcon(type.icon);
          const opts = scopesByType.get(type.id) ?? [];
          const selectedId = scopeSelections[type.id] ?? null;
          const typeBelongsToActiveOrg =
            !orgId || type.organization_id === orgId;

          return (
            <section
              key={type.id}
              className="px-2 py-1.5 border-t border-border/30"
            >
              <div className="flex items-center gap-1.5 px-1 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                <Icon
                  className="w-3 h-3"
                  style={type.color ? { color: type.color } : undefined}
                />
                <span className={cn(!typeBelongsToActiveOrg && "opacity-40")}>
                  {type.label_plural}
                </span>
                {selectedId && (
                  <button
                    onClick={() => handleSelectScope(type.id, null)}
                    className="ml-auto opacity-50 hover:opacity-100"
                    title={`Show all ${type.label_plural.toLowerCase()}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
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
            </section>
          );
        })}

        {/* Projects — always show all, dim those that don't match */}
        <section className="px-2 py-1.5 border-t border-border/30">
          <div className="flex items-center gap-1.5 px-1 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
            <FolderKanban className="w-3 h-3 text-amber-500" />
            <span>Projects</span>
          </div>
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
        </section>

        {/* Group + Sort */}
        <section className="px-2 py-1.5 border-t border-border/30">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-1">
            View
          </div>

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
                      ? "bg-primary/10 text-primary"
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
                      ? "bg-primary/10 text-primary"
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
        </section>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

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
