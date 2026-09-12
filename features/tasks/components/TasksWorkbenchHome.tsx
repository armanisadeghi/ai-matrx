"use client";

import { useMemo } from "react";
import { Building2, Layers, ListTodo } from "lucide-react";
import {
  MetricNavigation,
  type MetricNavigationItem,
} from "@/components/navigation/MetricNavigation";
import { Button } from "@/components/ui/button";
import TasksTableView from "@/features/tasks/components/TasksTableView";
import { SMART_VIEWS } from "@/features/tasks/constants/smartViews";
import {
  selectProjects,
  selectSmartViewCounts,
} from "@/features/tasks/redux/selectors";
import {
  selectSmartView,
  setSelectedTaskId,
  setSmartView,
} from "@/features/tasks/redux/taskUiSlice";
import TaskQuickAddBar from "@/features/tasks/widgets/TaskQuickAddBar";
import {
  selectAllScopesFlat,
  selectAllScopeTypesFlat,
  selectOrganizationsList,
} from "@/features/scopes/redux/selectors/tree";
import { primaryNavItems } from "@/features/shell/constants/nav-data";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";
import { cn } from "@/utils/cn";

/** Root-only composition for the empty desktop editor pane. */
export function TasksWorkbenchHome() {
  const dispatch = useAppDispatch();
  const smartView = useAppSelector(selectSmartView);
  const smartViewCounts = useAppSelector(selectSmartViewCounts);
  const orgId = useAppSelector(selectOrganizationId);
  const organizations = useAppSelector(selectOrganizationsList);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);
  const scopeTypes = useAppSelector(selectAllScopeTypesFlat);
  const scopes = useAppSelector(selectAllScopesFlat);
  const projects = useAppSelector(selectProjects);

  const organizationName =
    organizations.find((organization) => organization.id === orgId)?.name ??
    "All organizations";
  const selectedScopes = useMemo(
    () =>
      Object.values(scopeSelections)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .map((scopeId) => {
          const scope = scopes.find((candidate) => candidate.id === scopeId);
          const type = scopeTypes.find(
            (candidate) => candidate.id === scope?.scope_type_id,
          );
          return scope
            ? `${type?.label_singular ?? "Scope"}: ${scope.name}`
            : null;
        })
        .filter((label): label is string => label !== null),
    [scopeSelections, scopes, scopeTypes],
  );

  const workspaceDestinations = useMemo<MetricNavigationItem[]>(() => {
    const workspace = primaryNavItems.find(
      (item) => item.label === "Workspaces",
    );
    return (workspace?.children ?? [])
      .filter((item) => !item.action && !item.actionItem && !item.panelAction)
      .map((item) => ({
        key: item.href,
        label: item.label,
        href: item.href,
        iconName: item.iconName,
        color: item.color ?? workspace?.color,
        description: item.description,
      }));
  }, []);

  return (
    <section
      aria-label="Task workbench"
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <div className="shrink-0 border-b border-border/60 bg-card/40 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Task workbench
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Building2 className="size-3.5 shrink-0" />
                <span className="truncate">{organizationName}</span>
              </span>
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Layers className="size-3.5 shrink-0" />
                <span className="truncate">
                  {selectedScopes.length > 0
                    ? selectedScopes.join(" · ")
                    : "All scope dimensions"}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ListTodo className="size-3.5 shrink-0" />
                {projects.length} project{projects.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <div className="w-full sm:w-[18rem]">
            <TaskQuickAddBar
              placeholder="Quick add a task…"
              onCreated={(taskId) => dispatch(setSelectedTaskId(taskId))}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Task views">
          {SMART_VIEWS.map((view) => {
            const Icon = view.icon;
            const active = view.key === smartView;
            return (
              <Button
                key={view.key}
                type="button"
                variant={active ? "secondary" : "ghost"}
                size="sm"
                title={view.description}
                onClick={() => dispatch(setSmartView(view.key))}
                className={cn(
                  "h-8 gap-1.5 px-2 text-xs",
                  active && "bg-primary/10 text-primary hover:bg-primary/15",
                )}
              >
                <Icon className="size-3.5" />
                <span>{view.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {smartViewCounts[view.key]}
                </span>
              </Button>
            );
          })}
        </div>

        <MetricNavigation
          label="Workspace destinations"
          items={workspaceDestinations.map((item) =>
            item.href === "/tasks"
              ? {
                  ...item,
                  value: smartViewCounts.all,
                  description: "Open tasks in the current organization",
                }
              : item,
          )}
          className="mt-3"
        />
      </div>

      <div className="min-h-0 flex-1">
        <TasksTableView />
      </div>
    </section>
  );
}
